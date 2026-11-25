import type { BookDto, LoanDto, MemberDto } from "@slm/contracts";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon, AvailabilityBadge, Badge, Button, buttonClasses, Card, CardBody, CheckCircleIcon, Combobox, InlineAlert, useToast,
} from "../../components/ui";
import { cn } from "../../lib/cn";
import { api, ApiError } from "../../lib/apiClient";
import { formatDay, formatWeekdayDate, initials } from "../../lib/format";
import { useMe } from "../auth/session";
import { BookCover } from "../books/BookCover";
import { useBookSearch, useBorrow, useLoans, useMember, useMemberSearch } from "./api";
import { addDays, daysUntil, formatDate, toDayInput } from "./loanFormat";
import { LoanStatusBadge } from "./LoanStatusBadge";

const route = getRouteApi("/app/circulation/borrow");

/** UI mirrors of the server defaults (LOAN_DAYS, MAX_ACTIVE_LOANS); the API stays the authority (409/400). */
const DEFAULT_LOAN_DAYS = 14;
const MAX_ACTIVE_LOANS = 5;
const DUE_CHIPS = [7, 14, 21];
const SEARCH_DEBOUNCE_MS = 200;

function useDebounced(value: string, ms = SEARCH_DEBOUNCE_MS): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const firstName = (m: Pick<MemberDto, "fullName">) => m.fullName.split(/\s+/)[0] ?? m.fullName;

type Notice = { target: "member" | "book" | "form"; text: ReactNode; retry?: boolean };
interface Success { loan: LoanDto; available: number; total: number }

/**
 * Borrow (ux.md §4.1): one page, no wizard; the live summary card is the confirmation step.
 * Keyboard: Member → Enter → Book → Enter → Confirm; ⌘/Ctrl+Enter confirms from anywhere once valid.
 */
