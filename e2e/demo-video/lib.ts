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
export async function spotlight(page: Page, loc: Locator, opts: { zoom?: number; ms?: number } = {}): Promise<void> {
  const o = { zoom: opts.zoom ?? 1.3, ms: Math.round((opts.ms ?? 2400) / SPEED) };
  await loc.scrollIntoViewIfNeeded().catch(() => undefined);
  await glide(page, loc);
  await sleep(250);
  await loc.evaluate((el, x) => (window as unknown as { __spot?: (e: Element, o: object) => void }).__spot?.(el, x), o);
  await new Promise((r) => setTimeout(r, o.ms + 750));
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
