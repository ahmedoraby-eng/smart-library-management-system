/**
 * `npm run demo:video:live`: records the final demo (SLM-11, SLM-17) on the deployed site and lays the narration over
 * it. The eight scenes follow the video script; each scene lasts as long as its narration clip `scene-N.m4a`.
 *
 *   SLM_ADMIN_EMAIL, SLM_ADMIN_PASSWORD, SLM_LIBRARIAN_EMAIL, SLM_LIBRARIAN_PASSWORD   the demo staff accounts (required;
 *     read from the environment only, never printed or logged)
 *   --audio <dir>   the clips scene-1.m4a … scene-8.m4a (default ~/Code/slm-ops/video/voice); a missing clip leaves that
 *                   scene silent at a default length
 *   --out <dir>     also copy the final MP4 there
 *   SLM_LIVE_URL    another deployment (default https://smart-library.ahmedoraby.workers.dev)
 *   DEMO_GOOGLE=1   scene 2 also points at the "Sign in with Google" button (once SLM-8 is live)
 *   --google-clip <file.mov | dir>   a screen recording of the Google sign-in (Ahmed records it by hand: agents have no
 *                   Google account and never type passwords), spliced into scene 2 under its last sentence. A folder
 *                   means the newest "Screen Recording*.mov" in it. google-clip.swift blurs every email address first
 *                   and stops the run if one is still readable, before anything is recorded.
 *   --google-args "<flags>"   extra google-clip flags, e.g. "--trim 1,14 --crop 0,0.05,1,0.95 --cover 0.7,0,0.3,0.1"
 *   --cues <file.json>   when things happen in each scene, in seconds from the scene's start ({"3": {"add": 9.3}, …}),
 *                   from the voice edit, so the screen follows the narration; without it, fixed shares of each scene
 *   --google-prepared <file.mp4>   a clip google-clip.swift has already prepared (blurred and checked): used as is
 *   --extras        also film the extra scenes 9–11 after scene 5 (as the demo admin): delete a book safely, add a book
 *                   by ISBN, the desk rules. Until their clips (scene-9.m4a …) exist they are left out of the main cut
 *                   and written to extras-preview.mp4.
 *   --reuse         skip the recording: lay the narration (and the Google clip) over the last recorded run again
 *
 * Before recording, the admin account resets the demo data and rebuilds the search index; afterwards it resets again,
 * so the site is left as a reviewer expects it. Output: test-results/demo-video/smart-library-demo-live.mp4.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { type APIRequestContext, type BrowserContext, chromium, type Page } from "@playwright/test";
import { click, encodeMp4, glide, root, say, sleep, SPEED, swiftTool, typeInto } from "./lib";
import { captionScript, cardPage, PANE, pairPage } from "./stage";

const LIVE = (process.env.SLM_LIVE_URL ?? "https://smart-library.ahmedoraby.workers.dev").replace(/\/$/, "");
const REPO = "https://github.com/ahmedoraby-eng/smart-library-management-system";
const W = 1600;
const H = 900;
// Filmed at 1600×900 (Playwright pads, rather than scales, a smaller viewport into a bigger video); assemble.swift
// scales every shot to 1920×1080.
const FPS = 20;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1]?.replace(/^~/, homedir()) : undefined;
};
const audioDir = arg("--audio") ?? join(homedir(), "Code/slm-ops/video/voice");
const extraOut = arg("--out");
const outDir = join(root, "test-results/demo-video");

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k} (the demo staff accounts are read from the environment only).`);
  return v;
};
const reuse = process.argv.includes("--reuse");
const none = { email: "", password: "\u0000" };
const admin = reuse ? none : { email: env("SLM_ADMIN_EMAIL"), password: env("SLM_ADMIN_PASSWORD") };
const librarian = reuse ? none : { email: env("SLM_LIBRARIAN_EMAIL"), password: env("SLM_LIBRARIAN_PASSWORD") };
/** Every message this script prints goes through here, so a password can never reach the terminal or a log. */
const redact = (s: string) => [admin.password, librarian.password].reduce((acc, p) => acc.split(p).join("***"), s);
const log = (s: string) => console.log(redact(s));

