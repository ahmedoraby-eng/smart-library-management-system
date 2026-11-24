import type { DiscoveryItem, DiscoveryRequest, DiscoveryResponse, MemberDto } from "@slm/contracts";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  AvailabilityBadge, Badge, Button, buttonClasses, Card, Combobox, EmptyState, InlineAlert, SearchIcon, Skeleton, SparkIcon, Textarea,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { initials } from "../../lib/format";
import { useDebounced } from "../../lib/useDebounced";
import { useCan } from "../auth/session";
import { BookCover } from "../books/BookCover";
import { useMemberSearch } from "../circulation/api";
import { MemberStatusBadge } from "../members/badges";
import { useDiscover } from "./api";

// The circulation routes arrive with SLM-4; until then the typed router only knows "/circulation".
const BORROW_TO = "/circulation/borrow" as "/circulation";

const MAX = 500;
const EXAMPLES = ["Clean code for a junior developer", "A light classic novel", "Fantasy like The Hobbit"];

export function DiscoveryPage() {
  const can = useCan();
  const discover = useDiscover();
  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [touched, setTouched] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Optional "For member": its id goes to the API (recent titles only) and into each [Borrow] link.
  const [member, setMember] = useState<MemberDto | null>(null);
  const [memberText, setMemberText] = useState("");
  const memberQ = useDebounced(memberText.trim());
  const members = useMemberSearch(memberQ);

  // 429: the button stays disabled for Retry-After seconds.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const trimmed = query.trim();
  const problem = touched ? (trimmed.length === 0 ? "Describe what the member needs." : trimmed.length < 3 ? "Describe what the member needs (at least 3 characters)." : query.length > MAX ? "Keep it under 500 characters." : null) : null;

  const run = () => {
    setTouched(true);
    if (trimmed.length < 3 || trimmed.length > MAX || cooldown > 0 || discover.isPending) return;
    const body: DiscoveryRequest = { query: trimmed, ...(availableOnly ? { availableOnly: true } : {}), ...(member ? { memberId: member.id } : {}) };
    discover.mutate(body, {
      onError: (e) => {
        if (e instanceof ApiError && e.status === 429) setCooldown(e.retryAfter ?? 10);
      },
    });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      run();
    }
  };

  const err = discover.error;
  const rateLimited = err instanceof ApiError && err.status === 429;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Book discovery</h1>
        <p className="mt-1 text-neutral-600">Describe what the member is looking for. Results come only from your catalog.</p>
      </header>

      <Card className="p-5">
        <form onSubmit={onSubmit} noValidate data-testid="discovery-form">
          <Textarea
            label="What does the member need?"
            labelAside={<span className={`text-sm tabular-nums ${query.length > MAX ? "text-danger-700" : "text-neutral-600"}`} data-testid="char-count">{query.length} / {MAX}</span>}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => query && setTouched(true)}
            error={problem}
            rows={3}
            placeholder="For example: beginner-friendly books about software architecture for someone who already programs"
            data-testid="discovery-query"
          />
          {can("MEMBER_READ") && (
            <div className="mt-4 max-w-md">
              {member ? (
                <div data-testid="discovery-member">
                  <span className="mb-1 block text-sm font-medium text-neutral-700">For member (optional)</span>
                  <div className="flex items-center gap-3 rounded-md border border-border bg-neutral-25 px-3 py-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{initials(member.fullName)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{member.fullName}</div>
                      <div className="truncate text-sm text-neutral-600">{member.memberNumber}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => { setMember(null); setMemberText(""); }} data-testid="clear-member">Clear</Button>
                  </div>
                </div>
              ) : (
                <>
                <span className="mb-1 block text-sm font-medium text-neutral-700" aria-hidden="true">For member (optional)</span>
                <Combobox
                  label="For member (optional)"
                  placeholder="Search name, member number or email"
                  value={memberText}
                  onValueChange={setMemberText}
                  options={memberQ ? members.data?.items : undefined}
                  loading={members.isFetching && Boolean(memberQ)}
                  getKey={(m) => m.id}
                  onSelect={(m) => { setMember(m); setMemberText(""); }}
                  testId="discovery-member-combobox"
                  emptyText="No members match. Check the spelling or the member number."
                  hint="Helps the AI skip books they have just read."
                  renderOption={(m) => (
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">{initials(m.fullName)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">{m.fullName}<MemberStatusBadge status={m.status} /></div>
                        <div className="truncate text-sm text-neutral-600">{m.memberNumber} · {m.email}</div>
                      </div>
                    </div>
                  )}
                />
                </>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Examples">
              <span className="text-sm text-neutral-600">Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => { setQuery(ex); setTouched(false); }}
                  className="rounded-full border border-border-strong bg-surface px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                  data-testid="example-chip"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-4">
              <label className="flex items-center gap-2 text-base text-neutral-700">
                <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} className="h-4 w-4 accent-brand-600" data-testid="available-only" />
                Available only
              </label>
              <Button type="submit" variant="primary" icon={<SparkIcon size={16} />} loading={discover.isPending} disabled={cooldown > 0} data-testid="discovery-submit">
                {cooldown > 0 ? `Try again in ${cooldown}s` : "Find books"}
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <section className="mt-6" aria-live="polite" data-testid="discovery-results">
        {discover.isPending ? (
          <Loading />
        ) : rateLimited ? (
          <InlineAlert variant="warning" testId="discovery-rate-limited">Too many searches in a minute. Try again in a few seconds.</InlineAlert>
        ) : err ? (
          <InlineAlert variant="danger" testId="discovery-error" action={<Button size="sm" onClick={run}>Try again</Button>}>
            Couldn't search the catalog. Try again.
          </InlineAlert>
        ) : discover.data ? (
          <Results data={discover.data} canBorrow={can("LOAN_PROCESS")} memberId={member?.id} />
        ) : null}
      </section>
    </>
  );
}

