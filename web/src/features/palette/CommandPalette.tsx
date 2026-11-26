import type { Permission } from "@slm/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AvailabilityBadge,
  BookIcon,
  DashboardIcon,
  HistoryIcon,
  LampIcon,
  MemberCardIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  Spinner,
  SwapIcon,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { useDebounced } from "../../lib/useDebounced";
import { useCan } from "../auth/session";
import { useBookSearch, useMemberSearch } from "../circulation/api";

type Navigate = ReturnType<typeof useNavigate>;
type Group = "Actions" | "Members" | "Books";

interface Item {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  icon: ReactNode;
  trailing?: ReactNode;
  go: (navigate: Navigate) => unknown;
}

interface StaticAction extends Omit<Item, "group"> {
  /** Hidden when the role lacks this permission (the API enforces it anyway). */
  needs?: Permission;
  /** Extra words the query matches besides the label. */
  keywords?: string;
}

/** Static actions: the sidebar's pages plus the desk's everyday jobs. Write actions need a write permission. */
const ACTIONS: StaticAction[] = [
  { id: "a-dashboard", label: "Dashboard", icon: <DashboardIcon size={16} />, go: (n) => n({ to: "/dashboard" }) },
  {
    id: "a-borrow",
    label: "Borrow a book",
    needs: "LOAN_PROCESS",
    keywords: "circulation loan lend check out",
    icon: <SwapIcon size={16} />,
    go: (n) => n({ to: "/circulation/borrow", search: {} }),
  },
  {
    id: "a-return",
    label: "Return a book",
    needs: "LOAN_PROCESS",
    keywords: "circulation loan check in",
    icon: <SwapIcon size={16} />,
    go: (n) => n({ to: "/circulation/return", search: { page: 1 } }),
  },
  {
    id: "a-add-book",
    label: "Add book",
    needs: "BOOK_WRITE",
    keywords: "new catalogue",
    icon: <PlusIcon size={16} />,
    go: (n) => n({ to: "/books/new" }),
  },
  {
    id: "a-overdue",
    label: "Loan history · Overdue",
    needs: "LOAN_READ",
    keywords: "late loans",
    icon: <HistoryIcon size={16} />,
    go: (n) => n({ to: "/loans", search: { status: "OVERDUE" } }),
  },
  {
    id: "a-loans",
    label: "Loan history",
    needs: "LOAN_READ",
    keywords: "loans",
    icon: <HistoryIcon size={16} />,
    go: (n) => n({ to: "/loans", search: {} }),
  },
  {
    id: "a-books",
    label: "Books",
    needs: "BOOK_READ",
    keywords: "catalogue",
    icon: <BookIcon size={16} />,
    go: (n) => n({ to: "/books", search: {} }),
  },
  {
    id: "a-members",
    label: "Members",
    needs: "MEMBER_READ",
    icon: <MemberCardIcon size={16} />,
    go: (n) => n({ to: "/members", search: {} }),
  },
  {
    id: "a-discover",
    label: "Book discovery",
    needs: "AI_DISCOVER",
    keywords: "ai recommend suggest",
    icon: <LampIcon size={16} />,
    go: (n) => n({ to: "/discover" }),
  },
  {
    id: "a-staff",
    label: "Staff users",
    needs: "STAFF_MANAGE",
    keywords: "admin roles",
    icon: <ShieldIcon size={16} />,
    go: (n) => n({ to: "/admin/users", search: {} }),
  },
];

/** At most this many members and books each, so the actions stay in view. */
const MAX_RESULTS = 5;

