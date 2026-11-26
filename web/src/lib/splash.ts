import { prefersReducedMotion } from "./motion";

/**
 * The opening screen (#slm-splash in index.html). It paints before the script arrives; this module drives its bar
 * from real progress (script loaded → account checked → ready) and fades it out. It stays up long enough to be
 * seen: about 1.8 s the first time in a browser session, 0.9 s on a reload, and only briefly under reduced
 * motion (or when the browser can't tell). A fail-safe takes it down after 8 s so a slow or broken request never hides the app.
 */
export const SPLASH_SEEN_KEY = "slm-splash-seen";
export const SPLASH_MIN_FIRST_MS = 1800;
export const SPLASH_MIN_AGAIN_MS = 900;
export const SPLASH_MIN_REDUCED_MS = 250;
export const SPLASH_FAILSAFE_MS = 8000;
export const SPLASH_FADE_MS = 520;

interface SplashRun {
  el: HTMLElement;
  minMs: number;
  creep: ReturnType<typeof setInterval>;
  failsafe: ReturnType<typeof setTimeout>;
  progress: number;
  done: boolean;
}

let run: SplashRun | null = null;

function set(progress: number, message?: string) {
  if (!run) return;
  run.progress = progress;
  run.el.querySelector<HTMLElement>("#slm-splash-bar")?.style.setProperty("--p", `${progress}%`);
  const msg = run.el.querySelector<HTMLElement>("#slm-splash-msg");
  if (msg && message) msg.textContent = message;
}

/** Call once, before React renders. Does nothing when the page has no splash (tests, other entry points). */
export function startSplash(): void {
  const el = document.getElementById("slm-splash");
  if (!el || run) return;
  let seen = false;
  try {
    seen = window.sessionStorage.getItem(SPLASH_SEEN_KEY) === "1";
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Storage off: treat every load as the first.
  }
  const minMs = prefersReducedMotion() ? SPLASH_MIN_REDUCED_MS : seen ? SPLASH_MIN_AGAIN_MS : SPLASH_MIN_FIRST_MS;
  run = {
    el,
    minMs,
    progress: 0,
    done: false,
    // The bar creeps towards 80% while we wait, so it never looks stuck.
    creep: setInterval(() => run && set(Math.min(80, run.progress + (80 - run.progress) * 0.08)), 120),
    failsafe: setTimeout(() => splashReady(), SPLASH_FAILSAFE_MS),
  };
  set(40, "Checking your library card…");
}

/** The first screen has what it needs: fill the bar, wait out the minimum time, fade out, remove. Idempotent. */
export function splashReady(): void {
  if (!run || run.done) return;
  const r = run;
  r.done = true;
  clearInterval(r.creep);
  clearTimeout(r.failsafe);
  set(100, "Ready");
  // performance.now() counts from navigation start, so the time the HTML was already up counts too.
  const wait = Math.max(200, r.minMs - performance.now());
  setTimeout(() => {
    r.el.classList.add("out");
    r.el.setAttribute("aria-busy", "false");
    setTimeout(() => {
      r.el.remove();
      if (run === r) run = null;
    }, SPLASH_FADE_MS);
  }, wait);
}

/** Tests only: forget the current run. */
export function resetSplashForTests(): void {
  if (run) {
    clearInterval(run.creep);
    clearTimeout(run.failsafe);
  }
  run = null;
}
