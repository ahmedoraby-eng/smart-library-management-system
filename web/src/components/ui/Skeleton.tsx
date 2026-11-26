import { cn } from "../../lib/cn";

/**
 * neutral-100 block with a soft light sweeping across it (1.4 s), still under prefers-reduced-motion.
 * Give it the real content's size.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative overflow-hidden rounded-md bg-neutral-100", className)}>
      <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/55 to-transparent motion-safe:animate-[slm-sheen_1.4s_ease-in-out_infinite]" />
    </div>
  );
}
