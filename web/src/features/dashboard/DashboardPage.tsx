import type { DashboardSummary } from "@slm/contracts";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
  AvailabilityBadge, Badge, BookIcon, Button, buttonClasses, Card, CardHeader, EmptyState, HistoryIcon, InlineAlert, PlusIcon,
  Skeleton, SwapIcon, Table, Td, Th, Thead, Tr, UsersIcon,
} from "../../components/ui";
import { MemberNumber } from "../../components/MemberNumber";
import { cn } from "../../lib/cn";
import { formatDate, formatDay } from "../../lib/format";
import { useCan, useMe } from "../auth/session";
import { BookCover } from "../books/BookCover";
import { LoanStatusBadge } from "../circulation/LoanStatusBadge";
import { useDashboard } from "./api";
import { availabilitySegments, daysOverdue, dismissNotice, isNoticeDismissed } from "./model";

/** Card-header links: brand-700, semibold. */
const cardLink = "text-base font-semibold text-brand-700";

type Kpis = DashboardSummary["kpis"];
const today = () => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

export function DashboardPage() {
  const dash = useDashboard();
  const can = useCan();
  const me = useMe().data;
  const [noticeHidden, setNoticeHidden] = useState(isNoticeDismissed);
  const data = dash.data;

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-neutral-600" data-testid="today">{today()}</p>
        </div>
        {can("LOAN_PROCESS") && (
          <div className="flex gap-2">
            <Link to="/circulation/return" className={buttonClasses({ variant: "secondary" })} data-testid="dash-return">
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
            <Button size="sm" variant="ghost" onClick={() => { dismissNotice(); setNoticeHidden(true); }} data-testid="dismiss-notice">
              Dismiss
            </Button>
          }
        >
          You're signed in with read-only access (Supervisor). To try borrowing and returns, sign in with the demo Librarian account from the submission.
        </InlineAlert>
      )}

      {dash.isError && !data ? (
        <InlineAlert variant="danger" testId="dashboard-error" action={<Button size="sm" onClick={() => void dash.refetch()}>Try again</Button>}>
          Couldn't load the dashboard. Check your connection and try again.
        </InlineAlert>
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <KpiCards k={data.kpis} />
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
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

function KpiCard({ icon, label, testId, children }: { icon: ReactNode; label: string; testId: string; children: ReactNode }) {
  return (
    <Card className="p-5" data-testid={testId}>
      <div className="flex items-center gap-2 text-neutral-600">{icon}<h2 className="text-base font-medium">{label}</h2></div>
      {children}
    </Card>
  );
}

const KpiValue = ({ value, unit, testId }: { value: number; unit?: string; testId: string }) => (
  <p className="mt-3 flex items-baseline gap-2">
    <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums" data-testid={testId}>{value.toLocaleString("en-GB")}</span>
    {unit && <span className="text-md text-neutral-600">{unit}</span>}
  </p>
);

function KpiCards({ k }: { k: Kpis }) {
  const seg = availabilitySegments(k);
  return (
    <section aria-label="Key figures" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <KpiCard icon={<BookIcon size={16} />} label="Catalog" testId="kpi-catalog">
        <KpiValue value={k.totalTitles} unit={k.totalTitles === 1 ? "title" : "titles"} testId="kpi-titles" />
        <p className="mt-3 text-base text-neutral-600"><b className="font-semibold text-neutral-900 tabular-nums" data-testid="kpi-total-copies">{k.totalCopies.toLocaleString("en-GB")}</b> physical {k.totalCopies === 1 ? "copy" : "copies"}</p>
      </KpiCard>

      <KpiCard icon={<BookIcon size={16} />} label="Available copies" testId="kpi-available">
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-[-0.02em] tabular-nums" data-testid="kpi-available-copies">{k.availableCopies.toLocaleString("en-GB")}</span>
          <span className="text-md text-neutral-600">of {k.totalCopies.toLocaleString("en-GB")}</span>
        </p>
        <AvailabilityBar seg={seg} />
      </KpiCard>

      <KpiCard icon={<SwapIcon size={16} />} label="Active loans" testId="kpi-loans">
        <KpiValue value={k.activeLoans} testId="kpi-active-loans" />
        <div className="mt-3 flex items-center justify-between gap-2">
          {k.overdueLoans > 0 ? (
            <>
              <Badge variant="danger" data-testid="kpi-overdue">{k.overdueLoans} overdue</Badge>
              <Link to="/loans" search={{ status: "OVERDUE", page: 1, size: 20 }} className={cardLink} data-testid="view-overdue">View overdue</Link>
            </>
          ) : (
            <span className="text-base text-neutral-600" data-testid="kpi-overdue-none">None overdue</span>
          )}
        </div>
      </KpiCard>

      <KpiCard icon={<UsersIcon size={16} />} label="Active members" testId="kpi-members">
        <KpiValue value={k.activeMembers} testId="kpi-active-members" />
        <p className="mt-3 text-base text-neutral-600"><span className="tabular-nums" data-testid="kpi-inactive-members">{k.inactiveMembers}</span> inactive</p>
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
        className="mt-3.5 flex h-2 overflow-hidden rounded-full bg-neutral-100"
        data-testid="availability-bar"
      >
        {items.map((i) => (
          <div key={i.key} className={i.dot} style={{ width: pct(i.n) }} data-segment={i.key} />
        ))}
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
      <CardHeader title="Recent borrowings" action={<Link to="/loans" search={{ page: 1, size: 20 }} className={cardLink}>View loan history</Link>} />
      {rows.length === 0 ? (
        <EmptyState
          testId="recent-empty"
          icon={<HistoryIcon size={40} />}
          title="No loans yet"
          text="Borrowings you record will show here."
          action={canBorrow ? <Link to="/circulation/borrow" className={buttonClasses({ variant: "primary" })}>Borrow book</Link> : undefined}
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
              <Tr key={l.id} className={l.status === "OVERDUE" ? "bg-[#FFFBFA]" : undefined} data-testid="recent-row" data-status={l.status}>
                <Td>
                  <Link to="/books/$bookId" params={{ bookId: l.book.id }} className="font-semibold text-neutral-900 no-underline hover:underline">{l.book.title}</Link>
                  <div className="text-sm text-neutral-600">{l.book.author}</div>
                </Td>
                <Td>
                  <div className="font-semibold">{l.member.fullName}</div>
                  <div className="text-sm text-neutral-600"><MemberNumber value={l.member.memberNumber} /></div>
                </Td>
                <Td kind="num" className="max-wide:hidden">{formatDate(l.borrowedAt)}</Td>
                <Td kind="num" className={cn(l.status === "OVERDUE" && "font-semibold text-danger-700")}>{formatDate(l.dueAt)}</Td>
                <Td kind="nowrap"><LoanStatusBadge loan={l} /></Td>
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
      <CardHeader title="Popular books" action={<span className="text-sm text-neutral-600">Loans, last 30 days</span>} />
      {books.length === 0 ? (
        <p className="px-5 py-8 text-center text-base text-neutral-600" data-testid="popular-empty">No loans in the last 30 days.</p>
      ) : (
        <ol>
          {books.map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0" data-testid="popular-row">
              <span className="w-3 text-sm text-neutral-600 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link to="/books/$bookId" params={{ bookId: b.id }} className="block truncate font-semibold text-neutral-900 no-underline hover:underline">{b.title}</Link>
                <span className="text-sm text-neutral-600">{b.loansLast30Days} {b.loansLast30Days === 1 ? "loan" : "loans"}</span>
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
      <CardHeader title="Recently added" action={<Link to="/books" search={{ page: 1, size: 20, sort: "-createdAt" }} className={cardLink}>All books</Link>} />
      {books.length === 0 ? (
        <p className="px-5 py-8 text-center text-base text-neutral-600" data-testid="added-empty">No books yet.</p>
      ) : (
        <ul>
          {books.map((b) => (
            <li key={b.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0" data-testid="added-row">
              <BookCover title={b.title} url={b.coverImageUrl} />
              <div className="min-w-0">
                <Link to="/books/$bookId" params={{ bookId: b.id }} className="block truncate font-semibold text-neutral-900 no-underline hover:underline">{b.title}</Link>
                <span className="text-sm text-neutral-600">Added {formatDay(b.createdAt)} · {b.totalCopies} {b.totalCopies === 1 ? "copy" : "copies"}</span>
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
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
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
