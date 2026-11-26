import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, Skeleton, Table, Td, Th, Thead, Tr } from "../../components/ui";
import { MemberNumber } from "../../components/MemberNumber";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import { useLoans } from "./api";
import { LoanStatusBadge } from "./LoanStatusBadge";

const ROWS = 10;

/** Book detail "Loans" (ux.md §3.3): tabs Active (n) / History; the full list is Loan history filtered by this book. */
export function BookLoans({ bookId, activeCount }: { bookId: string; activeCount: number }) {
  const [tab, setTab] = useState<"active" | "history">(activeCount > 0 ? "active" : "history");
  const loans = useLoans({ bookId, ...(tab === "active" ? { status: "ACTIVE" as const } : {}), size: ROWS });
  const data = loans.data;

  return (
    <section className="border-t border-border" data-testid="book-loans" aria-label="Loans">
      <div className="flex items-center justify-between px-5 pt-4 max-sm:flex-wrap max-sm:gap-x-4 max-sm:gap-y-2">
        <div role="tablist" aria-label="Loans" className="flex gap-4">
          {(["active", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-testid={`book-loans-tab-${t}`}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 pb-2 text-sm font-semibold",
                tab === t
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-neutral-600 hover:text-neutral-900",
              )}
            >
              {t === "active" ? `Active (${activeCount})` : "History"}
            </button>
          ))}
        </div>
        <Link
          to="/loans"
          search={{ bookId, page: 1, size: 20, ...(tab === "active" ? { status: "ACTIVE" as const } : {}) }}
          className="tap-y text-sm font-semibold text-brand-700 no-underline hover:underline"
          data-testid="book-loans-all"
        >
          View in Loan history
        </Link>
      </div>
      {loans.isPending ? (
        <div className="space-y-2 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title={tab === "active" ? "No copies are on loan." : "This book hasn't been borrowed yet."} />
      ) : (
        <Table aria-label={tab === "active" ? "Active loans of this book" : "Loan history of this book"}>
          <Thead>
            <tr>
              <Th>Member</Th>
              <Th>Borrowed</Th>
              <Th>Due</Th>
              {tab === "history" && <Th>Returned</Th>}
              <Th>Status</Th>
              <Th className="max-wide:hidden">Processed by</Th>
            </tr>
          </Thead>
          <tbody>
            {data.items.map((l) => (
              <Tr key={l.id} data-testid="book-loan-row" className={cn(l.status === "OVERDUE" && "bg-overdue")}>
                <Td>
                  <div className="font-medium">{l.member.fullName}</div>
                  <div className="text-sm text-neutral-600">
                    <MemberNumber value={l.member.memberNumber} />
                  </div>
                </Td>
                <Td kind="num" className="text-neutral-700">
                  {formatDate(l.borrowedAt)}
                </Td>
                <Td
                  kind="num"
                  className={cn(l.status === "OVERDUE" ? "font-semibold text-danger-700" : "text-neutral-700")}
                >
                  {formatDate(l.dueAt)}
                </Td>
                {tab === "history" && (
                  <Td kind="num" className="text-neutral-700">
                    {l.returnedAt ? formatDate(l.returnedAt) : "—"}
                  </Td>
                )}
                <Td kind="nowrap">
                  <LoanStatusBadge loan={l} />
                </Td>
                <Td kind="truncate" className="text-neutral-700 max-wide:hidden" title={l.processedBy.name}>
                  {l.processedBy.name}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
