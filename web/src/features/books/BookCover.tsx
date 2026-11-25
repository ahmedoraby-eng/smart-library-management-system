import { useState } from "react";
import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";

const TINTS = ["bg-[#2f5a4c]", "bg-[#3a4668]", "bg-[#8b6a2c]", "bg-[#6a3b4f]", "bg-[#4c5a63]", "bg-[#7c3f2f]"];
const tintFor = (title: string) => TINTS[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]!;

const SIZES = { sm: "h-11 w-8 text-[11px]", md: "h-16.5 w-12 text-sm", lg: "h-33 w-24 text-xl" } as const;

/**
 * Cover image, or a book spine with initials when there is no URL or it fails to load (a flat initials
 * tile in the plain theme). Decorative: the title is always next to it.
 */
export function BookCover({
  title,
  url,
  size = "sm",
}: {
  title: string;
  url: string | null;
  size?: keyof typeof SIZES;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const show = url && failedUrl !== url;
  return (
    <div
      data-testid="book-cover"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[1px_3px_3px_1px] font-book text-[#fbf3e2] plain:rounded-sm plain:font-semibold plain:text-white",
        SIZES[size],
        !show && tintFor(title),
        !show && "shadow-[inset_3px_0_0_rgb(0_0_0/.22)] plain:shadow-none",
      )}
    >
      {show ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <>
          <span
            aria-hidden="true"
            className="absolute top-[7px] right-1 left-1.5 h-px bg-[#f0dcaa]/65 shadow-[0_2px_0_rgb(240_220_170/.35)] plain:hidden"
          />
          <span aria-hidden="true">{initials(title)}</span>
        </>
      )}
    </div>
  );
}
