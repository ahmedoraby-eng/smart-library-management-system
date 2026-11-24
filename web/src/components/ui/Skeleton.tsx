import { cn } from "../../lib/cn";

/** neutral-100 block, 1.2 s pulse, no motion under prefers-reduced-motion. Give it the real content's size. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-neutral-100 motion-safe:animate-[slm-pulse_1.2s_ease-in-out_infinite]", className)}
    />
  );
}
