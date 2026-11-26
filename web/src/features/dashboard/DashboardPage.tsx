import type { DashboardSummary } from "@slm/contracts";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  AvailabilityBadge,
  Badge,
  BookIcon,
  Button,
  buttonClasses,
  Card,
  CardHeader,
  EmptyState,
  HistoryIcon,
  InlineAlert,
  PlusIcon,
  Skeleton,
  SwapIcon,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  UsersIcon,
  useToast,
} from "../../components/ui";
import { MemberNumber } from "../../components/MemberNumber";
import { cn } from "../../lib/cn";
import { formatDate, formatDay } from "../../lib/format";
import { useCan, useMe } from "../auth/session";
import { BookCover } from "../books/BookCover";
import { LoanStatusBadge } from "../circulation/LoanStatusBadge";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../lib/apiClient";
import { reindexBatch, useAiUsageToday, useDashboard } from "./api";
import { availabilitySegments, dismissNotice, isNoticeDismissed } from "./model";
import { useCountUp } from "../../lib/useCountUp";

/** Card-header links: brand-700, semibold. */
const cardLink = "link-draw text-base font-semibold text-brand-700 no-underline";

type Kpis = DashboardSummary["kpis"];
const today = () =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(),
  );

export function DashboardPage() {
  const dash = useDashboard();
  const can = useCan();
  const me = useMe().data;
  const [noticeHidden, setNoticeHidden] = useState(isNoticeDismissed);
  const data = dash.data;

  return (
    <>
      <header className="page-head mb-6 flex items-start justify-between gap-4 max-sm:flex-wrap">
        <div>
          <h1 className="font-book text-title plain:tracking-tight">Dashboard</h1>
          <p className="mt-1 text-neutral-600" data-testid="today">
            {today()}
          </p>
          <AiUsageLine enabled={can("STAFF_MANAGE")} />
        </div>
        {can("LOAN_PROCESS") && (
          <div className="flex gap-2">
            <Link
              to="/circulation/return"
              className={buttonClasses({ variant: "secondary" })}
              data-testid="dash-return"
            >
              <SwapIcon size={16} /> Return book
            </Link>
            <Link to="/circulation/borrow" className={buttonClasses({ variant: "primary" })} data-testid="dash-borrow">
              <PlusIcon size={16} /> Borrow book
            </Link>
          </div>
        )}
      </header>

      {me?.role === "SUPERVISOR" && !noticeHidden && (
        <InlineAlert
          variant="info"
          className="mb-4"
          testId="supervisor-notice"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                dismissNotice();
                setNoticeHidden(true);
              }}
              data-testid="dismiss-notice"
            >
              Dismiss
            </Button>
          }
        >
          You're signed in with read-only access (Supervisor). To try borrowing and returns, sign in with the demo
          Librarian account from the submission.
        </InlineAlert>
      )}

      {dash.isError && !data ? (
        <InlineAlert
          variant="danger"
          testId="dashboard-error"
          action={
            <Button size="sm" onClick={() => void dash.refetch()}>
              Try again
            </Button>
          }
        >
          Couldn't load the dashboard. Check your connection and try again.
        </InlineAlert>
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="slm-stagger flex flex-col gap-4">
          <KpiCards k={data.kpis} />
          <div className="grid items-start gap-4 max-xl:grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_22rem]">
            <RecentBorrowings rows={data.recentBorrowings} canBorrow={can("LOAN_PROCESS")} />
            <div className="flex flex-col gap-4">
              <PopularBooks books={data.popularBooks} />
              <RecentlyAdded books={data.recentlyAdded} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Reading Room: one ledger strip, figures split by hairlines, label as an eyebrow (no icon).
 * Plain: four separate cards with an icon, as before.
 */
/** Admin only: one quiet line with today's AI spend against the daily Neuron cap (SLM-16 cost controls). */
function AiUsageLine({ enabled }: { enabled: boolean }) {
  const usage = useAiUsageToday(enabled);
  if (!enabled || !usage.data) return null;
  const u = usage.data;
  const n = (x: number) => Math.round(x).toLocaleString("en-GB");
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
      <p className="tabular-nums" data-testid="ai-usage-today">
        AI usage today: {n(u.neurons)} / {n(u.neuronCap)} Neurons · {u.searches} AI-assisted{" "}
        {u.searches === 1 ? "search" : "searches"}
      </p>
      <RebuildIndex />
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RebuildProgress {
  done: number;
  total: number;
  /** Seconds until the next batch while waiting out the 2-a-minute limit; null while a batch runs. */
  waitS: number | null;
}

/**
 * Admin: rebuild the search-by-meaning index now (after a deploy, or a model change). Runs the reindex
 * batches (8 books each, to stay inside the Worker's CPU limit) until nothing is left, and waits out the
 * endpoint's 2-a-minute limit instead of failing. Only missing or changed books cost AI; the rest is copied.
 */
function RebuildIndex() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RebuildProgress | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const run = async () => {
    setRunning(true);
    setProgress({ done: 0, total: 0, waitS: null });
    let last: RebuildProgress = { done: 0, total: 0, waitS: null };
    try {
      for (let round = 0; round < 50 && alive.current; round++) {
        let batch;
        try {
          batch = await reindexBatch();
        } catch (e) {
          if (e instanceof ApiError && e.status === 429) {
            // Keep the bar where it is and count down to the next batch, so it never looks frozen.
            for (let s = e.retryAfter ?? 60; s > 0 && alive.current; s--) {
              setProgress({ ...last, waitS: s });
              await sleep(1000);
            }
            setProgress({ ...last, waitS: null });
            continue;
          }
          throw e;
        }
        if (batch.result === "disabled") {
          toast.error("Search by meaning isn't set up on this server.");
          return;
        }
        last = { done: Math.max(batch.total - batch.remaining, 0), total: batch.total, waitS: null };
        setProgress(last);
        if (batch.remaining <= 0) {
          toast.success("The search index is up to date.");
          void queryClient.invalidateQueries({ queryKey: ["ai-usage-today"] });
          return;
        }
      }
    } catch {
      toast.error("Couldn't rebuild the search index. Try again.");
    } finally {
      if (alive.current) {
        setRunning(false);
        setProgress(null);
      }
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => void run()} loading={running} data-testid="rebuild-index">
        Rebuild search index
      </Button>
      {progress && <RebuildBar progress={progress} />}
    </>
  );
}

/** Determinate bar: "X of Y books · Z%", and a countdown to the next batch while the rate limit holds it. */
function RebuildBar({ progress: { done, total, waitS } }: { progress: RebuildProgress }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="basis-full" data-testid="rebuild-index-progress">
      <div
        role="progressbar"
        aria-label="Rebuilding the search index"
        aria-valuemin={0}
        aria-valuemax={total || 100}
        aria-valuenow={done}
        aria-valuetext={total ? `${done} of ${total} books` : "Starting"}
        className="mt-1.5 h-1.5 w-72 max-w-full overflow-hidden rounded-xs bg-neutral-100"
      >
        <div className="h-full rounded-xs bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p
        className="mt-1 text-xs text-neutral-600 tabular-nums"
        role="status"
        aria-live="polite"
        data-testid="rebuild-index-status"
      >
        {total ? `${done} of ${total} books · ${pct}%` : "Starting…"}
        {waitS !== null && <span data-testid="rebuild-index-wait"> · next batch in {waitS}s</span>}
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  testId,
  children,
}: {
  icon: ReactNode;
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      className="border-border px-5.5 pt-4 pb-4.5 transition-colors duration-200 hover:bg-neutral-25 rr:max-xl:even:border-l rr:max-xl:[&:nth-child(n+3)]:border-t rr:xl:[&:not(:first-child)]:border-l plain:rounded-xl plain:border plain:bg-surface plain:p-5 plain:shadow-card"
      data-testid={testId}
    >
      <div className="flex items-center gap-2 text-neutral-600">
        <span className="hidden plain:inline-flex">{icon}</span>
        <h2 className="eyebrow plain:text-base">{label}</h2>
      </div>
      {children}
    </div>
  );
}

/** A key figure that counts up when the dashboard arrives (still under reduced motion). */
function CountUp({ value, testId }: { value: number; testId: string }) {
  const shown = useCountUp(value);
  return (
    <span className="font-book text-kpi tracking-[-0.02em] tabular-nums" data-testid={testId}>
      {shown.toLocaleString("en-GB")}
    </span>
  );
}

const KpiValue = ({ value, unit, testId }: { value: number; unit?: string; testId: string }) => (
  <p className="mt-3 flex items-baseline gap-2">
    <CountUp value={value} testId={testId} />
    {unit && <span className="text-md text-neutral-600">{unit}</span>}
  </p>
);

function KpiCards({ k }: { k: Kpis }) {
  const seg = availabilitySegments(k);
  return (
    <section
      aria-label="Key figures"
      className="slm-stagger grid grid-cols-2 xl:grid-cols-4 rr:rounded-xl rr:border rr:border-border rr:bg-surface rr:shadow-card plain:gap-4"
    >
      <KpiCard icon={<BookIcon size={16} />} label="Catalog" testId="kpi-catalog">
        <KpiValue value={k.totalTitles} unit={k.totalTitles === 1 ? "title" : "titles"} testId="kpi-titles" />
        <p className="mt-3 text-base text-neutral-600">
          <b className="font-semibold text-neutral-900 tabular-nums" data-testid="kpi-total-copies">
            {k.totalCopies.toLocaleString("en-GB")}
          </b>{" "}
          physical {k.totalCopies === 1 ? "copy" : "copies"}
        </p>
      </KpiCard>

      <KpiCard icon={<BookIcon size={16} />} label="Available copies" testId="kpi-available">
        <p className="mt-3 flex items-baseline gap-2">
          <CountUp value={k.availableCopies} testId="kpi-available-copies" />
          <span className="text-md text-neutral-600">of {k.totalCopies.toLocaleString("en-GB")}</span>
        </p>
        <AvailabilityBar seg={seg} />
      </KpiCard>

      <KpiCard icon={<SwapIcon size={16} />} label="Active loans" testId="kpi-loans">
        <KpiValue value={k.activeLoans} testId="kpi-active-loans" />
        <div className="mt-3 flex items-center justify-between gap-2">
          {k.overdueLoans > 0 ? (
            <>
              <Badge variant="danger" data-testid="kpi-overdue">
                {k.overdueLoans} overdue
              </Badge>
              <Link
                to="/loans"
                search={{ status: "OVERDUE", page: 1, size: 20 }}
                className={cardLink}
                data-testid="view-overdue"
              >
                View overdue
              </Link>
            </>
          ) : (
            <span className="text-base text-neutral-600" data-testid="kpi-overdue-none">
              None overdue
            </span>
          )}
        </div>
      </KpiCard>

      <KpiCard icon={<UsersIcon size={16} />} label="Active members" testId="kpi-members">
        <KpiValue value={k.activeMembers} testId="kpi-active-members" />
        <p className="mt-3 text-base text-neutral-600">
          <span className="tabular-nums" data-testid="kpi-inactive-members">
            {k.inactiveMembers}
          </span>{" "}
          inactive
        </p>
      </KpiCard>
    </section>
  );
}

function AvailabilityBar({ seg }: { seg: ReturnType<typeof availabilitySegments> }) {
  const pct = (n: number) => (seg.total > 0 ? `${(n / seg.total) * 100}%` : "0%");
  const items = [
    { key: "available", label: "Available", n: seg.available, dot: "bg-success-500" },
    { key: "on-loan", label: "On loan", n: seg.onLoan, dot: "bg-brand-500" },
    { key: "overdue", label: "Overdue", n: seg.overdue, dot: "bg-danger-500" },
  ];
  return (
    <>
      <div
        role="img"
        aria-label={`${seg.available} available, ${seg.onLoan} on loan, ${seg.overdue} overdue, of ${seg.total} copies`}
        className="mt-3.5 h-2 overflow-hidden rounded-full bg-neutral-100"
        data-testid="availability-bar"
      >
        {/* The filled part sweeps in from the left once the figures arrive. */}
        <div className="flex h-full origin-left motion-safe:animate-grow-x">
          {items.map((i) => (
            <div key={i.key} className={i.dot} style={{ width: pct(i.n) }} data-segment={i.key} />
          ))}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 whitespace-nowrap text-xs text-neutral-600">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", i.dot)} aria-hidden="true" />
            {i.label} <span className="tabular-nums">{i.n}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function RecentBorrowings({ rows, canBorrow }: { rows: DashboardSummary["recentBorrowings"]; canBorrow: boolean }) {
  return (
    <Card data-testid="recent-borrowings">
      <CardHeader
        title="Recent borrowings"
        action={
          <Link to="/loans" search={{ page: 1, size: 20 }} className={cardLink}>
            View loan history
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          testId="recent-empty"
          icon={<HistoryIcon size={40} />}
          title="No loans yet"
          text="Borrowings you record will show here."
          action={
            canBorrow ? (
              <Link to="/circulation/borrow" className={buttonClasses({ variant: "primary" })}>
                Borrow book
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Table aria-label="Recent borrowings" data-testid="recent-table">
          <Thead>
            <tr>
              <Th>Book</Th>
              <Th>Member</Th>
              <Th className="max-wide:hidden">Borrowed</Th>
              <Th>Due</Th>
              <Th>Status</Th>
            </tr>
          </Thead>
          <tbody>
            {rows.map((l) => (
              <Tr
                key={l.id}
                className={l.status === "OVERDUE" ? "bg-overdue" : undefined}
                data-testid="recent-row"
                data-status={l.status}
              >
                <Td>
                  <Link
                    to="/books/$bookId"
                    params={{ bookId: l.book.id }}
                    className="tap-y font-book text-md text-neutral-900 no-underline hover:underline plain:text-base"
                  >
                    {l.book.title}
                  </Link>
                  <div className="text-sm text-neutral-600">{l.book.author}</div>
                </Td>
                <Td>
                  <div className="font-semibold">{l.member.fullName}</div>
                  <div className="text-sm text-neutral-600">
                    <MemberNumber value={l.member.memberNumber} />
                  </div>
                </Td>
                <Td kind="num" className="max-wide:hidden">
                  {formatDate(l.borrowedAt)}
                </Td>
                <Td kind="num" className={cn(l.status === "OVERDUE" && "font-semibold text-danger-700")}>
                  {formatDate(l.dueAt)}
                </Td>
                <Td kind="nowrap">
                  <LoanStatusBadge loan={l} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function PopularBooks({ books }: { books: DashboardSummary["popularBooks"] }) {
  return (
    <Card data-testid="popular-books">
      <CardHeader
        title="Popular books"
        action={<span className="text-sm text-neutral-600">Loans, last 30 days</span>}
      />
      {books.length === 0 ? (
        <p className="px-5 py-8 text-center text-base text-neutral-600" data-testid="popular-empty">
          No loans in the last 30 days.
        </p>
      ) : (
        <ol className="slm-stagger">
          {books.map((b, i) => (
            <li
              key={b.id}
              className="flex items-center gap-3 border-b border-border px-5 py-3 transition-colors duration-200 last:border-b-0 hover:bg-neutral-25"
              data-testid="popular-row"
            >
              <span className="w-5 text-right font-book text-[20px] leading-6 text-brass-500 tabular-nums book-italic plain:w-3 plain:text-left plain:text-sm plain:font-normal plain:text-neutral-600">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  to="/books/$bookId"
                  params={{ bookId: b.id }}
                  className="tap-y block truncate font-book text-md text-neutral-900 no-underline hover:underline plain:text-base"
                >
                  {b.title}
                </Link>
                <span className="text-sm text-neutral-600">
                  {b.loansLast30Days} {b.loansLast30Days === 1 ? "loan" : "loans"}
                </span>
              </div>
              <AvailabilityBadge book={b} compact />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function RecentlyAdded({ books }: { books: DashboardSummary["recentlyAdded"] }) {
  return (
    <Card data-testid="recently-added">
      <CardHeader
        title="Recently added"
        action={
          <Link to="/books" search={{ page: 1, size: 20, sort: "-createdAt" }} className={cardLink}>
            All books
          </Link>
        }
      />
      {books.length === 0 ? (
        <p className="px-5 py-8 text-center text-base text-neutral-600" data-testid="added-empty">
          No books yet.
        </p>
      ) : (
        <ul className="slm-stagger">
          {books.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 border-b border-border px-5 py-3 transition-colors duration-200 last:border-b-0 hover:bg-neutral-25"
              data-testid="added-row"
            >
              <BookCover title={b.title} url={b.coverImageUrl} />
              <div className="min-w-0">
                <Link
                  to="/books/$bookId"
                  params={{ bookId: b.id }}
                  className="tap-y block truncate font-book text-md text-neutral-900 no-underline hover:underline plain:text-base"
                >
                  {b.title}
                </Link>
                <span className="text-sm text-neutral-600">
                  Added {formatDay(b.createdAt)} · {b.totalCopies} {b.totalCopies === 1 ? "copy" : "copies"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="dashboard-loading" aria-busy="true">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96 rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