// ---- narration: scene N lasts as long as scene-N.m4a ----
const DEFAULT_S = [25, 20, 60, 50, 55, 20, 35, 20, 13, 13, 13]; // the script's timings, for a scene without a clip
/** Scenes 9–11 (delete safely, ISBN look-up, desk rules) are filmed after scene 5 with --extras. */
const extras = process.argv.includes("--extras");
function clipSeconds(n: number): number {
  const f = join(audioDir, `scene-${n}.m4a`);
  if (!existsSync(f)) return DEFAULT_S[n - 1]!;
  const m = /estimated duration: ([\d.]+)/.exec(execFileSync("afinfo", [f], { encoding: "utf8" }));
  return m ? Number(m[1]) : DEFAULT_S[n - 1]!;
}
const clips = DEFAULT_S.map((_, i) => clipSeconds(i + 1));

// ---- the hand-recorded Google sign-in clip for scene 2 ----
function googleClipSource(): string | undefined {
  const g = arg("--google-clip");
  if (!g) return undefined;
  if (!existsSync(g)) throw new Error(`--google-clip: ${g} does not exist`);
  if (!statSync(g).isDirectory()) return g;
  const movs = readdirSync(g)
    .filter((f) => f.startsWith("Screen Recording") && f.endsWith(".mov"))
    .map((f) => join(g, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!movs[0]) throw new Error(`--google-clip: no "Screen Recording*.mov" in ${g}`);
  return movs[0];
}
/** Blurs the clip's email addresses and sizes it like the scenes; throws if an address is still readable. */
function prepareGoogleClip(work: string): string | undefined {
  // Already cut, blurred and checked by google-clip.swift (e.g. with several --keep ranges): used as it is.
  const ready = arg("--google-prepared");
  if (ready) {
    if (!existsSync(ready)) throw new Error(`--google-prepared: ${ready} does not exist`);
    return ready;
  }
  const src = googleClipSource();
  if (!src) return undefined;
  const tool = swiftTool("google-clip", work);
  if (!tool) throw new Error("--google-clip needs swiftc (Xcode command line tools)");
  const out = join(outDir, "google-clip.mp4");
  const extra = (arg("--google-args") ?? "").split(/\s+/).filter(Boolean);
  log(`google clip: ${src}`);
  execFileSync(tool, [src, out, ...extra], { stdio: "inherit" });
  return out;
}

/** Narration over the silent recording, scene by scene, with the Google clip in scene 2. */
function finish(work: string, googleClip: string | undefined): void {
  const silent = join(outDir, "silent.mp4");
  const marksFile = join(outDir, "scenes.json");
  if (!existsSync(silent) || !existsSync(marksFile)) throw new Error("nothing recorded yet: run once without --reuse");
  const assemble = swiftTool("assemble", work);
  if (!assemble) return log("swiftc not available: kept the .webm only");
  const final = join(outDir, "smart-library-demo-live.mp4");
  const c2 = cues["2"] ?? {};
  // From the voice edit: the clip starts at clipFrom, and ends at clipTo (else at the end of the scene).
  const range = [
    ...(c2.clipFrom !== undefined ? ["--line-at", String(c2.clipFrom)] : []),
    ...(c2.clipTo !== undefined ? ["--line-end", String(c2.clipTo)] : []),
  ];
  const insert = googleClip ? ["--insert", `2:${googleClip}`, ...range] : [];
  // A recording padded into a bigger video (an older run): only its top-left WxH is the page.
  const crop = arg("--crop-main") ? ["--crop-main", arg("--crop-main")!] : [];
  // Extra scenes (9+) without their narration yet stay out of the main cut and go to a silent preview.
  const all = JSON.parse(readFileSync(marksFile, "utf8")) as { scene: number }[];
  const voiced = (n: number) => n <= 8 || existsSync(join(audioDir, `scene-${n}.m4a`));
  const mainMarks = join(work, "main-scenes.json");
  writeFileSync(mainMarks, JSON.stringify(all.filter((m) => voiced(m.scene))));
  execFileSync(assemble, [silent, mainMarks, audioDir, final, ...insert, ...crop], { stdio: "inherit" });
  const pending = all.filter((m) => !voiced(m.scene));
  if (pending.length) {
    const extrasMarks = join(work, "extras-scenes.json");
    writeFileSync(extrasMarks, JSON.stringify(pending));
    const preview = join(outDir, "extras-preview.mp4");
    execFileSync(assemble, [silent, extrasMarks, join(work, "no-audio"), preview, ...crop], { stdio: "inherit" });
    log(`extra scenes without narration yet: ${preview}`);
    if (extraOut) copyFileSync(preview, join(extraOut, "extras-preview.mp4"));
  }
  if (extraOut) {
    mkdirSync(extraOut, { recursive: true });
    copyFileSync(final, join(extraOut, "smart-library-demo-live.mp4"));
  }
  log(`recorded: ${final}`);
}

const tmp = mkdtempSync(join(tmpdir(), "slm-live-video-"));
const marks: { scene: number; start: number; end: number }[] = [];
let t0 = 0;
let sceneStart = 0;
let sceneMs = 0;
/** Waits until `frac` of the current scene's narration has passed (no-op if the actions already took that long). */
const holdUntil = (frac: number) =>
  new Promise((r) => setTimeout(r, Math.max(0, sceneStart + (frac * sceneMs) / SPEED - Date.now())));
const cuesFile = arg("--cues");
const cues: Record<string, Record<string, number>> = cuesFile ? JSON.parse(readFileSync(cuesFile, "utf8")) : {};
let sceneNo = 0;
/** The cue `name` of the current scene (seconds into its narration), if the voice edit gave one. */
const cueAt = (name: string): number | undefined => cues[String(sceneNo)]?.[name];
/** Waits for the narration cue `name` when there is one, else until `frac` of the scene. */
const holdFor = (name: string, frac: number) => {
  const at = cueAt(name);
  return at === undefined ? holdUntil(frac) : holdUntil(at / (sceneMs / 1000));
};
async function scene(n: number, body: () => Promise<void>): Promise<void> {
  sceneStart = Date.now();
  sceneNo = n;
  sceneMs = clips[n - 1]! * 1000;
  log(`scene ${n} (${clips[n - 1]!.toFixed(1)} s of narration)`);
  await body();
  await holdUntil(1);
  marks.push({ scene: n, start: (sceneStart - t0) / 1000, end: (Date.now() - t0) / 1000 });
}

async function signIn(page: Page, who: { email: string; password: string }): Promise<void> {
  await page.goto(`${LIVE}/signin`);
  await page.getByTestId("signin-email").fill(who.email);
  await page.getByTestId("signin-password").fill(who.password);
  await page.getByTestId("signin-submit").click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** Admin calls run off camera: reset the demo data, then rebuild the search index (2 batches a minute at most). */
async function resetAndReindex(api: APIRequestContext): Promise<void> {
  const headers = { origin: LIVE };
  const reset = await api.post(`${LIVE}/api/admin/reset-demo`, { headers, data: {} });
  if (!reset.ok()) throw new Error(`reset-demo answered ${reset.status()}`);
  log("demo data reset");
  for (let round = 0; round < 60; round++) {
    const r = await api.post(`${LIVE}/api/admin/discovery/reindex`, { headers, data: {} });
    if (r.status() === 429) {
      const wait = Number(r.headers()["retry-after"] ?? 60);
      log(`index: rate limited, waiting ${wait} s`);
      await new Promise((ok) => setTimeout(ok, wait * 1000));
      continue;
    }
    if (!r.ok()) throw new Error(`reindex answered ${r.status()}`);
    const b = (await r.json()) as { result?: string; total?: number; remaining?: number };
    if (b.result === "disabled") return log("index: search by meaning is not set up on this deployment");
    log(`index: ${(b.total ?? 0) - (b.remaining ?? 0)} of ${b.total ?? 0}`);
    if ((b.remaining ?? 0) <= 0) return;
  }
  throw new Error("the index rebuild did not finish");
}

/** Streams a hidden window into an <img> of the recorded page (Chrome's screencast), until the returned stop(). */
async function stream(from: Page, into: Page, id: string): Promise<() => Promise<unknown>> {
  const cdp = await from.context().newCDPSession(from);
  cdp.on("Page.screencastFrame", (f) => {
    void into
      .evaluate(
        ([i, d]) => ((document.getElementById(i!) as HTMLImageElement).src = `data:image/jpeg;base64,${d}`),
        [id, f.data],
      )
      .catch(() => undefined);
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: PANE.viewW, maxHeight: PANE.viewH });
  return () => cdp.send("Page.stopScreencast").catch(() => undefined);
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let adminCtx: BrowserContext | undefined;
let stage: ReturnType<typeof createServer> | undefined;
let failShot: (() => Promise<unknown>) | undefined;
let cleaned = false;

async function main(): Promise<void> {
  log(`narration from ${audioDir}: ${clips.map((s) => s.toFixed(1)).join(", ")} s`);
  mkdirSync(outDir, { recursive: true });
  // First, so a clip with a readable email address stops the run before the live site is touched.
  const googleClip = prepareGoogleClip(tmp);
  if (reuse) return finish(tmp, googleClip);
  const stagePort = 9290;
  const S = `http://localhost:${stagePort}`;
  stage = createServer((req, res) => {
    const u = new URL(req.url ?? "/", S);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(
      u.pathname.startsWith("/card/")
        ? cardPage(u.pathname.slice(6))
        : pairPage("Admin · desk 1 · member Omar Farouk", "Librarian · desk 2 · member Mariam Adel"),
    );
  }).listen(stagePort, "127.0.0.1");

  browser = await chromium.launch({ headless: true });
  const side = async () => {
    const ctx = await browser!.newContext({ viewport: { width: PANE.viewW, height: PANE.viewH } });
    await ctx.addInitScript(captionScript());
    return ctx;
  };
  // Off camera: the admin resets the demo and rebuilds the index, then both desks of scene 5 sign in.
  adminCtx = await side();
  const pa = await adminCtx.newPage();
  await signIn(pa, admin);
  await resetAndReindex(adminCtx.request);
  await signIn(pa, admin); // the reset may end existing sessions
  const libCtx = await side();
  const pb = await libCtx.newPage();
  await signIn(pb, librarian);

  // ---- recording ----
  mkdirSync(outDir, { recursive: true });
  const rawDir = join(tmp, "video");
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: rawDir, size: { width: W, height: H } },
  });
  await context.addInitScript(captionScript());
  const page = await context.newPage();
  t0 = Date.now();
  failShot = () => page.screenshot({ path: join(outDir, "failure.png") }).catch(() => undefined);
  const title = "Demo Book for Video";

  await scene(1, async () => {
    await page.goto(`${S}/card/title`);
    await holdFor("page", 0.55);
    await page.goto(`${LIVE}/signin`);
    await say(page, "Live on Cloudflare", LIVE.replace(/^https:\/\//, ""), "1 · Intro");
  });

  await scene(2, async () => {
    const tag = "2 · Sign in";
    await say(page, "Staff sign in", "Librarians, admins and read-only staff. Members have no login.", tag);
    const google = page.getByTestId("google-signin");
    const showGoogle = process.env.DEMO_GOOGLE === "1" || cueAt("google") !== undefined;
    if (showGoogle && (await google.isVisible())) {
      await holdFor("google", 0);
      await glide(page, google);
      await say(page, "Or sign in with Google", "A first Google sign-in is read-only; an admin gives the role.", tag);
      await sleep(3500);
    }
    await holdFor("signin", 0);
    await sleep(1200);
    await typeInto(page, page.getByTestId("signin-email"), librarian.email);
    await typeInto(page, page.getByTestId("signin-password"), librarian.password);
    await click(page, page.getByTestId("signin-submit"));
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await say(page, "The dashboard", "Catalogue size, books on loan and anything overdue.", tag);
  });

  await scene(3, async () => {
    const tag = "3 · Books";
    // Scene 2 may end on a hand-recorded Google sign-in; say plainly which account the rest of the demo uses.
    await say(page, "From here on: the demo librarian account", "Same Librarian role, on the shared demo data.", tag);
    await sleep(1800);
    await click(page, page.getByRole("link", { name: "Books" }).first());
    await say(page, "Search by title…", "The list narrows as you type.", tag);
    await typeInto(page, page.getByTestId("book-search"), "clean");
    await holdFor("author", 0.17);
    await say(
      page,
      "…or by author, even misspelt",
      '"Tolkein" still finds The Hobbit: the search forgives typos.',
      tag,
    );
    await typeInto(page, page.getByTestId("book-search"), "Tolkein"); // misspelt on purpose: trigram search forgives it
    await holdFor("add", 0.32);
    await page.getByTestId("book-search").fill("");
    await say(page, "Add a book", "A single copy: we will need it in a minute.", tag);
    await click(page, page.getByTestId("add-book"));
    await typeInto(page, page.getByTestId("field-title"), title);
    await typeInto(page, page.getByTestId("field-author"), "Demo Author");
    await typeInto(page, page.getByTestId("field-category"), "Programming");
    await typeInto(page, page.getByTestId("field-totalCopies"), "1");
    await sleep(800);
    await click(page, page.getByTestId("save-book"));
    await page.getByTestId("book-detail-title").waitFor();
    await say(page, "Saved: 1 of 1 copies available", "", tag);
    await holdFor("edit", 0.75);
    await say(page, "Edit", "Every field is validated on the server, not just in the form.", tag);
    await click(page, page.getByTestId("edit-book"));
    await typeInto(page, page.getByTestId("field-category"), "Software engineering");
    await sleep(600);
    await click(page, page.getByTestId("save-book"));
    await page.getByTestId("book-detail-title").waitFor();
  });

  await scene(4, async () => {
    const tag = "4 · Borrow and return";
    await say(page, "Borrow for a member", "Pick the member, pick the book, confirm.", tag);
    await click(page, page.getByRole("link", { name: "Circulation" }));
    await click(page, page.getByTestId("tab-borrow"));
    await typeInto(page, page.getByTestId("member-combobox").getByRole("combobox"), "Nour Hassan");
    await click(page, page.getByRole("option", { name: /Nour Hassan/ }).first());
    await typeInto(page, page.getByTestId("book-combobox").getByRole("combobox"), title);
    await click(page, page.getByRole("option", { name: new RegExp(title) }).first());
    await sleep(1500);
    await click(page, page.getByTestId("confirm-borrow"));
    await page.getByTestId("borrow-success-text").first().waitFor();
    await say(page, "Borrowed: due date set, 0 of 1 available", "", tag);
    await holdFor("return", 0.5);
    await say(page, "Return", "The loan closes with the return date; the history is kept.", tag);
    await click(page, page.getByTestId("tab-return"));
    await typeInto(page, page.getByTestId("return-search"), title);
    const loan = page.getByTestId("loan-row").filter({ hasText: title });
    await loan.waitFor();
    await click(page, loan.getByTestId("return-button"));
    await sleep(1200);
    await click(page, page.getByTestId("return-dialog").getByRole("button", { name: "Confirm return" }));
    await sleep(2000);
    await page.goto(`${LIVE}/books?q=${encodeURIComponent(title)}`);
    await say(page, "Back on the shelf: 1 of 1 available", "", tag);
  });

  await scene(5, async () => {
    const tag = "5 · The last copy";
    const statuses: { desk: string; status: number }[] = [];
    for (const [p, desk] of [
      [pa, "admin"],
      [pb, "librarian"],
    ] as const)
      p.on("response", (r) => {
        if (r.request().method() === "POST" && r.url().endsWith("/api/loans/borrow"))
          statuses.push({ desk, status: r.status() });
      });
    await Promise.all([pa, pb].map((p) => p.goto(`${LIVE}/circulation/borrow`)));
    await page.goto(`${S}/pair`);
    const stops = [await stream(pa, page, "a"), await stream(pb, page, "b")];
    await say(page, "Two desks, two staff sessions, the last copy", "Admin at desk 1, librarian at desk 2.", tag);
    const prep = async (p: Page, member: string) => {
      await typeInto(p, p.getByTestId("member-combobox").getByRole("combobox"), member);
      await click(p, p.getByRole("option", { name: new RegExp(member) }).first());
      await typeInto(p, p.getByTestId("book-combobox").getByRole("combobox"), title);
      await click(p, p.getByRole("option", { name: new RegExp(title) }).first());
      await glide(p, p.getByTestId("confirm-borrow"));
    };
    await prep(pa, "Omar Farouk");
    await prep(pb, "Mariam Adel");
    await say(page, "Both screens: 1 copy available", "Both click Confirm borrowing at the same moment…", tag);
    await holdFor("click", 0.42);
    await Promise.all([pa, pb].map((p) => p.getByTestId("confirm-borrow").click({ noWaitAfter: true })));
    for (let i = 0; i < 40 && statuses.length < 2; i++) await new Promise((r) => setTimeout(r, 250));
    const won = statuses.find((s) => s.status === 201)?.desk ?? "?";
    const codes = statuses
      .map((s) => s.status)
      .sort()
      .join(" and ");
    await say(
      page,
      `One succeeds, the other is refused (${codes})`,
      `The ${won} got the last copy; the other desk is told no copy is left (409). Never a second loan, never −1.`,
      tag,
    );
    await holdFor("shelf", 0.72);
    await Promise.all([pa, pb].map((p) => p.goto(`${LIVE}/books?q=${encodeURIComponent(title)}`)));
    await say(
      page,
      "The shelf: 0 of 1 available, one loan",
      "Tested too: 20 concurrent borrows on 3 copies → exactly 3 succeed, 17 refused.",
      tag,
    );
    await holdUntil(0.98);
    for (const stop of stops) await stop();
    if (codes !== "201 and 409") log(`warning: the race answered ${codes || "nothing"}`);
  });

  if (extras) {
    /** Switches the filmed window's session (its cookies) without a sign-in on camera. */
    const switchTo = async (who: { email: string; password: string }) => {
      const r = await context.request.post(`${LIVE}/api/auth/demo-login`, {
        headers: { origin: LIVE },
        data: { email: who.email, password: who.password },
      });
      if (!r.ok()) throw new Error(`demo sign-in answered ${r.status()}`);
    };
    page.on("dialog", (d) => void d.accept());
    const openBook = async (q: string, name: RegExp) => {
      await page.goto(`${LIVE}/books?q=${encodeURIComponent(q)}`);
      await click(page, page.getByRole("link", { name }).first());
      await page.getByTestId("book-detail-title").waitFor();
    };
    const deleteFromMenu = async () => {
      await click(page, page.getByTestId("detail-actions"));
      await click(page, page.getByRole("menuitem", { name: "Delete" }));
    };

    await scene(9, async () => {
      const tag = "Extra · Delete safely";
      await switchTo(admin);
      await openBook(title, new RegExp(title));
      await say(page, "As the demo admin: delete a book", "It is out on loan…", tag);
      await deleteFromMenu();
      await page.getByTestId("delete-dialog-blocked").waitFor();
      await say(page, "…so it can't be deleted", "Record its return first.", tag);
      await holdFor("archive", 0.38);
      await click(page, page.getByTestId("dialog-cancel"));
      await openBook("Refactoring", /Refactoring/);
      await deleteFromMenu();
      const dlg = page.getByTestId("delete-dialog-archive");
      await dlg.waitFor();
      await say(
        page,
        "A book with past loans is archived",
        "Hidden from Books and search; its loan history stays.",
        tag,
      );
      await sleep(1600);
      await click(page, dlg.getByRole("button", { name: "Archive book" }));
      // Archiving goes back to Books with a toast: the book is gone from the list, its history stays.
      await page.waitForURL(/\/books(\?|$)/);
      await say(
        page,
        "Archived: gone from Books and search",
        "Its loan history stays. A never-borrowed book is deleted for good.",
        tag,
      );
    });

    await scene(10, async () => {
      const tag = "Extra · ISBN look-up";
      await page.goto(`${LIVE}/books/new`);
      await say(page, "Add a book by ISBN", "Bad input gets a clear message…", tag);
      await typeInto(page, page.getByTestId("field-isbn"), "12345");
      await page.keyboard.press("Tab");
      await holdFor("lookup", 0.35);
      await page.getByTestId("field-isbn").fill("");
      await typeInto(page, page.getByTestId("field-isbn"), "9780441172719");
      await click(page, page.getByTestId("isbn-lookup"));
      await page.getByTestId("isbn-lookup-hint").waitFor({ timeout: 15_000 });
      await say(
        page,
        "…and a good one fills the form from Open Library",
        "Title, author, publisher and cover. Duplicate ISBNs are refused.",
        tag,
      );
      await holdFor("leave", 0.95);
      await click(page, page.getByTestId("cancel-book"));
      const discard = page.getByRole("button", { name: /discard|leave/i });
      if (await discard.isVisible().catch(() => false)) await click(page, discard.first());
    });

    await scene(11, async () => {
      const tag = "Extra · The desk stops mistakes";
      await page.goto(`${LIVE}/circulation/borrow`);
      await say(page, "An inactive member can't borrow", "Greyed out, with the way to fix it.", tag);
      await typeInto(page, page.getByTestId("member-combobox-input"), "Ziad");
      await page.getByTestId("member-combobox-option").first().waitFor();
      await holdFor("book", 0.3);
      await page.getByTestId("member-combobox-input").fill("");
      await typeInto(page, page.getByTestId("member-combobox-input"), "Nour");
      await click(page, page.getByTestId("member-combobox-option").filter({ hasText: "Nour Hassan" }).first());
      await say(page, "No copies left: when the next one is due back", "", tag);
      await typeInto(page, page.getByTestId("book-combobox-input"), "Kotlin");
      await page.getByTestId("book-combobox-option").first().waitFor();
      await holdFor("overdue", 0.65);
      await page.goto(`${LIVE}/loans?status=OVERDUE`);
      await say(page, "Overdue loans, one filter away", "", tag);
      await switchTo(librarian); // back to the librarian for the rest of the demo (no visible change until scene 6)
    });
  }

  await scene(6, async () => {
    const tag = "6 · Permissions";
    await page.goto(`${LIVE}/dashboard`);
    await say(page, "A librarian opens an admin screen", "Staff users: /admin/users", tag);
    await sleep(1500);
    await page.goto(`${LIVE}/admin/users`);
    await page.waitForURL(/\/403/);
    await say(page, "403: not allowed for this role", "Checked on the server for every request.", tag);
    await holdFor("api", 0.6);
    const api = await context.request.post(`${LIVE}/api/admin/reset-demo`, { headers: { origin: LIVE }, data: {} });
    await say(
      page,
      `The admin API says no too: ${api.status()}`,
      "POST /api/admin/reset-demo as the librarian. The role is read from the database each time.",
      tag,
    );
  });

  await scene(7, async () => {
    const tag = "7 · AI discovery";
    await page.goto(`${LIVE}/discover`);
    await say(page, "Describe what a member needs, in plain words", "", tag);
    await typeInto(
      page,
      page.getByTestId("discovery-query"),
      "a short book about building good habits for a busy student",
    );
    await click(page, page.getByTestId("discovery-submit"));
    await page.getByTestId("mode-badge").first().waitFor({ timeout: 60_000 });
    await page.getByTestId("discovery-results").evaluate((el) => el.scrollIntoView({ block: "start" }));
    const badge = (await page.getByTestId("mode-badge").first().innerText()).trim();
    const fallback = /keyword|fallback/i.test(badge);
    log(`discovery mode: ${badge}`);
    await say(
      page,
      fallback
        ? "AI is unavailable right now: keyword search answers"
        : "Books from our own catalogue, each with a reason",
      fallback
        ? "The badge says so. The desk never gets stuck."
        : "If the AI service is down, it falls back to keyword search, so the desk never gets stuck.",
      tag,
    );
  });

  await scene(8, async () => {
    const tag = "8 · Close";
    await page.goto(REPO);
    await say(page, "Code, README and architecture on GitHub", "Every change passes CI before it is merged.", tag);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 120);
      await sleep(250);
    }
    await holdFor("close", 0.6);
    await page.goto(`${S}/card/close`);
  });

  await context.close();
  const webm = readdirSync(rawDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no recording was written");

  // Leave the site as a reviewer expects it.
  await resetAndReindex(adminCtx.request);
  cleaned = true;
  await browser.close();
  browser = undefined;

  const webmOut = join(outDir, "smart-library-demo-live.webm");
  copyFileSync(join(rawDir, webm), webmOut);
  if (!encodeMp4(webmOut, join(outDir, "silent.mp4"), tmp, FPS)) return;
  writeFileSync(join(outDir, "scenes.json"), JSON.stringify(marks, null, 2));
  finish(tmp, googleClip);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  await failShot?.();
  code = 1;
  // A run that stopped halfway still leaves the demo data as a reviewer expects it.
  if (adminCtx && !cleaned)
    await resetAndReindex(adminCtx.request).catch((err: unknown) => console.error(redact(String(err))));
} finally {
  await browser?.close().catch(() => undefined);
  stage?.close();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