export function BorrowPage() {
  const search = route.useSearch();
  const me = useMe().data;
  const toast = useToast();
  const borrow = useBorrow();

  const [member, setMember] = useState<MemberDto | null>(null);
  const [book, setBook] = useState<BookDto | null>(null);
  const [memberText, setMemberText] = useState("");
  const [bookText, setBookText] = useState("");
  const [dueDay, setDueDay] = useState(() => toDayInput(addDays(new Date(), DEFAULT_LOAN_DAYS)));
  const [dueTouched, setDueTouched] = useState(false);
  const [dueServerError, setDueServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);

  const memberInput = useRef<HTMLInputElement>(null);
  const bookInput = useRef<HTMLInputElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const dueInput = useRef<HTMLInputElement>(null);

  // Prefill from ?member= / ?book= (book row, book detail, member detail, AI result).
  const prefMember = useMember(search.member);
  const prefBook = useQuery({
    queryKey: ["books", "detail", search.book],
    queryFn: () => api<BookDto>(`/books/${encodeURIComponent(search.book!)}`),
    enabled: Boolean(search.book),
  });
  useEffect(() => {
    if (prefMember.data) setMember(prefMember.data);
  }, [prefMember.data]);
  // Once per ?book= id: a borrow re-reads the books, and the refetched detail must not put the book back.
  const prefilledBook = useRef<string | null>(null);
  useEffect(() => {
    if (!prefBook.data || prefBook.data.archived || prefilledBook.current === prefBook.data.id) return;
    prefilledBook.current = prefBook.data.id;
    setBook(prefBook.data);
  }, [prefBook.data]);

  // Initial focus: the first empty field (ux.md §4.1 keyboard flow).
  useEffect(() => {
    if (search.member && !search.book) bookInput.current?.focus();
    else if (!search.member) memberInput.current?.focus();
    // once, on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memberQ = useDebounced(memberText.trim());
  const bookQ = useDebounced(bookText.trim());
  const members = useMemberSearch(memberQ);
  const books = useBookSearch(bookQ);
  const memberLoans = useLoans({ memberId: member?.id, status: "ACTIVE", size: 20 }, { enabled: Boolean(member) });
  const held = useMemo(() => new Map((member ? memberLoans.data?.items ?? [] : []).map((l) => [l.book.id, l])), [member, memberLoans.data]);

  const memberReason = (m: MemberDto): string | null => {
    if (m.status !== "ACTIVE") return "Inactive — reactivate on the member page";
    if (m.activeLoans >= MAX_ACTIVE_LOANS) return `${m.activeLoans} of ${MAX_ACTIVE_LOANS} books on loan — return one first`;
    return null;
  };
  const bookReason = (b: BookDto): string | null => {
    const loan = held.get(b.id);
    if (loan && member) return `${firstName(member)} already has this book (due ${formatDay(loan.dueAt)})`;
    if (b.availableCopies === 0) return `No copies available${b.nextDueAt ? ` · next due ${formatDay(b.nextDueAt)}` : ""}`;
    return null;
  };

  const today = new Date();
  const dueDays = daysUntil(dueDay, today);
  const lastDay = addDays(today, 60);
  const dueLabel = Number.isNaN(dueDays) ? "Choose a date" : formatWeekdayDate(addDays(today, dueDays));
  const dueError = dueServerError ?? (dueDays < 1 || dueDays > 60 || Number.isNaN(dueDays)
    ? `Choose a due date between tomorrow and ${formatDate(lastDay)}.`
    : null);
  // The picked member's open loans, live (the MemberDto from the search goes stale after a borrow).
  const liveMember = member && memberLoans.data ? { ...member, activeLoans: memberLoans.data.total } : member;
  const memberBlock = liveMember ? memberReason(liveMember) : null;
  const bookBlock = book ? bookReason(book) : null;
  const valid = Boolean(member && book && !dueError && !memberBlock && !bookBlock);

  const pickMember = (m: MemberDto) => {
    setMember(m);
    setMemberText("");
    setNotice(null);
    setSuccess(null);
    // Enter selects and moves focus to Book (or Confirm when the book is already chosen).
    setTimeout(() => (book ? confirmBtn.current : bookInput.current)?.focus(), 0);
  };
  const pickBook = (b: BookDto) => {
    setBook(b);
    setBookText("");
    setNotice(null);
    setSuccess(null);
    setTimeout(() => (member ? confirmBtn.current : memberInput.current)?.focus(), 0);
  };
  const clearAll = () => {
    setMember(null);
    setBook(null);
    setMemberText("");
    setBookText("");
    setDueDay(toDayInput(addDays(new Date(), DEFAULT_LOAN_DAYS)));
    setDueTouched(false);
    setDueServerError(null);
    setNotice(null);
    setSuccess(null);
    setTimeout(() => memberInput.current?.focus(), 0);
  };

  const submit = () => {
    if (!valid || !member || !book || borrow.isPending) return;
    setNotice(null);
    setDueServerError(null);
    // The server keeps time of day; a custom date is sent as now + N whole days.
    const dueAt = dueTouched ? addDays(new Date(), dueDays).toISOString() : undefined;
    const picked = { member, book };
    borrow.mutate(
      { bookId: book.id, memberId: member.id, ...(dueAt ? { dueAt } : {}) },
      {
        onSuccess: async (loan) => {
          const fresh = await api<BookDto>(`/books/${encodeURIComponent(picked.book.id)}`).catch(() => null);
          const available = fresh?.availableCopies ?? picked.book.availableCopies - 1;
          const total = fresh?.totalCopies ?? picked.book.totalCopies;
          setSuccess({ loan, available, total });
          setBook(null);
          toast.success(<SuccessText loan={loan} available={available} total={total} />);
        },
        onError: (err) => onBorrowError(err, picked),
      },
    );
  };

  const onBorrowError = (err: Error, picked: { member: MemberDto; book: BookDto }) => {
    if (!(err instanceof ApiError) || err.status >= 500) {
      setNotice({ target: "form", text: "Couldn't record the borrowing. Nothing was saved. Try again.", retry: true });
      return;
    }
    switch (err.code) {
      case "BOOK_UNAVAILABLE":
        setBook(null);
        setNotice({ target: "book", text: <>The last copy of <em>{picked.book.title}</em> was just borrowed. Choose another book.</> });
        setTimeout(() => bookInput.current?.focus(), 0);
        break;
      case "ALREADY_BORROWED":
        setBook(null);
        setNotice({ target: "book", text: err.message });
        setTimeout(() => bookInput.current?.focus(), 0);
        void memberLoans.refetch();
        break;
      case "MEMBER_INACTIVE":
      case "LOAN_LIMIT_REACHED":
        setMember(null);
        setNotice({ target: "member", text: err.message });
        setTimeout(() => memberInput.current?.focus(), 0);
        break;
      case "NOT_FOUND":
        setNotice({ target: "form", text: "This member or book no longer exists. Choose again." });
        break;
      case "VALIDATION_FAILED": {
        const due = err.problem.errors?.find((e) => e.field === "dueAt");
        if (due) setDueServerError(due.message);
        else setNotice({ target: "form", text: err.message });
        break;
      }
      default:
        // 401/403 are handled app-wide (sign-in, /403).
        if (err.status !== 401 && err.status !== 403) setNotice({ target: "form", text: err.message });
    }
  };

  // ⌘/Ctrl + Enter confirms from anywhere once valid.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const borrowAnother = () => {
    setSuccess(null);
    setBook(null);
    setTimeout(() => bookInput.current?.focus(), 0);
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px]" data-testid="borrow-page">
      <Card>
        <CardBody className="space-y-7">
          {success && (
            <InlineAlert
              variant="success"
              testId="borrow-success"
            >
              <SuccessText loan={success.loan} available={success.available} total={success.total} />
              <div className="mt-2.5 flex flex-wrap gap-2">
                  {member && (
                    <Button size="sm" onClick={borrowAnother} data-testid="borrow-another">
                      Borrow another for {firstName(member)}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={clearAll} data-testid="new-borrowing">
                    New borrowing
                  </Button>
                  <Link
                    to="/loans"
                    search={{ memberId: success.loan.member.id, status: "ACTIVE", page: 1, size: 20 }}
                    className={buttonClasses({ size: "sm", variant: "ghost" })}
                    data-testid="view-loan"
                  >
                    View loan
                  </Link>
              </div>
            </InlineAlert>
          )}
          {notice?.target === "form" && (
            <InlineAlert variant="danger" testId="borrow-error" action={notice.retry ? <Button size="sm" onClick={submit}>Try again</Button> : undefined}>
              {notice.text}
            </InlineAlert>
          )}

          <Step n={1} title="Member" done={Boolean(member)}>
            {member ? (
              <PickedRow testId="picked-member" onChange={() => { setMember(null); setTimeout(() => memberInput.current?.focus(), 0); }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{initials(member.fullName)}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    {member.fullName}
                    <MemberStatusBadge member={member} />
                  </div>
                  <div className="truncate text-sm text-neutral-600">
                    {member.memberNumber} · {member.email} · {booksOnLoan(liveMember!.activeLoans)}
                  </div>
                </div>
              </PickedRow>
            ) : (
              <Combobox
                label="Member"
                placeholder="Search name, member number or email"
                value={memberText}
                onValueChange={setMemberText}
                options={memberQ ? members.data?.items : undefined}
                loading={members.isFetching && Boolean(memberQ)}
                getKey={(m) => m.id}
                disabledReason={memberReason}
                onSelect={pickMember}
                inputRef={memberInput}
                testId="member-combobox"
                emptyText="No members match. Check the spelling or the member number."
                renderOption={(m, { disabledReason }) => (
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">{initials(m.fullName)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {m.fullName}
                        <MemberStatusBadge member={m} />
                      </div>
                      <div className="truncate text-sm text-neutral-600">
                        {disabledReason ?? `${m.memberNumber} · ${m.email} · ${booksOnLoan(m.activeLoans)}`}
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
            {notice?.target === "member" && <FieldNotice testId="member-notice">{notice.text}</FieldNotice>}
            {member && memberBlock && <FieldNotice testId="member-notice">{memberBlock}</FieldNotice>}
          </Step>

          <Step n={2} title="Book" done={Boolean(book)}>
            {book ? (
              <PickedRow testId="picked-book" onChange={() => { setBook(null); setTimeout(() => bookInput.current?.focus(), 0); }}>
                <BookCover title={book.title} url={book.coverImageUrl} />
                <div className="min-w-0 flex-1">
                  <div className="font-book text-md plain:text-base">{book.title}</div>
                  <div className="truncate text-sm text-neutral-600">
                    {book.author}
                    {book.isbn ? ` · ISBN ${book.isbn}` : ""}
                  </div>
                </div>
                <AvailabilityBadge book={book} />
              </PickedRow>
            ) : (
              <Combobox
                label="Book"
                placeholder="Search title, author or ISBN"
                value={bookText}
                onValueChange={setBookText}
                options={bookQ ? books.data?.items : undefined}
                loading={books.isFetching && Boolean(bookQ)}
                getKey={(b) => b.id}
                disabledReason={bookReason}
                onSelect={pickBook}
                inputRef={bookInput}
                testId="book-combobox"
                emptyText="No books match. Check the spelling or try the ISBN."
                renderOption={(b, { disabledReason }) => (
                  <div className="flex items-center gap-3">
                    <BookCover title={b.title} url={b.coverImageUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{b.title}</div>
                      <div className="truncate text-sm text-neutral-600">{disabledReason ? `${b.author} · ${disabledReason}` : b.author}</div>
                    </div>
                    <AvailabilityBadge book={b} />
                  </div>
                )}
              />
            )}
            {notice?.target === "book" && <FieldNotice testId="book-notice">{notice.text}</FieldNotice>}
            {book && bookBlock && <FieldNotice testId="book-notice">{bookBlock}</FieldNotice>}
          </Step>

          <Step n={3} title="Due date" done={!dueError}>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="due-date" className="sr-only">
                Due date
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => dueInput.current?.showPicker?.()}
                  aria-label={`Due date: ${dueLabel}. Change`}
                  aria-describedby="due-help"
                  data-testid="due-date-display"
                  className={cn(
                    "flex h-10 w-52 items-center justify-between gap-2 rounded-md border bg-surface px-3 text-base tabular-nums focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 focus:outline-none",
                    dueError ? "border-danger-500" : "border-border-strong",
                  )}
                >
                  <span>{dueLabel}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-neutral-500">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </button>
                {/* The native picker stays behind the formatted text: it holds the value and opens from the button. */}
                <input
                  ref={dueInput}
                  id="due-date"
                  type="date"
                  tabIndex={-1}
                  value={dueDay}
                  min={toDayInput(addDays(today, 1))}
                  max={toDayInput(lastDay)}
                  onChange={(e) => {
                    setDueDay(e.target.value);
                    setDueTouched(true);
                    setDueServerError(null);
                  }}
                  aria-invalid={dueError ? true : undefined}
                  data-testid="due-date"
                  className="sr-only"
                />
              </div>
              {DUE_CHIPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDueDay(toDayInput(addDays(new Date(), d)));
                    setDueTouched(d !== DEFAULT_LOAN_DAYS);
                    setDueServerError(null);
                  }}
                  aria-pressed={dueDays === d}
                  data-testid={`due-chip-${d}`}
                  className={cn(
                    "h-9 rounded-full border px-3.5 text-sm font-medium",
                    dueDays === d ? "border-brand-200 bg-brand-50 text-brand-700" : "border-border-strong bg-surface text-neutral-700 hover:bg-neutral-50",
                  )}
                >
                  {d} days
                </button>
              ))}
            </div>
            {dueError ? (
              <p id="due-help" className="mt-1.5 flex items-start gap-1.5 text-sm text-danger-700" data-testid="due-error">
                <AlertIcon size={16} className="mt-px shrink-0" />
                {dueError}
              </p>
            ) : (
              <p id="due-help" className="mt-1.5 text-sm text-neutral-600">
                Defaults to {DEFAULT_LOAN_DAYS} days from today. You can change it.
              </p>
            )}
          </Step>
        </CardBody>
      </Card>

      <Card className="xl:sticky xl:top-6" data-testid="borrow-summary">
        <div className="flex items-baseline justify-between border-b border-border px-5 py-4">
          <h2 className="text-md font-semibold">Summary</h2>
          <span className="text-sm text-neutral-500">Check, then confirm</span>
        </div>
        <CardBody className="space-y-4">
          <dl className="space-y-2.5">
            <SummaryRow label="Member" value={member?.fullName} />
            <SummaryRow label="Book" value={book?.title} />
            <SummaryRow label="Borrowed" value={`Today, ${formatDate(today)}`} />
            <SummaryRow
              label="Due"
              value={dueError ? undefined : <>{formatDate(addDays(today, dueDays))} <span className="text-neutral-500">({dueDays} {dueDays === 1 ? "day" : "days"})</span></>}
            />
            <SummaryRow label="Processed by" value={me?.fullName} />
          </dl>

          {member && (memberLoans.data?.items.length ?? 0) > 0 && (
            <div className="border-t border-border pt-3" data-testid="member-current-loans">
              <p className="mb-1.5 text-xs font-medium text-neutral-600">
                {firstName(member)}'s current loans ({memberLoans.data!.total} of {MAX_ACTIVE_LOANS})
              </p>
              <ul className="space-y-1.5">
                {memberLoans.data!.items.slice(0, 3).map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{l.book.title}</span>
                    <LoanStatusBadge loan={l} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {book && (
            <div className="rounded-lg border border-border bg-neutral-25 px-3.5 py-2.5" data-testid="copies-change">
              <div className="flex items-center justify-between text-base">
                <span className="text-neutral-700">Available copies</span>
                <span className="font-semibold tabular-nums">
                  {book.availableCopies} → <span className={book.availableCopies - 1 === 0 ? "text-danger-700" : undefined}>{Math.max(book.availableCopies - 1, 0)}</span>{" "}
                  <span className="font-normal text-neutral-600">of {book.totalCopies}</span>
                </span>
              </div>
              {book.availableCopies === 1 && (
                <p className="mt-1 text-sm text-neutral-600">This is the last copy on the shelf. The book will show as Unavailable.</p>
              )}
            </div>
          )}

          <Button
            ref={confirmBtn}
            variant="primary"
            size="lg"
            block
            disabled={!valid}
            loading={borrow.isPending}
            onClick={submit}
            data-testid="confirm-borrow"
          >
            Confirm borrowing
            <kbd className="ml-1 rounded border border-white/40 px-1 text-[11px] font-medium">⌘ Enter</kbd>
          </Button>
          <Button variant="ghost" block onClick={clearAll} data-testid="clear-borrow">
            Clear
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

function SuccessText({ loan, available, total }: { loan: LoanDto; available: number; total: number }) {
  return (
    <span data-testid="borrow-success-text">
      Borrowed. <em>{loan.book.title}</em> → {loan.member.fullName}, due {formatDate(loan.dueAt)}. {available} of {total} {total === 1 ? "copy" : "copies"} now available.
    </span>
  );
}

const booksOnLoan = (n: number) => `${n} ${n === 1 ? "book" : "books"} on loan`;

function MemberStatusBadge({ member }: { member: Pick<MemberDto, "status"> }) {
  return member.status === "ACTIVE" ? <Badge variant="success">Active</Badge> : <Badge variant="neutral">Inactive</Badge>;
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="flex gap-4" aria-label={title}>
      <span
        className={cn(
          "mt-0.5 grid h-6.5 w-6.5 shrink-0 place-items-center rounded-full text-xs font-semibold",
          done ? "bg-brand-600 text-white" : "border border-border-strong text-neutral-600",
        )}
        aria-hidden="true"
      >
        {done ? <CheckCircleIcon size={16} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2.5 font-semibold">{title}</h3>
        {children}
      </div>
    </section>
  );
}

function PickedRow({ children, onChange, testId }: { children: ReactNode; onChange: () => void; testId: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3" data-testid={testId}>
      {children}
      <Button variant="ghost" size="sm" onClick={onChange} className="ml-auto" data-testid={`${testId}-change`}>
        Change
      </Button>
    </div>
  );
}

function FieldNotice({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-danger-700" data-testid={testId}>
      <AlertIcon size={16} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{value ?? <span className="text-neutral-500">—</span>}</dd>
    </div>
  );
}
