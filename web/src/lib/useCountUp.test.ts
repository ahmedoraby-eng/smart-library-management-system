// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, useCountUp } from "./useCountUp";

/** matchMedia that answers `reduce` for the reduced-motion query. */
const stubMotion = (reduce: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({ matches: reduce && q.includes("reduce"), media: q })),
  );

/** A hand-driven requestAnimationFrame clock: `advance(ms)` runs one frame at now + ms. */
function stubFrames() {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  return (ms: number) =>
    act(() => {
      now += ms;
      const run = queue;
      queue = [];
      run.forEach((cb) => cb(now));
    });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prefersReducedMotion", () => {
  it("follows the system setting, and stays still when the browser can't tell", () => {
    stubMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMotion(false);
    expect(prefersReducedMotion()).toBe(false);
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("useCountUp", () => {
  it("under reduced motion shows the figure at once, and follows changes at once", () => {
    stubMotion(true);
    const { result, rerender } = renderHook(({ n }) => useCountUp(n), { initialProps: { n: 64 } });
    expect(result.current).toBe(64);
    rerender({ n: 70 });
    expect(result.current).toBe(70);
  });

  it("counts up from 0 with an ease-out and lands exactly on the figure", () => {
    stubMotion(false);
    const advance = stubFrames();
    const { result } = renderHook(() => useCountUp(100, 400));
    expect(result.current).toBe(0);
    advance(0);
    expect(result.current).toBe(0);
    advance(100);
    // Ease-out: a quarter of the time covers more than a quarter of the way.
    expect(result.current).toBeGreaterThan(25);
    expect(result.current).toBeLessThan(100);
    advance(300);
    expect(result.current).toBe(100);
  });

  it("a new figure counts on from the current one, and unmounting stops the frames", () => {
    stubMotion(false);
    const advance = stubFrames();
    const { result, rerender, unmount } = renderHook(({ n }) => useCountUp(n, 200), { initialProps: { n: 10 } });
    advance(0);
    advance(200);
    expect(result.current).toBe(10);
    rerender({ n: 20 });
    advance(0);
    expect(result.current).toBe(10);
    advance(200);
    expect(result.current).toBe(20);
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
