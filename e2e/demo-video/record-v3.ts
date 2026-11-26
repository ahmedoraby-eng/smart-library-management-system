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
 *   DEMO_ORDER      the scenes to film, in order (default script v2: 1,2,3,10,4,12,5,9,6,7,13,14,8). Scenes without
 *                   their clip yet (scene-N.m4a, N > 8) stay out of the main cut and go to extras-preview.mp4.
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
import { type APIRequestContext, type BrowserContext, chromium, type Locator, type Page } from "@playwright/test";
import { click, encodeMp4, glide, root, say, sleep, SPEED, spotlight, swiftTool, typeInto } from "./lib";
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
const audioDir = arg("--audio") ?? join(homedir(), "Code/slm-ops/video/edit-v3/final");
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
const DEFAULT_S = [20, 30, 25, 20, 30, 15, 25, 20, 38, 18, 50, 13, 16, 25]; // script v3 lengths, for a scene without a clip
/**
 * Script v2 order (Nora, 26/11): ISBN next to "add a book", renew + bell next to borrow and return, delete right after
 * the last-copy race (the book is still on loan), More like this after AI discovery, ⌘K before the close. Scene 11 is
 * dropped. DEMO_ORDER="1,2,…" films another order. A scene whose feature is not deployed yet is skipped.
 */
