import { cn } from "../lib/cn";

/** The Reading Room shelf: [width, height, colour] of each spine (sign-in plate and loading screen). */
export const SHELF: ReadonlyArray<readonly [number, number, string]> = [
  [26, 150, "#2f5a4c"],
  [34, 182, "#8b6a2c"],
  [22, 140, "#6a3b4f"],
  [30, 196, "#3a4668"],
  [24, 160, "#7c3f2f"],
  [38, 174, "#4c5a63"],
  [20, 130, "#2f5a4c"],
  [28, 188, "#a07a3a"],
  [34, 150, "#5a3542"],
  [24, 170, "#2c3a58"],
  [30, 200, "#6d4a22"],
  [22, 144, "#3f5d50"],
  [36, 178, "#7c3f2f"],
  [26, 160, "#4c5a63"],
];

/**
 * A row of book spines standing on their base line. `scale` shrinks the whole shelf (the loading screen uses a
 * small one); `count` keeps the first n spines. The spines rise one after another when motion is allowed.
 */
export function BookShelf({
  scale = 1,
  count = SHELF.length,
  className,
}: {
  scale?: number;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-end", className)}
      style={{ gap: 3 * scale }}
      aria-hidden="true"
      data-testid="book-shelf"
    >
      {SHELF.slice(0, count).map(([w, h, c], i) => (
        <span
          key={i}
          className="relative block origin-bottom rounded-t-[1px] shadow-[inset_2px_0_0_rgb(0_0_0/.2)] motion-safe:animate-[slm-spine-rise_420ms_var(--ease-out)_backwards]"
          style={{ width: w * scale, height: h * scale, background: c, animationDelay: `${i * 45}ms` }}
        >
          <span
            className="absolute right-0.75 left-0.75 h-px bg-[rgb(240_220_170/.5)] shadow-[0_3px_0_rgb(240_220_170/.3)]"
            style={{ top: 14 * scale }}
          />
        </span>
      ))}
    </div>
  );
}
