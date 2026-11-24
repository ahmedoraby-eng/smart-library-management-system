import { useState } from "react";
import { cn } from "../../lib/cn";
import { initials } from "../../lib/format";

const TINTS = ["bg-[#2f6b5e]", "bg-[#3b4a7a]", "bg-[#8a6a2a]", "bg-[#6b3f5e]", "bg-[#4a5d6b]", "bg-[#7a4a3b]"];
const tintFor = (title: string) => TINTS[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length]!;

const SIZES = { sm: "h-11 w-8 text-[11px]", md: "h-16.5 w-12 text-sm", lg: "h-33 w-24 text-xl" } as const;

/** Cover image, or an initials tile when there is no URL or it fails to load. Decorative: the title is always next to it. */
export function BookCover({ title, url, size = "sm" }: { title: string; url: string | null; size?: keyof typeof SIZES }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const show = url && failedUrl !== url;
  return (
    <div
      data-testid="book-cover"
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-sm font-semibold text-white", SIZES[size], !show && tintFor(title))}
    >
      {show ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      ) : (
        <span aria-hidden="true">{initials(title)}</span>
      )}
    </div>
  );
}
