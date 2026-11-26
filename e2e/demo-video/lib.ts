/** Helpers shared by the two recorders: `record.ts` (local stack) and `record-live.ts` (the deployed site). */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";

export const root = new URL("../../", import.meta.url).pathname;

// DEMO_SPEED=20 plays every pause and keystroke 20 times faster: a quick dry run of the whole script.
export const SPEED = Number(process.env.DEMO_SPEED ?? 1);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(ms, 0) / SPEED));

/** The caption banner (see `captionScript` in stage.ts). DEMO_CAPTIONS=0 keeps it hidden. */
export async function say(page: Page, title: string, sub = "", scene = ""): Promise<void> {
  if (process.env.DEMO_CAPTIONS === "0") return;
  await page.evaluate(
    ([t, s, n]) => (window as unknown as { __cap: (...a: string[]) => void }).__cap(t!, s!, n!),
    [title, sub, scene],
  );
}
export async function glide(page: Page, loc: Locator): Promise<void> {
  const box = await loc.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
}
/**
 * Points at a key moment (Ahmed, 26/11: "نشاور عليها بالكرسر عشان تبقى باينه"): the cursor glides onto the element,
 * the page zooms ~1.3x around it with a soft ring, holds, and eases back. Returns after the page is back to normal.
 */
/**
 * Waits until the page is still: no opening splash (#slm-splash, SLM-15), no running finite animation (view
 * transitions, staggered rows), at most `maxMs`. Works on pages without any of these too.
 */
export async function settle(page: Page, maxMs = 2500): Promise<void> {
  await page
    .waitForFunction(
      () =>
        !document.getElementById("slm-splash") &&
        // SLM-15 loading states (Haya 26/11): the fetch progress bar, skeleton sheens, the shell loading screen
        !document.querySelector(
          '[data-testid="fetch-progress"],[data-testid$="skeleton"],[data-testid="loading-screen"],[data-testid="shell-loading"]',
        ) &&
        document.getAnimations().every((a) => {
          const t = a.effect?.getComputedTiming();
          return a.playState !== "running" || !t || t.endTime === Infinity;
        }),
      null,
      { timeout: maxMs, polling: 100 },
    )
    .catch(() => undefined);
}
/** Waits until `loc`'s text stops changing (count-up numbers, SLM-15), at most `maxMs`. */
export async function steadyText(loc: Locator, maxMs = 2500): Promise<void> {
  // inputs have no inner text: read their value; a value that stays the same twice (even empty) is steady
  const read = () =>
    loc
      .evaluate((el) =>
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent,
      )
      .catch(() => "");
  let last: string | null = null;
  for (let waited = 0; waited < maxMs; waited += 200) {
    const now = (await read()) ?? "";
    if (now === last) return;
    last = now;
    await new Promise((r) => setTimeout(r, 200));
  }
}
export async function spotlight(
  page: Page,
  loc: Locator,
  opts: { zoom?: number; ms?: number; onRing?: () => void } = {},
): Promise<void> {
  const o = { zoom: opts.zoom ?? 1.3, ms: Math.round((opts.ms ?? 2400) / SPEED) };
  await settle(page);
  await steadyText(loc);
  await loc.scrollIntoViewIfNeeded().catch(() => undefined);
  // The cursor rests just left of the element, never on the words (Talia, 26/11); below it only at the window's edge.
  const beside = async (steps: number) => {
    const b = await loc.boundingBox();
    if (!b) return;
    if (b.x > 40) await page.mouse.move(b.x - 22, b.y + b.height / 2, { steps });
    else await page.mouse.move(b.x + Math.min(18, b.width / 4), b.y + b.height + 14, { steps });
  };
  await beside(18);
  await sleep(200);
  opts.onRing?.(); // the moment the ring lands (row sync logs it)
  await loc.evaluate((el, x) => (window as unknown as { __spot?: (e: Element, o: object) => void }).__spot?.(el, x), o);
  await new Promise((r) => setTimeout(r, 650 / SPEED));
  await beside(10); // follow the element as the page zooms
  await new Promise((r) => setTimeout(r, Math.max(o.ms - 650 / SPEED, 0) + 750));
}
export async function click(page: Page, loc: Locator): Promise<void> {
  await loc.scrollIntoViewIfNeeded();
  await glide(page, loc);
  await sleep(250);
  await loc.click();
}
export async function typeInto(page: Page, loc: Locator, text: string): Promise<void> {
  await click(page, loc);
  await loc.fill("");
  await loc.pressSequentially(text, { delay: 55 / SPEED });
}

/** Compiles one of this folder's Swift tools into `work` and returns its path, or undefined without swiftc. */
export function swiftTool(name: string, work: string): string | undefined {
  const out = join(work, name);
  try {
    execFileSync("swiftc", ["-O", join(root, `e2e/demo-video/${name}.swift`), "-o", out], { stdio: "inherit" });
    return out;
  } catch {
    return undefined;
  }
}

/**
 * webm → MP4 with Playwright's own ffmpeg and AVFoundation (encode.swift). macOS only. Playwright's ffmpeg can only
 * write webm or PNG frames, so: webm → PNG frames → encode.swift → H.264 MP4. Returns false if it could not.
 */
export function encodeMp4(webm: string, mp4: string, work: string, fps: number): boolean {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "Library/Caches/ms-playwright");
  const dir = existsSync(cache) ? readdirSync(cache).find((d) => d.startsWith("ffmpeg-")) : undefined;
  const ffmpeg = dir ? join(cache, dir, "ffmpeg-mac") : "";
  if (!ffmpeg || !existsSync(ffmpeg)) return (console.log("no Playwright ffmpeg found: kept the .webm only"), false);
  const enc = swiftTool("encode", work);
  if (!enc) return (console.log("swiftc not available: kept the .webm only"), false);
  const frames = join(work, "frames");
  mkdirSync(frames, { recursive: true });
  execFileSync(ffmpeg, ["-v", "error", "-i", webm, "-r", String(fps), join(frames, "%06d.png")], { stdio: "inherit" });
  execFileSync(enc, [frames, String(fps), mp4], { stdio: "inherit" });
  return true;
}
