import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion";

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts a figure up to `target` with an ease-out over `durationMs` the first time it is shown, and from the old
 * value to the new one when it changes. Under reduced motion it returns the target at once.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const still = prefersReducedMotion();
  const [value, setValue] = useState(still ? target : 0);
  const from = useRef(still ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = Math.round(origin + (target - origin) * easeOutCubic(t));
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
