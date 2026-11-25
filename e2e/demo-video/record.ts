/**
 * `npm run demo:video`: records the product walkthrough (SLM-11) with Playwright, captions on screen, ≤ 8 minutes.
 * Local only. It builds the same throwaway stack as `npm run e2e` (embedded PostgreSQL 16, `wrangler dev`, the fake
 * AI, random secrets) and starts a second Worker on the same database without the AI binding (the fallback scene).
 * Nothing reads or changes production. The demo passwords are random per run and are never printed.
 * Output: test-results/demo-video/smart-library-demo.webm and .mp4 (see README.md in this folder).
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import EmbeddedPostgres from "embedded-postgres";
import { indexCatalogueWithFakeEmbedder, runMigrations, seed } from "../../scripts/lib/db-tools";
import { click, encodeMp4, root, say, sleep, SPEED, typeInto } from "./lib";
import { captionScript, cardPage, racePage } from "./stage";

const W = 1600;
const H = 900;
const FPS = 20;
const outIdx = process.argv.indexOf("--out");
const extraOut = outIdx > 0 ? process.argv[outIdx + 1] : undefined;
const outDir = join(root, "test-results/demo-video");

const rand = (n: number) => randomBytes(n).toString("hex");
function freePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer()
      .once("error", () => resolve(freePort(preferred + 1)))
      .once("listening", () => s.close(() => resolve(preferred)))
      .listen(preferred, "127.0.0.1");
  });
}

const tmp = mkdtempSync(join(tmpdir(), "slm-video-"));
const procs: ChildProcess[] = [];
let pg: EmbeddedPostgres | undefined;
let failShot: ((name: string) => Promise<unknown>) | undefined;
let stageServer: ReturnType<typeof createHttpServer> | undefined;
async function cleanup(): Promise<void> {
  for (const p of procs) {
    if (!p.pid || p.exitCode !== null) continue;
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
  await sleep(1000);
  for (const p of procs) {
    try {
      if (p.pid) process.kill(-p.pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
  stageServer?.close();
  await pg?.stop().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
}

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${url}/api/health`)).status === 200) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}/api/health`);
}

async function main(): Promise<void> {
  const pgPort = await freePort(5480);
  const appA = await freePort(8890);
  const appB = await freePort(appA + 1);
  const stagePort = await freePort(9190);
  const databaseUrl = `postgres://library:library@localhost:${pgPort}/library`;
  pg = new EmbeddedPostgres({
    databaseDir: join(tmp, "pgdata"),
    user: "library",
    password: "library",
    port: pgPort,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("library");
  await runMigrations(databaseUrl);
  await seed(databaseUrl, { reset: false });
  await indexCatalogueWithFakeEmbedder(databaseUrl);

  const vars = {
    ENVIRONMENT: "local",
    SESSION_SECRET: rand(32),
    DEMO_ACCOUNTS_ENABLED: "true",
    DEMO_LIBRARIAN_EMAIL: "librarian@demo.test",
    DEMO_LIBRARIAN_PASSWORD: rand(8),
    DEMO_ADMIN_EMAIL: "admin@demo.test",
    DEMO_ADMIN_PASSWORD: rand(8),
    DATABASE_URL: databaseUrl,
  };
  const envFile = (name: string, extra: Record<string, string>) => {
    const f = join(tmp, name);
    writeFileSync(
      f,
      Object.entries({ ...vars, ...extra })
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n",
      { mode: 0o600 },
    );
    return f;
  };
  execFileSync("npm", ["run", "build", "-w", "web"], { cwd: root, stdio: "ignore" });
  // A moves nothing aside: a developer's .dev.vars would override these values, so refuse to run next to one.
  if (existsSync(`${root}.dev.vars`))
    throw new Error("Move .dev.vars aside first: wrangler would merge it over this run.");
  const worker = (port: number, file: string, state: string) =>
    procs.push(
      spawn("npx", ["wrangler", "dev", "--port", String(port), "--env-file", file, "--persist-to", join(tmp, state)], {
        cwd: root,
        stdio: "ignore",
        detached: true,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      }),
    );
  worker(appA, envFile("a.env", { AI_FAKE: "true" }), "state-a"); // AI on (the local fake)
  const A = `http://localhost:${appA}`;
  const B = `http://localhost:${appB}`;
  await waitForHealth(A); // one after the other: two wrangler dev starts at once clash over the build folder
  worker(appB, envFile("b.env", {}), "state-b"); // no AI binding, no fake: discovery falls back to keywords
  await waitForHealth(B);

  const S = `http://localhost:${stagePort}`;
  stageServer = createHttpServer((req, res) => {
    const u = new URL(req.url ?? "/", S);
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(u.pathname.startsWith("/card/") ? cardPage(u.pathname.slice(6)) : racePage(A));
  }).listen(stagePort, "127.0.0.1");

  // ---- recording ----
  mkdirSync(outDir, { recursive: true });
  const rawDir = join(tmp, "video");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: rawDir, size: { width: W, height: H } },
  });
  await context.addInitScript(captionScript());
  const page = await context.newPage();
  const loanStatuses: { frame: string; status: number }[] = [];
  page.on("response", (r) => {
    if (r.request().method() === "POST" && r.url().endsWith("/api/loans/borrow"))
      loanStatuses.push({ frame: r.request().frame().name(), status: r.status() });
  });
  const shot = async (name: string) => page.screenshot({ path: join(outDir, `${name}.png`) }).catch(() => undefined);
  failShot = shot;
  // DEMO_SHOTS=1 also saves a PNG at the key moments of each scene (a quick visual check of a dry run).
  const snap = async (name: string) => void (process.env.DEMO_SHOTS && (await shot(name)));
  const title = "Code Complete";
  const card = async (id: string, ms: number) => {
    await page.goto(`${S}/card/${id}`);
    await sleep(ms);
  };

  // 1. Title card
  await card("title", 11_000);

  // 2. Librarian journey
  await page.goto(`${A}/signin`);
  await say(
    page,
    "Library staff sign in",
    "Google, or a demo account for reviewers. Members have no login.",
    "2 · Librarian journey",
  );
  await sleep(3500);
  await typeInto(page, page.getByTestId("signin-email"), vars.DEMO_LIBRARIAN_EMAIL);
  await typeInto(page, page.getByTestId("signin-password"), vars.DEMO_LIBRARIAN_PASSWORD);
  await click(page, page.getByTestId("signin-submit"));
  await page.waitForURL(/\/dashboard/);
  await say(page, "The dashboard", "Catalogue, loans on loan and overdue at a glance.", "2 · Librarian journey");
  await sleep(5000);

  await click(page, page.getByRole("link", { name: "Books" }).first());
  await say(page, "Search the catalogue by title…", "Typing narrows the list as you go.", "2 · Librarian journey");
  await sleep(1500);
  await typeInto(page, page.getByTestId("book-search"), "clean");
  await sleep(3500);
  await say(page, "…or by author", "Same box, six searchable fields.", "2 · Librarian journey");
  await typeInto(page, page.getByTestId("book-search"), "Tolkien");
  await sleep(3500);
  await page.getByTestId("book-search").fill("");

  await say(
    page,
    "Add a book",
    "One copy: this is the book we will borrow, return and fight over later.",
    "2 · Librarian journey",
  );
  await click(page, page.getByTestId("add-book"));
  await typeInto(page, page.getByTestId("field-title"), title);
  await typeInto(page, page.getByTestId("field-author"), "Steve McConnell");
  await typeInto(page, page.getByTestId("field-category"), "Programming");
  await typeInto(page, page.getByTestId("field-totalCopies"), "1");
  await sleep(1200);
  await click(page, page.getByTestId("save-book"));
  await page.getByTestId("book-detail-title").waitFor();
  await say(page, "Saved: 1 of 1 copies available", "", "2 · Librarian journey");
  await sleep(3500);

  await say(page, "Edit the book", "Fix the category.", "2 · Librarian journey");
  await click(page, page.getByTestId("edit-book"));
  await typeInto(page, page.getByTestId("field-category"), "Software engineering");
  await sleep(800);
  await click(page, page.getByTestId("save-book"));
  await page.getByTestId("book-detail-title").waitFor();
  await sleep(3000);

  await say(
    page,
    "Borrow for a member",
    "Pick the member and the book; the summary shows what changes.",
    "2 · Librarian journey",
  );
  await click(page, page.getByRole("link", { name: "Circulation" }));
  await click(page, page.getByTestId("tab-borrow"));
  await typeInto(page, page.getByTestId("member-combobox").getByRole("combobox"), "Nour Hassan");
  await click(page, page.getByRole("option", { name: /Nour Hassan/ }).first());
  await typeInto(page, page.getByTestId("book-combobox").getByRole("combobox"), title);
  await click(page, page.getByRole("option", { name: new RegExp(title) }).first());
  await sleep(2500);
  await click(page, page.getByTestId("confirm-borrow"));
  await page.getByTestId("borrow-success-text").first().waitFor();
  await say(
    page,
    "Borrowed: availability drops to 0 of 1",
    "The toast and the summary say so at once.",
    "2 · Librarian journey",
  );
  await sleep(5000);
  await snap("2-borrowed");

  await say(page, "Return it", "Find the open loan, confirm, and the copy is back.", "2 · Librarian journey");
  await click(page, page.getByTestId("tab-return"));
  await typeInto(page, page.getByTestId("return-search"), title);
  const loan = page.getByTestId("loan-row").filter({ hasText: title });
  await loan.waitFor();
  await click(page, loan.getByTestId("return-button"));
  await sleep(1500);
  await click(page, page.getByTestId("return-dialog").getByRole("button", { name: "Confirm return" }));
  await sleep(2500);
  await page.goto(`${A}/books?q=${encodeURIComponent(title)}`);
  await say(
    page,
    "Back on the shelf: 1 of 1 available",
    "Availability is derived from the loans, never edited by hand.",
    "2 · Librarian journey",
  );
  await sleep(5000);
  await snap("2-returned");

  // 3. Forbidden action
  await say(page, "A forbidden action", "The librarian opens Staff users, an admin-only screen.", "3 · Permissions");
  await sleep(3000);
  await page.goto(`${A}/admin/users`);
  await page.waitForURL(/\/403/);
  await say(
    page,
    "403: not allowed for this role",
    "The UI sends the librarian to the Forbidden page.",
    "3 · Permissions",
  );
  await sleep(5000);
  await snap("3-forbidden-page");
  const reset = await context.request.post(`${A}/api/admin/reset-demo`, { headers: { origin: A } });
  await say(
    page,
    `The API says no as well: ${reset.status()}`,
    "POST /api/admin/reset-demo as the librarian. Roles are checked on the server for every request.",
    "3 · Permissions",
  );
  await sleep(6000);
  await snap("3-forbidden-api");

  // 4. AI discovery and the fallback
  const query = "a calm book to help me cope with losing a parent";
  await page.goto(`${A}/discover`);
  await say(page, "AI discovery", "Describe what a member needs in your own words.", "4 · AI discovery");
  await sleep(3000);
  await typeInto(page, page.getByTestId("discovery-query"), query);
  await click(page, page.getByTestId("discovery-submit"));
  await page.getByTestId("mode-badge").first().waitFor();
  await page.getByTestId("discovery-results").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await say(
    page,
    "Real catalogue books, a reason, live availability",
    "Hybrid search: full-text plus meaning (embeddings), ranked by the model. Local run uses the built-in fake AI.",
    "4 · AI discovery",
  );
  await sleep(9000);
  await snap("4-ai");
  await page.goto(`${B}/discover`);
  await say(
    page,
    "Now the AI is unavailable",
    "A second local Worker with no AI binding. Production is untouched.",
    "4 · AI discovery",
  );
  await sleep(3500);
  await typeInto(page, page.getByTestId("discovery-query"), query);
  await click(page, page.getByTestId("discovery-submit"));
  await page.getByTestId("mode-badge").first().waitFor();
  await page.getByTestId("discovery-results").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await say(
    page,
    "Still answers: keyword fallback",
    "The badge says so. Core flows never depend on AI.",
    "4 · AI discovery",
  );
  await sleep(9000);
  await snap("4-fallback");

  // 5. Last copy, two windows
  await page.goto(`${S}/race`);
  const fa = page.frameLocator("#a");
  const fb = page.frameLocator("#b");
  await say(
    page,
    "The last copy: two librarians at the same moment",
    "Two windows, one book with 1 copy left.",
    "5 · Concurrency",
  );
  await sleep(2500);
  await Promise.all([page.locator("#a").waitFor(), page.locator("#b").waitFor()]);
  const prep = async (f: typeof fa, member: string) => {
    await f.getByTestId("member-combobox").getByRole("combobox").waitFor();
    await f
      .getByTestId("member-combobox")
      .getByRole("combobox")
      .pressSequentially(member, { delay: 45 / SPEED });
    await f
      .getByRole("option", { name: new RegExp(member) })
      .first()
      .click();
    await f
      .getByTestId("book-combobox")
      .getByRole("combobox")
      .pressSequentially(title, { delay: 45 / SPEED });
    await f
      .getByRole("option", { name: new RegExp(title) })
      .first()
      .click();
  };
  // One after the other: the keyboard is shared, so typing into both windows at once would interleave.
  await prep(fa, "Omar Farouk");
  await prep(fb, "Mariam Adel");
  await say(
    page,
    "Both forms are ready on the same book",
    "Two windows of the demo librarian account; each still shows the book as available.",
    "5 · Concurrency",
  );
  await sleep(5000);
  await snap("5-ready");
  await say(page, "Both click Confirm borrowing at the same time…", "", "5 · Concurrency");
  await sleep(2000);
  loanStatuses.length = 0; // only the two clicks below count
  await Promise.all([
    fa.getByTestId("confirm-borrow").click({ noWaitAfter: true }),
    fb.getByTestId("confirm-borrow").click({ noWaitAfter: true }),
  ]);
  await sleep(2500);
  const won = loanStatuses.find((s) => s.status === 201)?.frame === "a" ? "A" : "B";
  const lost = won === "A" ? "B" : "A";
  const codes = loanStatuses
    .map((s) => s.status)
    .sort()
    .join(" and ");
  await say(
    page,
    `One succeeds, the other is refused (${codes})`,
    `Window ${won} got the last copy. Window ${lost} is told it was just borrowed (409). Stock never goes below 0.`,
    "5 · Concurrency",
  );
  await sleep(10_000);
  await snap("5-result");
  await say(page, "Check the shelf: 0 of 1 available, one loan", "", "5 · Concurrency");
  await Promise.all(["a", "b"].map((n) => page.frame({ name: n })!.goto(`${A}/books?q=${encodeURIComponent(title)}`)));
  await sleep(4000);
  await snap("5-shelf");
  await say(
    page,
    "Proven by the test suite too: 20 concurrent borrows on 3 copies → exactly 3 succeed",
    "3 × 201, 17 × 409 BOOK_UNAVAILABLE, available 0, 3 loans (api/test/circulation.test.ts, real PostgreSQL). A database guard makes this safe.",
    "5 · Concurrency",
  );
  await sleep(11_000);

  // 6. Closing card
  await card("close", 14_000);

  await context.close();
  await browser.close();
  const webm = readdirSync(rawDir).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("no recording was written");
  const webmOut = join(outDir, "smart-library-demo.webm");
  copyFileSync(join(rawDir, webm), webmOut);
  encodeMp4(webmOut, join(outDir, "smart-library-demo.mp4"), tmp, FPS);
  if (extraOut) {
    mkdirSync(extraOut.replace(/^~/, homedir()), { recursive: true });
    copyFileSync(
      join(outDir, "smart-library-demo.mp4"),
      join(extraOut.replace(/^~/, homedir()), "smart-library-demo.mp4"),
    );
  }
  console.log(`recorded: ${outDir}`);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  await failShot?.("failure");
  code = 1;
} finally {
  await cleanup();
}
process.exit(code);
