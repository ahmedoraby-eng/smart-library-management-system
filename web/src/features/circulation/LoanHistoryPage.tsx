import type { LoanDto } from "@slm/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Badge, Button, Card, CloseIcon, EmptyState, HistoryIcon, InlineAlert, Input, Pagination, SearchIcon, Select, Skeleton, SortableTh,
  Table, Td, Th, Thead, Tr,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { cn } from "../../lib/cn";
import { formatDay } from "../../lib/format";
import { useLoans } from "./api";
import { LoanStatusBadge } from "./LoanStatusBadge";
import type { LoanHistorySearch } from "./searchSchemas";

const route = getRouteApi("/app/loans");
const DEFAULT_SORT = "-borrowedAt";
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active (on loan)" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "RETURNED", label: "Returned" },
] as const;

/**
 * Loan history (ux.md §3.6, SLM-5): read-only for every role. Filters, sort and page live in the URL.
 * Status is derived by the API (OVERDUE = open and past due); no fee or fine appears anywhere (AC5).
 */
export function LoanHistoryPage() {
  const search: LoanHistorySearch = route.useSearch();
  const navigate = route.useNavigate();
  const setSearch = (patch: Partial<LoanHistorySearch>, opts: { resetPage?: boolean } = { resetPage: true }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, ...(opts.resetPage ? { page: 1 } : {}) }), replace: true });

  // Search box: local text, pushed to the URL after a pause; a URL change (Clear filters) wins.
  const [qText, setQText] = useState(search.q ?? "");
  const lastPushed = useRef(search.q ?? "");
  useEffect(() => {
    if ((search.q ?? "") !== lastPushed.current) {
      lastPushed.current = search.q ?? "";
      setQText(search.q ?? "");
    }
  }, [search.q]);
  useEffect(() => {
    const next = qText.trim();
    if (next === (search.q ?? "")) return;
    const t = setTimeout(() => {
      lastPushed.current = next;
      setSearch({ q: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  const loans = useLoans(search);
  const data = loans.data;
  const filtered = Boolean(search.q || search.status || search.memberId || search.bookId || search.from || search.to);
  const clearFilters = () => {
    lastPushed.current = "";
    setQText("");
    void navigate({ search: { page: 1, size: search.size }, replace: true });
  };
  const first = data?.items[0];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Loan history</h1>
        <p className="mt-1 text-neutral-600" data-testid="result-line" aria-live="polite">
          {data ? `${data.total} ${data.total === 1 ? "loan" : "loans"}${filtered ? " match these filters" : ""}` : " "}
          {data && filtered && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={clearFilters} data-testid="clear-filters">
              Clear filters
            </Button>
          )}
        </p>
      </header>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-64 flex-1">
            <Input
              label="Search loans"
              hideLabel
              compact
              leading={<SearchIcon size={16} />}
              type="search"
              placeholder="Search book title, ISBN, member name or number"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              data-testid="loan-search"
              autoComplete="off"
            />
          </div>
          <Select
            label="Status"
            hideLabel
            value={search.status ?? ""}
            onChange={(e) => setSearch({ status: (e.target.value || undefined) as LoanHistorySearch["status"] })}
            data-testid="filter-status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <DateFilter label="Borrowed from" value={search.from} onChange={(from) => setSearch({ from })} testId="filter-from" />
          <DateFilter label="Borrowed to" value={search.to} onChange={(to) => setSearch({ to })} testId="filter-to" />
        </div>

        {(search.memberId || search.bookId) && (
          <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2.5" data-testid="scope-chips">
            {search.memberId && (
              <ScopeChip
                label={`Member: ${first && first.member.id === search.memberId ? first.member.fullName : "selected member"}`}
                onClear={() => setSearch({ memberId: undefined })}
                testId="chip-member"
              />
            )}
            {search.bookId && (
              <ScopeChip
                label={`Book: ${first && first.book.id === search.bookId ? first.book.title : "selected book"}`}
                onClear={() => setSearch({ bookId: undefined })}
                testId="chip-book"
              />
            )}
          </div>
        )}

        {loans.isError && !data ? (
          <div className="p-5" data-testid="loans-error">
            <InlineAlert variant="danger" action={<Button size="sm" onClick={() => void loans.refetch()}>Try again</Button>}>
              {loans.error instanceof ApiError && loans.error.status === 400
                ? "These filters aren't valid. Clear them and try again."
                : "Couldn't load loans. Check your connection and try again."}
            </InlineAlert>
          </div>
        ) : loans.isPending ? (
          <HistorySkeleton />
        ) : data && data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              testId="loans-empty-filtered"
              icon={<SearchIcon size={40} />}
              title="No loans match these filters."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState testId="loans-empty" icon={<HistoryIcon size={40} />} title="No loans yet" text="Borrowings you record will show here." />
          )
        ) : (
          data && (
            <div className={loans.isPlaceholderData ? "opacity-60 transition-opacity" : undefined} aria-busy={loans.isPlaceholderData}>
              <Table aria-label="Loans" data-testid="loans-table">
                <Thead>
                  <tr>
                    <Th>Book</Th>
                    <Th>Member</Th>
                    <SortableTh label="Borrowed" sortKey="borrowedAt" sort={search.sort} defaultSort={DEFAULT_SORT} onSort={(s) => setSearch({ sort: s })} />
                    <SortableTh label="Due" sortKey="dueAt" sort={search.sort} defaultSort={DEFAULT_SORT} onSort={(s) => setSearch({ sort: s })} />
                    <SortableTh
                      label="Returned"
                      sortKey="returnedAt"
                      sort={search.sort}
                      defaultSort={DEFAULT_SORT}
                      onSort={(s) => setSearch({ sort: s })}
                      className="max-lg:hidden"
                    />
                    <Th>Status</Th>
                    <Th className="max-lg:hidden">Processed by</Th>
                  </tr>
                </Thead>
                <tbody>
                  {data.items.map((loan) => (
                    <LoanRow key={loan.id} loan={loan} onMember={(memberId) => setSearch({ memberId })} />
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} size={data.size} total={data.total} onPage={(page) => setSearch({ page }, { resetPage: false })} />
            </div>
          )
        )}
      </Card>
    </>
  );
}

function LoanRow({ loan, onMember }: { loan: LoanDto; onMember: (memberId: string) => void }) {
  const overdue = loan.status === "OVERDUE";
  return (
    <Tr data-testid="history-row" data-status={loan.status} className={cn(overdue && "bg-[#FFFBFA]")}>
      <Td>
        <Link to="/books/$bookId" params={{ bookId: loan.book.id }} className="font-semibold text-neutral-900 no-underline hover:underline">
          {loan.book.title}
        </Link>
        <div className="text-sm text-neutral-600">{loan.book.author}</div>
      </Td>
      <Td>
        <button
          type="button"
          onClick={() => onMember(loan.member.id)}
          title={`Show loans of ${loan.member.fullName}`}
          className="text-left font-medium text-neutral-900 hover:underline"
          data-testid="member-filter-link"
        >
          {loan.member.fullName}
        </button>
        <div className="text-sm text-neutral-600 tabular-nums">{loan.member.memberNumber}</div>
      </Td>
      <Td className="tabular-nums text-neutral-700">{formatDay(loan.borrowedAt)}</Td>
      <Td className={cn("tabular-nums", overdue ? "font-semibold text-danger-700" : "text-neutral-700")}>{formatDay(loan.dueAt)}</Td>
      <Td className="tabular-nums text-neutral-700 max-lg:hidden">{loan.returnedAt ? formatDay(loan.returnedAt) : "—"}</Td>
      <Td>
        <LoanStatusBadge loan={loan} />
      </Td>
      <Td className="text-neutral-700 max-lg:hidden">{loan.processedBy.name}</Td>
    </Tr>
  );
}

function DateFilter({ label, value, onChange, testId }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; testId: string }) {
  // The URL holds a day (YYYY-MM-DD); a full date-time from an old link shows as its day.
  return (
    <Input
      label={label}
      type="date"
      compact
      value={value?.slice(0, 10) ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      data-testid={testId}
      className="w-40"
    />
  );
}

function ScopeChip({ label, onClear, testId }: { label: string; onClear: () => void; testId: string }) {
  return (
    <Badge variant="brand" dot={false} className="gap-1 pr-1" data-testid={testId}>
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="rounded-full p-0.5 hover:bg-brand-100">
        <CloseIcon size={12} />
      </button>
    </Badge>
  );
}

function HistorySkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="history-skeleton" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
