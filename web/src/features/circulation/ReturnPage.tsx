import type { BookDto, LoanDto } from "@slm/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Button, buttonClasses, Card, EmptyState, HistoryIcon, InlineAlert, Input, Pagination, SearchIcon, Skeleton,
  Table, Td, Th, Thead, Tr, useToast,
} from "../../components/ui";
import { api } from "../../lib/apiClient";
import { MemberNumber } from "../../components/MemberNumber";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import { useLoans, useReturn } from "./api";
import { ReturnConfirmDialog, returnErrorMessage } from "./ReturnConfirmDialog";
import { LoanStatusBadge } from "./LoanStatusBadge";

const route = getRouteApi("/app/circulation/return");
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;
const FADE_MS = 150;

/**
 * Return (ux.md §4.2): the active loans are listed before any search (overdue first, then soonest due);
 * one search box narrows them; [Return] asks to confirm; the row fades out on success.
 */
export function ReturnPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const toast = useToast();
  const giveBack = useReturn();
  const [confirming, setConfirming] = useState<LoanDto | null>(null);
  const [fading, setFading] = useState<Set<string>>(new Set());

  // Search text: local, pushed to the URL after a pause (same pattern as Books).
  const [qText, setQText] = useState(search.q ?? "");
  useEffect(() => {
    const next = qText.trim();
    if (next === (search.q ?? "")) return;
    const t = setTimeout(() => void navigate({ search: { q: next || undefined, page: 1 }, replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  const loans = useLoans({ status: "ACTIVE", ...(search.q ? { q: search.q } : {}), page: search.page, size: PAGE_SIZE });
  const data = loans.data;

  // Scanner-friendly: an exact ISBN or member number that yields one loan puts focus on its [Return].
  const returnButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!search.q || data?.items.length !== 1 || loans.isPlaceholderData) return;
    const only = data.items[0]!;
    if (search.q.toUpperCase() === only.member.memberNumber.toUpperCase() || /^[\d-\sX]{10,17}$/i.test(search.q)) {
      returnButtons.current.get(only.id)?.focus();
    }
  }, [data, search.q, loans.isPlaceholderData]);

  const confirm = (loan: LoanDto) =>
    giveBack.mutate(loan.id, {
      onSuccess: async () => {
        setConfirming(null);
        setFading((s) => new Set(s).add(loan.id));
        const book = await api<BookDto>(`/books/${encodeURIComponent(loan.book.id)}`).catch(() => null);
        toast.success(
          <>
            Returned: <em>{loan.book.title}</em>.{book ? ` ${book.availableCopies} of ${book.totalCopies} ${book.totalCopies === 1 ? "copy" : "copies"} now available.` : ""}
          </>,
        );
      },
      onError: (err) => {
        setConfirming(null);
        const message = returnErrorMessage(err);
        if (message) toast.error(message);
      },
    });

  const clearSearch = () => {
    setQText("");
    void navigate({ search: { page: 1 }, replace: true });
  };

  return (
    <Card data-testid="return-page">
      <div className="border-b border-border p-4">
        <Input
          label="Search active loans"
          hideLabel
          leading={<SearchIcon size={16} />}
          type="search"
          autoFocus
          placeholder="Search active loans by member, member no., book title or ISBN"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          data-testid="return-search"
          autoComplete="off"
        />
      </div>

      {loans.isError && !data ? (
        <div className="p-5">
          <InlineAlert variant="danger" testId="loans-error" action={<Button size="sm" onClick={() => void loans.refetch()}>Try again</Button>}>
            Couldn't load active loans. Check your connection and try again.
          </InlineAlert>
        </div>
      ) : loans.isPending ? (
        <ListSkeleton />
      ) : data && data.items.length === 0 ? (
        search.q ? (
          <EmptyState
            testId="return-empty-filtered"
            icon={<SearchIcon size={40} />}
            title={`No active loans match “${search.q}”`}
            text="Check Loan history for returned books."
            action={
              <div className="flex gap-2">
                <Button onClick={clearSearch}>Clear search</Button>
                <Link to="/loans" className={buttonClasses({ variant: "ghost" })}>
                  Open Loan history
                </Link>
              </div>
            }
          />
        ) : (
          <EmptyState testId="return-empty" icon={<HistoryIcon size={40} />} title="No books are out on loan right now." />
        )
      ) : (
        data && (
          <div className={loans.isPlaceholderData ? "opacity-60 transition-opacity" : undefined} aria-busy={loans.isPlaceholderData}>
            <Table aria-label="Active loans" data-testid="active-loans">
              <Thead>
                <tr>
                  <Th>Book</Th>
                  <Th>Member</Th>
                  <Th className="max-lg:hidden">Borrowed</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th align="right" kind="actions">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </Thead>
              <tbody>
                {data.items.map((loan) => (
                  <Tr
                    key={loan.id}
                    data-testid="loan-row"
                    data-loan-id={loan.id}
                    className={cn(
                      "motion-safe:transition-opacity",
                      loan.status === "OVERDUE" && "bg-[#FFFBFA]",
                      fading.has(loan.id) && "pointer-events-none opacity-0",
                    )}
                    style={{ transitionDuration: `${FADE_MS}ms` }}
                  >
                    <Td>
                      <Link to="/books/$bookId" params={{ bookId: loan.book.id }} className="font-semibold text-neutral-900 no-underline hover:underline">
                        {loan.book.title}
                      </Link>
                      <div className="text-sm text-neutral-600">{loan.book.author}</div>
                    </Td>
                    <Td>
                      <div className="font-medium">{loan.member.fullName}</div>
                      <div className="text-sm text-neutral-600"><MemberNumber value={loan.member.memberNumber} /></div>
                    </Td>
                    <Td kind="num" className="text-neutral-700 max-lg:hidden">{formatDate(loan.borrowedAt)}</Td>
                    <Td kind="num" className={cn(loan.status === "OVERDUE" ? "font-semibold text-danger-700" : "text-neutral-700")}>
                      {formatDate(loan.dueAt)}
                    </Td>
                    <Td kind="nowrap">
                      <LoanStatusBadge loan={loan} />
                    </Td>
                    <Td align="right" kind="actions">
                      <Button
                        size="sm"
                        ref={(el) => {
                          if (el) returnButtons.current.set(loan.id, el);
                          else returnButtons.current.delete(loan.id);
                        }}
                        onClick={() => setConfirming(loan)}
                        data-testid="return-button"
                      >
                        Return
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} size={data.size} total={data.total} onPage={(page) => void navigate({ search: (p) => ({ ...p, page }), replace: true })} />
          </div>
        )
      )}

      {confirming && (
        <ReturnConfirmDialog loan={confirming} loading={giveBack.isPending} onCancel={() => setConfirming(null)} onConfirm={() => confirm(confirming)} />
      )}
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="loans-skeleton" aria-busy="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}
