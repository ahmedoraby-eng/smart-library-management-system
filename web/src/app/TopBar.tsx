import type { BookDto, MemberDto } from "@slm/contracts";
import { useIsFetching, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChevronRightIcon, SearchIcon } from "../components/ui";
import { ThemeToggle } from "../components/ThemeToggle";
import { booksKey } from "../features/books/api";
import { OverdueBell } from "../features/circulation/OverdueBell";
import { membersKey } from "../features/members/api";
import { openCommandPalette } from "../features/palette/CommandPalette";

type SectionTo = "/dashboard" | "/books" | "/members" | "/circulation" | "/loans" | "/discover" | "/admin/users";

const SECTIONS: Record<string, { label: string; to?: SectionTo }> = {
  dashboard: { label: "Dashboard", to: "/dashboard" },
  books: { label: "Books", to: "/books" },
  members: { label: "Members", to: "/members" },
  circulation: { label: "Circulation", to: "/circulation" },
  loans: { label: "Loan history", to: "/loans" },
  discover: { label: "Book discovery", to: "/discover" },
  admin: { label: "Staff users", to: "/admin/users" },
  "403": { label: "No access" },
  "404": { label: "Page not found" },
};

const SUB: Record<string, string> = { new: "New book", edit: "Edit", borrow: "Borrow book", return: "Return book" };

/**
 * A book's or member's name for the breadcrumb, read from the query the page itself loads (same key, never fetched
 * here). Until the page has it, the crumb says "Book" or "Member".
 */
function useRecordName(section: string | undefined, id: string | undefined): string | undefined {
  const isBook = section === "books" && !!id && id !== "new";
  const isMember = section === "members" && !!id;
  const book = useQuery<BookDto>({ queryKey: [...booksKey, "detail", id ?? ""], enabled: false });
  const member = useQuery<MemberDto>({ queryKey: [...membersKey, "detail", id ?? ""], enabled: false });
  if (isBook) return book.data?.title ?? "Book";
  if (isMember) return member.data?.fullName ?? "Member";
  return undefined;
}

export interface Crumb {
  label: string;
  to?: SectionTo;
}

/** The trail for a path: the section, then the record or sub-page, then e.g. "Edit". */
export function useBreadcrumb(pathname: string): Crumb[] {
  const [section, second, third] = pathname.split("/").filter(Boolean);
  const name = useRecordName(section, second);
  const head = SECTIONS[section ?? ""] ?? { label: "Smart Library" };
  if (section === "admin") return [{ label: head.label }];
  const trail: Crumb[] = [{ ...head }];
  if (second) trail.push({ label: name ?? SUB[second] ?? second });
  if (third) trail.push({ label: SUB[third] ?? third });
  return trail;
}

/**
 * The bar across the top of every signed-in page: where you are (breadcrumb, which also names the browser tab),
 * the search that opens the command palette, the overdue bell and the theme switch. It stays at the top while the
 * page scrolls, and a thin brass line runs along its foot while data loads.
 */
export function TopBar({ pathname, showBell }: { pathname: string; showBell: boolean }) {
  const crumbs = useBreadcrumb(pathname);
  const current = crumbs[crumbs.length - 1]!.label;

  useEffect(() => {
    document.title = `${current} · Smart Library`;
  }, [current]);

  return (
    <header
      data-testid="top-bar"
      className="sticky top-0 z-30 -mx-8 mb-6 flex h-14 items-center gap-4 border-b border-border bg-canvas/85 px-8 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-canvas"
    >
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm text-neutral-600">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <ChevronRightIcon size={14} className="shrink-0 text-neutral-400" />}
                {!last && c.to ? (
                  <Link
                    to={c.to}
                    className="link-draw truncate text-neutral-600 no-underline transition-colors hover:text-neutral-900"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={last ? "truncate font-semibold text-neutral-900" : "truncate"}
                    data-testid={last ? "breadcrumb-current" : undefined}
                  >
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <button
        type="button"
        onClick={openCommandPalette}
        data-testid="top-search"
        aria-haspopup="dialog"
        className="flex h-8 w-64 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-neutral-500 shadow-card transition-[border-color,box-shadow,color] duration-150 hover:border-border-strong hover:text-neutral-700 max-lg:w-44"
      >
        <SearchIcon size={15} />
        <span className="truncate">Search books, members…</span>
        <kbd className="ml-auto rounded-xs border border-border px-1 font-mono text-[11px] leading-4 text-neutral-500">
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1 border-l border-border pl-3">
        {showBell && (
          <div data-testid="overdue-bell-slot">
            <OverdueBell />
          </div>
        )}
        <ThemeToggle />
      </div>

      <FetchProgress />
    </header>
  );
}

/** A thin brass line along the foot of the bar while data loads for longer than a moment (decorative). */
function FetchProgress() {
  const fetching = useIsFetching() > 0;
  if (!fetching) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="fetch-progress"
      className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden motion-safe:animate-[slm-fade-in_200ms_ease-out_300ms_backwards]"
    >
      <div className="h-full w-1/3 bg-brass-500 plain:bg-brand-600 motion-safe:animate-[slm-progress_1.1s_var(--ease-out)_infinite]" />
    </div>
  );
}