const ORDER = (process.env.DEMO_ORDER ?? "1,2,3,4,5,6,7,8,9,10,11,12,13,14").split(",").map(Number);
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
  const final = join(outDir, "smart-library-demo-v3.mp4");
  // Ahmed's silent Google clip, in two parts (google-clip.swift output, emails blurred): part 2 covers scene 2 from
  // its row 2 (the Google sign-in) to the end; part 3 covers scene 3 up to its row 3. Row times come from the voice cues.
  const part = (n: number) => arg(`--google-${n}`);
  const c2 = cues["2"] ?? {};
  const from2 = c2.r2 ?? (10 / DEFAULT_S[1]!) * clips[1]!;
  const to3 = (cues["3"] ?? {}).r3 ?? (16 / DEFAULT_S[2]!) * clips[2]!;
  const insert = [
    ...(part(2) ? ["--insert", `2:${part(2)}`, "--line-at", String(from2)] : []),
    // part 3 runs to row 3 ("Can I open the admin page?"); the 403 after it is filmed live with the demo librarian (same page, no Google account)
    ...(part(3) ? ["--insert", `3:${part(3)}`, "--line-at", "0", "--line-end", String(to3)] : []),
    ...(googleClip && !part(2) ? ["--insert", `2:${googleClip}`, "--line-at", String(from2)] : []),
  ];
  // A recording padded into a bigger video (an older run): only its top-left WxH is the page.
  const crop = arg("--crop-main") ? ["--crop-main", arg("--crop-main")!] : [];
  // Extra scenes (9+) without their narration yet stay out of the main cut and go to a silent preview.
  const all = JSON.parse(readFileSync(marksFile, "utf8")) as { scene: number }[];
  const voiced = (_n: number) => true; // v3: every scene is in the cut; one without its clip yet stays silent
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
    copyFileSync(final, join(extraOut, "smart-library-demo-v3.mp4"));
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
async function scene(n: number, body: () => Promise<void | false>): Promise<void> {
  sceneStart = Date.now();
  sceneNo = n;
  sceneMs = clips[n - 1]! * 1000;
  log(`scene ${n} (${clips[n - 1]!.toFixed(1)} s of narration)`);
  if ((await body()) === false) return log(`scene ${n}: skipped`);
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
        : pairPage("Librarian · desk 1 · member Nour Hassan", "Admin · desk 2 · member Yara Samy"),
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
  const switchToEarly = async (who: { email: string; password: string }) => {
    const r = await context.request.post(`${LIVE}/api/auth/demo-login`, {
      headers: { origin: LIVE },
      data: { email: who.email, password: who.password },
    });
    if (!r.ok()) throw new Error(`demo sign-in answered ${r.status()}`);
  };

  // Before scene 1 (not in the cut): the filmed window signs in as the librarian, on the plain look.
  await switchToEarly(librarian);
  await page.goto(`${LIVE}/dashboard`);
  await page.evaluate(() => localStorage.setItem("slm-theme", "plain"));
  await page.goto(`${LIVE}/dashboard`);
  await page.getByTestId("kpi-active-loans").waitFor({ timeout: 30_000 });

  // Script v3 (Nora, 26/11): one table per scene, each row a DO with a time. Row i waits for the voice cue `r<i>` (the
  // start of that row's SAY in Ahmed's edited take), else for its Time-column second. Every 👉 is a spotlight.
  const LEN = DEFAULT_S;
  /** Waits for row `i` of the current scene: its voice cue, else `sec` seconds into the scene (Time column). */
  const row = (i: number, sec: number) => holdFor(`r${i}`, sec / LEN[sceneNo - 1]!);
  /** Waits up to `ms` for `loc` to show (isVisible() does not wait). */
  const appears = (loc: Locator, ms: number) =>
    loc
      .waitFor({ state: "visible", timeout: ms })
      .then(() => true)
      .catch(() => false);
  /** Points at the first visible `loc` (skips quietly if it never shows). */
  const show = async (p: Page, loc: Locator, ms = 2000, zoom = 1.3) => {
    const shown = loc.filter({ visible: true }).first(); // lists render a hidden mobile copy of each row too
    if (!(await appears(shown, 6000))) return log(`  scene ${sceneNo}: nothing to point at (${String(loc)})`);
    await spotlight(p, shown, { ms, zoom });
  };
  /** v3 keeps the screen clean: captions only where the script asks (scenes 9 and 11). */
  const caption = (t: string, s = "") => say(page, t, s, "");
  const clearCaption = () => say(page, "", "", "");
  /** Switches the filmed window's session (its cookies) without a sign-in on camera. */
  const switchTo = async (who: { email: string; password: string }) => {
    const r = await context.request.post(`${LIVE}/api/auth/demo-login`, {
      headers: { origin: LIVE },
      data: { email: who.email, password: who.password },
    });
    if (!r.ok()) throw new Error(`demo sign-in answered ${r.status()}`);
  };
  page.on("dialog", (d) => void d.accept());
  const nav = (name: string | RegExp) => page.getByRole("navigation").getByRole("link", { name }).first();
  const search = async (q: string) => {
    const box = page.getByTestId("book-search");
    await box.fill("");
    await box.pressSequentially(q, { delay: 70 / SPEED });
    await sleep(1200);
  };
  const openBook = async (q: string, name: RegExp) => {
    await page.goto(`${LIVE}/books?q=${encodeURIComponent(q)}`);
    await click(page, page.getByRole("link", { name }).filter({ visible: true }).first());
    await page.getByTestId("book-detail-title").waitFor();
  };
  const lotr = "The Lord of the Rings";
  const LOTR_ISBN = "9780544003415";
  const scrollBy = async (p: Page, dy: number, n: number, gap = 160) => {
    for (let i = 0; i < n; i++) {
      await p.mouse.wheel(0, dy);
      await sleep(gap);
    }
  };

  const scenes: Record<number, () => Promise<void | false>> = {
    // SLM-01 · Hello (Demo Librarian, Dashboard, plain look → Reading Room)
    1: async () => {
      await caption("");
      await row(0, 0.6);
      await click(page, page.getByTestId("theme-toggle"));
      await row(1, 6);
      for (const n of ["Books", "Members", "Circulation"]) {
        await glide(page, nav(n));
        await sleep(900);
      }
      await row(2, 10);
      await show(page, nav(/Book discovery/), 1800);
      await row(3, 14);
      await show(page, page.getByTestId("kpi-active-loans"), 1600);
      await show(page, page.getByTestId("kpi-overdue"), 1600);
      await row(4, 18);
      await caption("Live on Cloudflare", LIVE.replace(/^https:\/\//, ""));
      await holdUntil(0.97);
      await clearCaption();
    },

    // SLM-02 · The front door (signed out; the Google sign-in itself is Ahmed's clip)
    2: async () => {
      await context.clearCookies();
      await page.goto(`${LIVE}/signin`);
      await row(0, 0.3);
      await show(page, page.getByTestId("google-signin"), 2200, 1.25);
      await row(1, 4);
      await click(page, page.getByTestId("signin-privacy"));
      await page.getByTestId("privacy").waitFor();
      await sleep(900);
      await scrollBy(page, 90, 18, 180);
      await row(2, 10);
      await click(page, page.getByTestId("privacy-back"));
      await page.waitForURL(/\/signin/);
      // Rows 2–5 (Google sign-in, the Supervisor label, a book with no Borrow) come from Ahmed's silent clip; the
      // recording holds the sign-in page meanwhile, pointing at the Google button.
      await glide(page, page.getByTestId("google-signin"));
      await holdUntil(0.97);
    },

    // SLM-03 · Who decides the role (Ahmed's clip covers it; this is the fallback picture without his account)
    3: async () => {
      await switchTo(admin);
      await page.goto(`${LIVE}/admin/users`);
      await page.getByTestId("staff-table").waitFor();
      await row(0, 1);
      await show(page, page.getByTestId("staff-row").last(), 2000, 1.2);
      await row(1, 5);
      await show(page, page.getByTestId("role-select").last(), 1800, 1.3);
      await switchTo(librarian);
      await row(3, 16);
      await page.goto(`${LIVE}/admin/users`);
      await page.waitForURL(/\/403/);
      await row(4, 19);
      await show(page, page.getByText("You don't have access to this page"), 2400, 1.35);
      await row(5, 22);
      await glide(page, page.getByText("You don't have access to this page"));
      await holdUntil(0.97);
    },

    // SLM-04 · Finding books
    4: async () => {
      await switchTo(librarian);
      await page.goto(`${LIVE}/books`);
      await row(0, 0.3);
      await click(page, page.getByTestId("book-search"));
      await search("hobbit");
      await row(1, 4);
      await search("Tolkein");
      await row(2, 9);
      await search("9780132350884");
      await row(3, 12);
      await click(
        page,
        page
          .getByRole("link", { name: /Clean Code/ })
          .filter({ visible: true })
          .first(),
      );
      await page.getByTestId("book-detail-title").waitFor();
      await show(page, page.getByText(/ISBN 978/), 3000, 1.4);
      await holdUntil(0.97);
    },

    // SLM-05 · Add a book by ISBN (The Lord of the Rings, 1 copy: scene 9 races for it)
    5: async () => {
      await page.goto(`${LIVE}/books/new`);
      await row(0, 0.3);
      await typeInto(page, page.getByTestId("field-isbn"), LOTR_ISBN);
      await row(1, 6);
      await click(page, page.getByTestId("isbn-lookup"));
      await page.getByTestId("isbn-lookup-hint").waitFor({ timeout: 15_000 });
      await row(2, 9);
      await show(page, page.getByTestId("field-title"), 1500, 1.2);
      await show(page, page.getByTestId("cover-preview"), 1500, 1.2);
      await row(3, 15);
      await show(page, page.getByTestId("isbn-lookup-hint"), 2200, 1.4);
      await row(4, 20);
      await typeInto(page, page.getByTestId("field-category"), "Fiction");
      await row(5, 25);
      await typeInto(page, page.getByTestId("field-totalCopies"), "1");
      await show(page, page.getByTestId("field-totalCopies"), 1500, 1.3);
      await click(page, page.getByTestId("save-book"));
      await page.getByTestId("book-detail-title").waitFor();
      await holdUntil(0.97);
    },

    // SLM-06 · Edit, and a twin
    6: async () => {
      await row(0, 0.3);
      await click(page, page.getByTestId("edit-book"));
      await typeInto(page, page.getByTestId("field-category"), "Fantasy");
      await click(page, page.getByTestId("save-book"));
      await page.getByTestId("book-detail-title").waitFor();
      await row(1, 5);
      await page.goto(`${LIVE}/books/new`);
      await typeInto(page, page.getByTestId("field-isbn"), LOTR_ISBN);
      await click(page, page.getByTestId("isbn-lookup"));
      await page.getByTestId("isbn-lookup-hint").waitFor({ timeout: 15_000 });
      await typeInto(page, page.getByTestId("field-totalCopies"), "1");
      await click(page, page.getByTestId("save-book"));
      await row(2, 10);
      await show(page, page.getByText(/Another book already uses this ISBN/), 2600, 1.4);
      await click(page, page.getByTestId("cancel-book"));
      const discard = page.getByRole("button", { name: /discard|leave/i });
      if (await appears(discard.first(), 1500)) await click(page, discard.first());
      await holdUntil(0.97);
    },

    // SLM-07 · Lend and return
    7: async () => {
      await page.goto(`${LIVE}/circulation/borrow`);
      await row(0, 0.3);
      await typeInto(page, page.getByTestId("member-combobox").getByRole("combobox"), "nour");
      await click(page, page.getByRole("option", { name: /Nour Hassan/ }).first());
      await row(1, 5);
      await typeInto(page, page.getByTestId("book-combobox").getByRole("combobox"), "clean");
      await click(page, page.getByRole("option", { name: /Clean Code/ }).first());
      await show(page, page.getByTestId("copies-change"), 1800, 1.3);
      await row(2, 9);
      await click(page, page.getByTestId("confirm-borrow"));
      const done = page.getByTestId("borrow-success-text");
      await done.first().waitFor();
      await show(page, done, 1800, 1.3);
      await row(3, 14);
      await show(page, done, 1800, 1.3);
      await row(4, 17);
      await click(page, page.getByTestId("tab-return"));
      await typeInto(page, page.getByTestId("return-search"), "Clean Code");
      const loan = page.getByTestId("loan-row").filter({ hasText: "Nour Hassan" }).filter({ hasText: "Clean Code" });
      await loan.first().waitFor();
      await click(page, loan.first().getByTestId("return-button"));
      await sleep(700);
      await click(page, page.getByTestId("return-dialog").getByRole("button", { name: "Confirm return" }));
      await row(5, 22);
      await show(page, page.getByTestId("toast"), 2000, 1.25);
      await holdUntil(0.97);
    },

    // SLM-08 · Renew, and the bell
    8: async () => {
      await page.goto(`${LIVE}/circulation/return`);
      const renew = page.locator(`[data-testid="renew-button"]:not([disabled])`).first(); // a late loan can't renew
      if (!(await appears(renew, 10_000))) return log("  scene 8: no enabled Renew on the live site");
      await row(0, 0.3);
      await click(page, renew);
      await show(page, page.getByTestId("toast").filter({ hasText: /Renewed/ }), 2000, 1.25);
      await row(1, 5);
      const blocked = page.getByTestId("renew-blocked").filter({ visible: true }).first();
      if (await appears(blocked, 4000)) {
        await blocked.scrollIntoViewIfNeeded();
        await glide(page, blocked);
        // a native title tooltip never reaches the video: draw the same text the browser would show
        await blocked.evaluate((el) => (window as unknown as { __tip?: (e: Element) => void }).__tip?.(el));
        await sleep(2600);
      }
      await row(2, 10);
      await show(page, page.getByTestId("overdue-count"), 1800, 1.5);
      await row(3, 14);
      await click(page, page.getByTestId("overdue-bell"));
      await page
        .getByTestId("overdue-popover")
        .waitFor({ timeout: 10_000 })
        .catch(() => undefined);
      await row(4, 18);
      await show(page, page.getByTestId("overdue-item").first(), 1800, 1.25);
      await holdUntil(0.97);
      await page.keyboard.press("Escape");
    },

    // SLM-09 · The last copy (left: Demo Librarian, right: Demo Admin)
    9: async () => {
      const pL = pb; // the librarian desk, on the left
      const pR = pa; // the admin desk, on the right
      const statuses: { desk: string; status: number }[] = [];
      for (const [p, desk] of [
        [pL, "left"],
        [pR, "right"],
      ] as const)
        p.on("response", (r) => {
          if (r.request().method() === "POST" && r.url().endsWith("/api/loans/borrow"))
            statuses.push({ desk, status: r.status() });
        });
      await Promise.all([pL, pR].map((p) => p.goto(`${LIVE}/circulation/borrow`)));
      await page.goto(`${S}/pair`);
      const stops = [await stream(pL, page, "a"), await stream(pR, page, "b")];
      await row(1, 3);
      const prep = async (p: Page, member: string) => {
        await typeInto(p, p.getByTestId("member-combobox").getByRole("combobox"), member);
        await click(p, p.getByRole("option", { name: new RegExp(member) }).first());
        await typeInto(p, p.getByTestId("book-combobox").getByRole("combobox"), lotr);
        await click(p, p.getByRole("option", { name: new RegExp(lotr) }).first());
      };
      await prep(pL, "Nour Hassan");
      await prep(pR, "Yara Samy");
      await row(2, 10);
      await spotlight(pL, pL.getByTestId("copies-change"), { ms: 1500 });
      await spotlight(pR, pR.getByTestId("copies-change"), { ms: 1500 });
      await Promise.all([pL, pR].map((p) => glide(p, p.getByTestId("confirm-borrow"))));
      await row(3, 14);
      // left first, the right a moment later: both requests race for the one copy at the same time
      await pL.getByTestId("confirm-borrow").click({ noWaitAfter: true });
      await new Promise((r) => setTimeout(r, 120));
      await pR.getByTestId("confirm-borrow").click({ noWaitAfter: true });
      for (let i = 0; i < 40 && statuses.length < 2; i++) await new Promise((r) => setTimeout(r, 250));
      const won = statuses.find((s) => s.status === 201)?.desk ?? "left";
      const [winP, loseP] = won === "right" ? [pR, pL] : [pL, pR];
      const refused = loseP.getByTestId("book-notice").or(loseP.getByTestId("borrow-error")).first();
      if (await appears(refused, 5000)) await spotlight(loseP, refused, { ms: 1500, zoom: 1.5 });
      await row(4, 17);
      await spotlight(winP, winP.getByTestId("borrow-success"), { ms: 2000, zoom: 1.45 });
      await row(5, 20);
      if (await appears(refused, 3000)) await spotlight(loseP, refused, { ms: 3000, zoom: 1.6 });
      await row(6, 26);
      await winP.goto(`${LIVE}/books?q=${encodeURIComponent(lotr)}`);
      await click(
        winP,
        winP
          .getByRole("link", { name: new RegExp(lotr) })
          .filter({ visible: true })
          .first(),
      );
      await winP.getByTestId("book-detail-title").waitFor();
      await spotlight(winP, winP.getByTestId("copies-available"), { ms: 2400, zoom: 1.6 });
      await row(7, 30);
      await caption("20 at once · 3 copies → 3 win, 17 refused", "The database checks and updates in one step.");
      await glide(winP, winP.getByTestId("copies-available"));
      await holdUntil(0.98);
      await clearCaption();
      for (const stop of stops) await stop();
      const codes = statuses
        .map((s) => s.status)
        .sort()
        .join(" and ");
      if (codes !== "201 and 409") log(`warning: the race answered ${codes || "nothing"}`);
    },

    // SLM-10 · Delete, carefully (Demo Admin)
    10: async () => {
      await switchTo(admin);
      const deleteFromMenu = async () => {
        await click(page, page.getByTestId("detail-actions"));
        await click(page, page.getByRole("menuitem", { name: "Delete" }));
      };
      await openBook(lotr, new RegExp(lotr));
      await row(0, 0.3);
      await deleteFromMenu();
      const blocked = page.getByTestId("delete-dialog-blocked");
      await blocked.waitFor();
      await row(1, 4);
      await show(page, blocked.getByText(/on loan/).last(), 2000, 1.3);
      await click(page, page.getByTestId("dialog-cancel"));
      await row(2, 9);
      await openBook("Refactoring", /Refactoring/);
      await deleteFromMenu();
      const dlg = page.getByTestId("delete-dialog-archive");
      await dlg.waitFor();
      await row(3, 13);
      await click(page, dlg.getByRole("button", { name: "Archive book" }));
      await page.waitForURL(/\/books(\?|$)/);
      await show(page, page.getByTestId("toast"), 1800, 1.25);
      await holdUntil(0.97);
      await switchTo(librarian);
    },

    // SLM-11 · AI discovery (captions 1–4 as the script lists)
    11: async () => {
      await page.goto(`${LIVE}/discover`);
      const left = page.getByTestId("ai-searches-left");
      await row(0, 0.3);
      await show(page, left, 2000, 1.35);
      await row(1, 4);
      await typeInto(
        page,
        page.getByTestId("discovery-query"),
        "a short book about building good habits for a busy student",
      );
      await row(2, 12);
      await click(page, page.getByTestId("discovery-submit"));
      await page.getByTestId("mode-badge").first().waitFor({ timeout: 60_000 });
      log(`discovery mode: ${(await page.getByTestId("mode-badge").first().innerText()).trim()}`);
      await page.getByTestId("discovery-results").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await row(3, 15);
      await caption("1 · words + meaning");
      const first = page.getByTestId("discovery-item").first();
      await show(page, first.getByRole("heading").or(first.getByRole("link")).first(), 1400, 1.25);
      await show(page, page.getByTestId("found-by-meaning"), 1400, 1.35);
      await row(4, 21);
      await caption("2 · one list");
      await scrollBy(page, 110, 10, 200);
      await scrollBy(page, -110, 10, 140);
      await row(5, 27);
      await caption("3 · AI ranks and explains");
      await show(page, page.getByTestId("mode-badge"), 1200, 1.4);
      await show(page, page.getByTestId("reason"), 3000, 1.3);
      await row(6, 33);
      await caption("4 · only our books");
      await show(page, first.getByTestId("availability"), 1800, 1.4);
      await row(7, 38);
      await caption("AI down → keyword search");
      await show(page, page.getByTestId("mode-badge"), 1800, 1.4);
      await row(8, 43);
      await clearCaption();
      await left.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
      await sleep(600);
      await show(page, left, 3000, 1.4);
      await holdUntil(0.97);
    },

    // SLM-12 · More like this
    12: async () => {
      await openBook("H Is for Hawk", /H Is for Hawk/);
      const strip = page.getByTestId("similar-books");
      if (!(await appears(strip, 10_000))) return log("  scene 12: no More like this on the live site");
      await row(0, 0.3);
      await strip.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
      await row(1, 5);
      for (const card of (await page.getByTestId("similar-book").all()).slice(0, 4)) {
        await glide(page, card);
        await sleep(350);
      }
      await click(page, page.getByTestId("similar-book-link").first());
      await page.getByTestId("book-detail-title").waitFor();
      await row(2, 10);
      const next = page.getByTestId("similar-books");
      await appears(next, 8000);
      await next.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
      await sleep(500);
      await show(page, next, 1800, 1.1);
      await holdUntil(0.97);
    },

    // SLM-13 · Command K (Ctrl K: headless Chromium on macOS swallows ⌘K; the palette takes both)
    13: async () => {
      await page.goto(`${LIVE}/dashboard`);
      if (!(await appears(page.getByTestId("palette-trigger"), 10_000))) return log("  scene 13: no palette");
      await row(0, 0.3);
      await page.keyboard.press("Control+k");
      const input = page.getByTestId("palette-input");
      await input.waitFor();
      await row(1, 3);
      await input.pressSequentially("nour", { delay: 110 / SPEED });
      const opt = page.getByTestId("palette-option").filter({ hasText: /Borrow for Nour Hassan/ });
      await show(page, opt, 1500, 1.25);
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/circulation\/borrow/);
      await row(2, 9);
      await page.keyboard.press("Control+k");
      await input.waitFor();
      await input.pressSequentially("overdue", { delay: 110 / SPEED });
      await sleep(600);
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/loans/);
      await row(3, 13);
      await show(
        page,
        page
          .getByRole("combobox")
          .filter({ hasText: /Overdue/ })
          .or(page.getByText(/Overdue/)),
        2000,
      );
      await holdUntil(0.97);
    },

    // SLM-14 · The AI team, and goodbye (public code page)
    14: async () => {
      await page.goto(REPO);
      await row(0, 0.3);
      const teamHead = page.getByRole("heading", { name: /How it was built/ }).first();
      await teamHead.scrollIntoViewIfNeeded().catch(() => undefined);
      await sleep(1500);
      await row(1, 5);
      await page.goto(`${REPO}/blob/main/docs/ai-team.md`);
      await sleep(1200);
      await scrollBy(page, 120, 14, 220);
      await row(2, 10);
      const imgs = page.locator("article img");
      const n = await imgs.count().catch(() => 0);
      if (n > 1) await show(page, imgs.nth(1), 1600, 1.2);
      await scrollBy(page, 120, 10, 200);
      await row(3, 15);
      const human = page.getByRole("heading", { name: /The human/ }).first();
      await human.scrollIntoViewIfNeeded().catch(() => undefined);
      await show(page, human, 2000, 1.3);
      await row(4, 19);
      await page.goto(`${S}/card/close`);
    },
  };

  for (const n of ORDER) {
    const body = scenes[n];
    if (!body) throw new Error(`no scene ${n} in this recorder`);
    await scene(n, body);
  }

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