function Loading() {
  return (
    <div data-testid="discovery-loading" aria-busy="true">
      <p className="mb-3 text-base text-neutral-600">Searching your catalog…</p>
      <Card>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 border-b border-border p-4 last:border-b-0">
            <Skeleton className="h-16 w-12" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /><Skeleton className="h-10 w-full" /></div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Results({ data, canBorrow, memberId }: { data: DiscoveryResponse; canBorrow: boolean; memberId: string | undefined }) {
  if (data.items.length === 0) {
    return (
      <Card>
        <EmptyState
          testId="discovery-empty"
          icon={<SearchIcon size={40} />}
          title="No matching books in the catalog"
          text="Try broader words, or browse Books."
          action={<Link to="/books" search={{ page: 1, size: 20 }} className={buttonClasses({ variant: "secondary" })}>Browse books</Link>}
        />
      </Card>
    );
  }
  const n = data.items.length;
  return (
    <>
      {data.mode === "FALLBACK" && data.note && <InlineAlert variant="warning" className="mb-4" testId="discovery-fallback-notice">{data.note}</InlineAlert>}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-md font-semibold" data-testid="results-title">{n} {n === 1 ? "book" : "books"} from your catalog</h2>
        {data.mode === "AI" ? (
          <Badge variant="brand" dot={false} data-testid="mode-badge" data-mode="AI"><SparkIcon size={12} /> AI-ranked</Badge>
        ) : (
          <Badge variant="neutral" dot={false} data-testid="mode-badge" data-mode="FALLBACK">Keyword match</Badge>
        )}
        <span className="ml-auto text-sm text-neutral-600">Availability is live from the catalog, not from the AI.</span>
      </div>
      <Card>
        <ol>
          {data.items.map((item, i) => (
            <ResultRow key={item.book.id} item={item} rank={i + 1} canBorrow={canBorrow} mode={data.mode} memberId={memberId} />
          ))}
        </ol>
      </Card>
    </>
  );
}

function ResultRow({ item, rank, canBorrow, mode, memberId }: { item: DiscoveryItem; rank: number; canBorrow: boolean; mode: DiscoveryResponse["mode"]; memberId: string | undefined }) {
  const { book } = item;
  const [open, setOpen] = useState(false);
  const long = item.reason.length > 180;
  const meta = [book.author, book.category, book.publicationYear].filter(Boolean).join(" · ");
  return (
    <li className="flex gap-4 border-b border-border p-4 last:border-b-0" data-testid="discovery-item" data-book-id={book.id}>
      <span className="w-4 pt-1 text-sm text-neutral-600 tabular-nums">{rank}</span>
      <BookCover title={book.title} url={book.coverImageUrl} size="md" />
      <div className="min-w-0 flex-1">
        <Link to="/books/$bookId" params={{ bookId: book.id }} className="text-md font-semibold text-neutral-900 no-underline hover:underline">{book.title}</Link>
        <p className="text-sm text-neutral-600">{meta}</p>
        <p className="mt-2 rounded-md border-l-2 border-brand-200 bg-neutral-25 px-3 py-2 text-base" data-testid="reason">
          {mode === "AI" && <><span className="font-semibold">Why this book</span>{" "}</>}
          <span className={long && !open ? "line-clamp-3" : undefined}>{item.reason}</span>
          {long && (
            <button type="button" className="ml-1 text-sm font-medium text-brand-700" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "less" : "more"}
            </button>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <AvailabilityBadge book={book} showNextDue />
        <div className="flex gap-2">
          <Link to="/books/$bookId" params={{ bookId: book.id }} className={buttonClasses({ variant: "secondary", size: "sm" })}>View</Link>
          {canBorrow && book.availableCopies > 0 && (
            <Link to={BORROW_TO} search={{ book: book.id, ...(memberId ? { member: memberId } : {}) } as never} className={buttonClasses({ variant: "primary", size: "sm" })} data-testid="borrow-from-result">Borrow</Link>
          )}
        </div>
      </div>
    </li>
  );
}
