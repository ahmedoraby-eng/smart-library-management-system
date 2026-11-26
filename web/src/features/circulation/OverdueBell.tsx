import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { BellIcon, Skeleton } from "../../components/ui";
import { useLoans } from "./api";
import { overdueDays } from "./loanFormat";

const TOP = 5;

/**
 * SLM-18 overdue alerts: a bell in the page corner (ADR-0116: no top bar) with the number of overdue loans.
 * It reuses the loan list query (status=OVERDUE, most overdue first, the API's one derivation), so a renew,
 * return or borrow refreshes it with the lists. The popover lists the top five, each linking to Loan history
 * scoped to that member and book, plus «View all overdue». Esc closes it and returns focus to the bell.
 */
export function OverdueBell() {
  const overdue = useLoans({ status: "OVERDUE", size: TOP });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const total = overdue.data?.total;

  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLElement>("[data-bell-item]")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const els = Array.from(box.current?.querySelectorAll<HTMLElement>("[data-bell-item]") ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    }
  };

  const label = total === undefined ? "Overdue loans" : total === 0 ? "Overdue loans: none" : `Overdue loans: ${total}`;
  const close = () => setOpen(false);

  return (
    <div
      ref={box}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Tabbing out closes it; a click outside is the mousedown handler's.
        if (e.relatedTarget && !box.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
        data-testid="overdue-bell"
        className="relative grid h-8 w-8 place-items-center rounded-md text-neutral-600 transition-colors duration-150 hover:bg-neutral-100 aria-expanded:bg-neutral-100"
      >
        <BellIcon size={18} />
        {total !== undefined && total > 0 && (
          <span
            aria-hidden="true"
            data-testid="overdue-count"
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger-600 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums motion-safe:animate-[slm-dialog-in_240ms_var(--ease-out)_backwards]"
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Overdue loans"
          data-testid="overdue-popover"
          className="absolute top-full right-0 z-50 mt-2 w-80 origin-top-right rounded-lg border border-border bg-surface p-1 text-left shadow-pop motion-safe:animate-pop-in"
        >
          <p className="px-2.5 pt-2 pb-1.5 text-sm font-semibold text-neutral-900">
            Overdue loans{total ? ` (${total})` : ""}
          </p>
          {overdue.isError && !overdue.data ? (
            <p className="px-2.5 pb-2.5 text-sm text-danger-700" data-testid="overdue-error">
              Couldn't load overdue loans. Try again in a moment.
            </p>
          ) : !overdue.data ? (
            <div className="space-y-2 px-2.5 pt-1 pb-2.5" data-testid="overdue-loading">
              <span className="sr-only">Loading…</span>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : overdue.data.items.length === 0 ? (
            <p className="px-2.5 pb-2.5 text-sm text-neutral-600" data-testid="overdue-none">
              No overdue loans.
            </p>
          ) : (
            <>
              <ul className="slm-stagger">
                {overdue.data.items.map((loan) => {
                  const days = overdueDays(loan);
                  return (
                    <li key={loan.id}>
                      <Link
                        to="/loans"
                        search={{
                          status: "OVERDUE",
                          memberId: loan.member.id,
                          bookId: loan.book.id,
                          page: 1,
                          size: 20,
                        }}
                        onClick={close}
                        data-bell-item
                        data-testid="overdue-item"
                        className="block rounded-md px-2.5 py-2 text-neutral-900 no-underline transition-colors duration-150 hover:bg-neutral-50"
                      >
                        <span className="block truncate font-medium">{loan.member.fullName}</span>
                        <span className="flex justify-between gap-3 text-sm text-neutral-600">
                          <span className="truncate font-book">{loan.book.title}</span>
                          <span className="shrink-0 font-semibold text-danger-700 tabular-nums">
                            {days} {days === 1 ? "day" : "days"} overdue
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-1 border-t border-border pt-1">
                <Link
                  to="/loans"
                  search={{ status: "OVERDUE", page: 1, size: 20 }}
                  onClick={close}
                  data-bell-item
                  data-testid="overdue-view-all"
                  className="block rounded-md px-2.5 py-2 text-sm font-semibold text-brand-700 no-underline hover:bg-neutral-50"
                >
                  View all overdue
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