/** Every word of the query appears in the text (case-insensitive). */
export function matches(query: string, text: string): boolean {
  const hay = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

const OPEN_EVENT = "slm:open-palette";

/** Opens the palette from elsewhere (the top bar's search box). */
export function openCommandPalette(): void {
  document.dispatchEvent(new Event(OPEN_EVENT));
}

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * Command palette (SLM-20): ⌘K / Ctrl K anywhere in the signed-in app. One search box that finds books and
 * members as you type (debounced, the same GET /api/books?q= and /api/members?q= as Borrow) and offers actions,
 * filtered by the signed-in role. ARIA combobox + listbox with aria-activedescendant (as `Combobox`); the dialog
 * traps focus and gives it back on close (as `Modal`). Renders its own trigger: a "Search ⌘K" item in the sidebar.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      // A field that uses ⌘K itself handles it first and prevents the default: leave it alone.
      if (e.defaultPrevented) return;
      // Never on top of another dialog (a confirm in progress keeps its own focus trap).
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    document.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [open]);

  const mac = isMac();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Search and actions (${mac ? "⌘K" : "Ctrl K"})`}
        aria-keyshortcuts="Meta+K Control+K"
        aria-haspopup="dialog"
        data-testid="palette-trigger"
        className="mr-2 mb-3 flex items-center gap-2.5 rounded-md border border-spine-line px-2.5 py-1.5 text-sm text-spine-muted hover:bg-white/5 max-xl:justify-center xl:mr-3 plain:mr-0 plain:border-border plain:hover:bg-neutral-50 plain:xl:mr-0"
      >
        <SearchIcon size={16} />
        <span className="hidden xl:inline">Search</span>
        <kbd className="ml-auto hidden rounded-xs border border-spine-line px-1 font-mono text-[11px] leading-4 xl:inline plain:border-border">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {open && <PaletteDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const listId = `${id}-list`;
  const titleId = `${id}-title`;
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const can = useCan();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  // Focus the search box; on close give focus back to whatever opened the palette (as Modal).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const q = useDebounced(text.trim());
  // A role without the read permission sends no request (an empty query disables the hook).
  const members = useMemberSearch(can("MEMBER_READ") ? q : "");
  const books = useBookSearch(can("BOOK_READ") ? q : "");
  // Only hits for what is typed now (D-45-1): while the debounce settles, or while a new query is still in flight
  // (the hooks keep the previous data as a placeholder), the old hits are hidden so Enter can't open them.
  const settled = q === text.trim();
  const hitsOf = <T,>(r: { data?: { items: T[] }; isPlaceholderData: boolean }) =>
    q && settled && !r.isPlaceholderData ? (r.data?.items ?? []).slice(0, MAX_RESULTS) : [];
  const memberHits = hitsOf(members);
  const bookHits = hitsOf(books);
  const loading = Boolean(text.trim()) && (!settled || members.isFetching || books.isFetching);

  const actions: Item[] = ACTIONS.filter(
    (a) => (!a.needs || can(a.needs)) && matches(text.trim(), `${a.label} ${a.keywords ?? ""}`),
  ).map(({ needs: _needs, keywords: _keywords, ...a }) => ({ ...a, group: "Actions" }));
  // "Borrow for <member>" first: the quickest way from a name to the Borrow page, member already picked.
  const borrowFor: Item[] = can("LOAN_PROCESS")
    ? memberHits
        .filter((m) => m.status === "ACTIVE")
        .map((m) => ({
          id: `borrow-${m.id}`,
          group: "Actions",
          label: `Borrow for ${m.fullName}`,
          hint: m.memberNumber,
          icon: <SwapIcon size={16} />,
          go: (n) => n({ to: "/circulation/borrow", search: { member: m.id } }),
        }))
    : [];
  const items: Item[] = [
    ...borrowFor,
    ...actions,
    ...memberHits.map<Item>((m) => ({
      id: `member-${m.id}`,
      group: "Members",
      label: m.fullName,
      hint: `${m.memberNumber} · ${m.email}`,
      icon: <MemberCardIcon size={16} />,
      go: (n) => n({ to: "/members/$memberId", params: { memberId: m.id } }),
    })),
    ...bookHits.map<Item>((b) => ({
      id: `book-${b.id}`,
      group: "Books",
      label: b.title,
      hint: b.author,
      icon: <BookIcon size={16} />,
      trailing: <AvailabilityBadge book={b} compact />,
      go: (n) => n({ to: "/books/$bookId", params: { bookId: b.id } }),
    })),
  ];

  // New results: back to the first item, so Enter runs the best match.
  const signature = items.map((i) => i.id).join("|");
  useEffect(() => setActive(0), [signature]);
  const current = items[Math.min(active, items.length - 1)];
  const optId = (i: number) => `${id}-opt-${i}`;
  useEffect(() => {
    document.getElementById(optId(active))?.scrollIntoView?.({ block: "nearest" });
    // optId only depends on the stable useId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    void item.go(navigate);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(current);
    } else if (e.key === "Tab") {
      // The search box is the only focusable element: Tab stays in the dialog (focus trap).
      e.preventDefault();
    }
  };

  const groups: Group[] = ["Actions", "Members", "Books"];
  let index = -1;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 p-4 pt-[12vh] motion-safe:animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-testid="palette-scrim"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="command-palette"
        className="w-full max-w-140 origin-top overflow-hidden rounded-xl border border-border bg-surface shadow-pop motion-safe:animate-dialog-in"
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          Search and actions
        </h2>
        <div className="relative border-b border-border">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-neutral-500">
            {loading ? <Spinner /> : <SearchIcon size={16} />}
          </div>
          <input
            ref={input}
            role="combobox"
            aria-label="Search books, members and actions"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? optId(items.indexOf(current)) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search books, members and actions…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="palette-input"
            className="block h-12 w-full bg-transparent pr-4 pl-11 text-md text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
          />
        </div>
        <div id={listId} role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto p-1">
          {groups.map((g) => {
            const inGroup = items.filter((i) => i.group === g);
            if (inGroup.length === 0) return null;
            const headId = `${id}-${g}`;
            return (
              <div key={g} role="group" aria-labelledby={headId}>
                <div
                  id={headId}
                  className="px-2.5 pt-2 pb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase"
                >
                  {g}
                </div>
                {inGroup.map((item) => {
                  index += 1;
                  const i = index;
                  const selected = item === current;
                  return (
                    <div
                      key={item.id}
                      id={optId(i)}
                      role="option"
                      aria-selected={selected}
                      data-testid="palette-option"
                      data-group={g}
                      // mousedown, not click: keeps focus in the search box.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        run(item);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2",
                        selected && "bg-brand-50",
                      )}
                    >
                      <span className="shrink-0 text-neutral-500">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-neutral-900">{item.label}</span>
                        {item.hint && <span className="block truncate text-sm text-neutral-600">{item.hint}</span>}
                      </span>
                      {item.trailing}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {items.length === 0 && !loading && (
            <p className="px-2.5 py-3 text-sm text-neutral-600" data-testid="palette-empty">
              No matches. Try a title, an author, a member's name or number.
            </p>
          )}
        </div>
        <div className="border-t border-border px-3 py-1.5 text-xs text-neutral-500">
          ↑↓ move · Enter open · Esc close
        </div>
      </div>
    </div>,
    document.body,
  );
}
