import { BookIcon } from "./ui";
import { cn } from "../lib/cn";

/** The "S" mark: brass serif on the spine (Reading Room); the indigo book square in plain. */
export function LogoMark({ large = false }: { large?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "grid shrink-0 place-items-center rounded-xs border-[1.5px] border-brass-200/80 bg-spine font-book text-brass-200 plain:hidden",
          large ? "h-10 w-10 text-[22px]" : "h-7.5 w-7.5 text-[17px]",
        )}
      >
        S
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "hidden shrink-0 place-items-center bg-brand-600 text-white plain:grid",
          large ? "h-10 w-10 rounded-lg" : "h-7.5 w-7.5 rounded-md",
        )}
      >
        <BookIcon size={large ? 22 : 17} />
      </span>
    </>
  );
}
