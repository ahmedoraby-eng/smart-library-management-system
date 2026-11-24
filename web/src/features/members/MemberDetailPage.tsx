import type { LoanDto, MemberDto } from "@slm/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  ActionMenu, ArrowLeftIcon, Badge, Button, buttonClasses, Card, CardBody, EditIcon, EmptyState, PlusIcon, InlineAlert, Skeleton, Table, Td, Th,
  Thead, Tr, useToast,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { cn } from "../../lib/cn";
import { MemberNumber } from "../../components/MemberNumber";
import { formatDate } from "../../lib/format";
import { useCan } from "../auth/session";
import { useReturn } from "../circulation/api";
import { ReturnConfirmDialog, returnErrorMessage } from "../circulation/ReturnConfirmDialog";
import { useMember, useMemberLoans, useSetMemberStatus } from "./api";
import { LoanStatusBadge, MemberStatusBadge } from "./badges";
import { DeactivateDialog } from "./DeactivateDialog";
import { MemberModal } from "./MemberModal";

const route = getRouteApi("/app/members/$memberId");

/** UI mirror of the server's MAX_ACTIVE_LOANS (the API stays the authority). */
const MAX_ACTIVE_LOANS = 5;
// The typed router knows /circulation/borrow only through its search schema; keep the cast local.
const BORROW_TO = "/circulation/borrow" as "/circulation";

function BackToMembers() {
  return (
    <Link to="/members" search={{ page: 1, size: 20 }} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 no-underline hover:text-neutral-900">
      <ArrowLeftIcon size={16} /> Members
    </Link>
  );
}

export function MemberDetailPage() {
  const { memberId } = route.useParams();
  const query = useMember(memberId);
  if (query.isPending) {
    return (
      <div data-testid="member-skeleton" aria-busy="true">
        <Skeleton className="mb-4 h-5 w-16" />
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="mt-3 h-4 w-1/2" />
        <Skeleton className="mt-8 h-48 w-full" />
      </div>
    );
  }
  if (!query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <>
        <BackToMembers />
        {notFound ? (
          <Card>
            <EmptyState
              testId="member-not-found"
              title="This member doesn't exist."
              action={<Link to="/members" search={{ page: 1, size: 20 }} className={buttonClasses()}>Back to Members</Link>}
            />
          </Card>
        ) : (
          <InlineAlert variant="danger" testId="member-error" action={<Button size="sm" onClick={() => void query.refetch()}>Try again</Button>}>
            Couldn't load this member. Check your connection and try again.
          </InlineAlert>
        )}
      </>
    );
  }
  return <MemberDetail member={query.data} />;
}

function MemberDetail({ member }: { member: MemberDto }) {
  const can = useCan();
  const toast = useToast();
  const setStatus = useSetMemberStatus();
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const inactive = member.status === "INACTIVE";

  const change = (status: "ACTIVE" | "INACTIVE") =>
    setStatus.mutate(
      { member, status },
      {
        onSuccess: () => {
          setDeactivating(false);
          toast.success(status === "INACTIVE" ? `${member.fullName} deactivated.` : `${member.fullName} reactivated.`);
        },
        onError: (err) => {
          setDeactivating(false);
          if (err instanceof ApiError && err.code === "STALE_VERSION") {
            toast.error("Someone else changed this member. The latest version is shown; try again.");
          } else if (!(err instanceof ApiError) || err.status >= 500) {
            toast.error("Couldn't change the status. Nothing was changed. Try again.");
          }
        },
      },
    );

  return (
    <>
      <BackToMembers />
      <header className="page-head mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 font-book text-title plain:tracking-tight" data-testid="member-detail-name">
            {member.fullName}
            <MemberStatusBadge status={member.status} />
          </h1>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-neutral-700" data-testid="member-profile">
            <dt className="text-neutral-600">Member no.</dt>
            <dd data-testid="profile-number"><MemberNumber value={member.memberNumber} /></dd>
            <dt className="text-neutral-600">Email</dt>
            <dd data-testid="profile-email">{member.email}</dd>
            <dt className="text-neutral-600">Phone</dt>
            <dd className="tabular-nums" data-testid="profile-phone">{member.phone ?? "—"}</dd>
            <dt className="text-neutral-600">Registered</dt>
            <dd data-testid="profile-registered">{formatDate(member.registeredAt)}</dd>
          </dl>
        </div>
        <div className="flex items-center gap-2">
          {can("LOAN_PROCESS") &&
            (inactive ? (
              <span title="Inactive members can't borrow. Reactivate them first." data-testid="borrow-disabled-reason">
                <Button variant="primary" disabled aria-disabled="true" data-testid="borrow-for-member">
                  <PlusIcon size={16} /> Borrow a book
                </Button>
              </span>
            ) : (
              <Link to={BORROW_TO} search={{ member: member.id } as never} className={buttonClasses({ variant: "primary" })} data-testid="borrow-for-member">
                <PlusIcon size={16} /> Borrow a book
              </Link>
            ))}
          {can("MEMBER_WRITE") && (
            <>
              <Button onClick={() => setEditing(true)} data-testid="edit-member">
                <EditIcon size={16} /> Edit
              </Button>
              <ActionMenu
                label="More actions"
                testId="detail-actions"
                items={[
                  inactive
                    ? { key: "reactivate", label: "Reactivate", onSelect: () => change("ACTIVE") }
                    : { key: "deactivate", label: "Deactivate", danger: true, onSelect: () => setDeactivating(true) },
                ]}
              />
            </>
          )}
        </div>
      </header>

      {inactive && (
        <InlineAlert variant="info" className="mb-4" testId="inactive-notice">
          This member is inactive and can't borrow until reactivated. Their current loans stay open.
        </InlineAlert>
      )}

      <Card>
        <Loans memberId={member.id} />
      </Card>

      {editing && <MemberModal member={member} onClose={() => setEditing(false)} />}
      {deactivating && <DeactivateDialog name={member.fullName} loading={setStatus.isPending} onCancel={() => setDeactivating(false)} onConfirm={() => change("INACTIVE")} />}
    </>
  );
}

type Tab = "open" | "history";

function Loans({ memberId }: { memberId: string }) {
  const can = useCan();
  const loans = useMemberLoans(memberId, can("LOAN_READ"));
  const [tab, setTab] = useState<Tab>("open");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ open: null, history: null });
  if (!can("LOAN_READ")) return <CardBody className="text-neutral-600">Your role can't see loans.</CardBody>;
  if (loans.isPending) {
    return (
      <div className="space-y-3 p-5" data-testid="loans-skeleton" aria-busy="true">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }
  if (loans.isError) {
    return (
      <div className="p-5" data-testid="loans-error">
        <InlineAlert variant="danger" action={<Button size="sm" onClick={() => void loans.refetch()}>Try again</Button>}>
          Couldn't load this member's loans. Check your connection and try again.
        </InlineAlert>
      </div>
    );
  }
  const open = loans.data.filter((l) => !l.returnedAt);
  const history = loans.data.filter((l) => l.returnedAt);
  const tabs: { key: Tab; label: string }[] = [
    { key: "open", label: `On loan (${open.length} of ${MAX_ACTIVE_LOANS})` },
    { key: "history", label: `History (${history.length})` },
  ];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Tab = e.key === "Home" ? "open" : e.key === "End" ? "history" : tab === "open" ? "history" : "open";
    setTab(next);
    tabRefs.current[next]?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label="Loans" className="flex gap-6 border-b border-border px-5" onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => { tabRefs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={`loans-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`loans-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            data-testid={`loans-tab-${t.key}`}
            className={cn(
              "-mb-px border-b-2 py-3 text-base font-semibold",
              tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-neutral-600 hover:text-neutral-900",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`loans-panel-${tab}`} aria-labelledby={`loans-tab-${tab}`} data-testid="loans-panel">
        {tab === "open" ? (
          <LoanTable loans={open} history={false} empty={<EmptyState testId="loans-empty" title="No books on loan" text="This member has nothing out right now." />} />
        ) : (
          <LoanTable loans={history} history empty={<EmptyState testId="loans-empty" title="No returned loans yet" text="Returned books will be listed here." />} />
        )}
      </div>
    </>
  );
}

function LoanTable({ loans, history, empty }: { loans: LoanDto[]; history: boolean; empty: React.ReactNode }) {
  const can = useCan();
  const toast = useToast();
  const giveBack = useReturn();
  const [confirming, setConfirming] = useState<LoanDto | null>(null);
  const canReturn = !history && can("LOAN_PROCESS");
  if (loans.length === 0) return <>{empty}</>;

  const confirm = (loan: LoanDto) =>
    giveBack.mutate(loan.id, {
      onSuccess: () => {
        setConfirming(null);
        toast.success(<>Returned: <em>{loan.book.title}</em>.</>);
      },
      onError: (err) => {
        setConfirming(null);
        const message = returnErrorMessage(err);
        if (message) toast.error(message);
      },
    });

  return (
    <>
      <Table aria-label={history ? "Loan history" : "Books on loan"} data-testid="loans-table">
        <Thead>
          <tr>
            <Th>Book</Th>
            <Th>Borrowed</Th>
            <Th>Due</Th>
            {history && <Th className="max-lg:hidden">Returned</Th>}
            <Th>Status</Th>
            <Th className="max-lg:hidden">Processed by</Th>
            {canReturn && (
              <Th align="right" kind="actions">
                <span className="sr-only">Actions</span>
              </Th>
            )}
          </tr>
        </Thead>
        <tbody>
          {loans.map((l) => (
            <LoanRow key={l.id} loan={l} history={history} onReturn={canReturn ? () => setConfirming(l) : undefined} />
          ))}
        </tbody>
      </Table>
      {confirming && (
        <ReturnConfirmDialog loan={confirming} loading={giveBack.isPending} onCancel={() => setConfirming(null)} onConfirm={() => confirm(confirming)} />
      )}
    </>
  );
}

function LoanRow({ loan, history, onReturn }: { loan: LoanDto; history: boolean; onReturn?: (() => void) | undefined }) {
  const overdue = loan.status === "OVERDUE";
  return (
    <Tr data-testid="loan-row" data-loan-status={loan.status} className={overdue ? "bg-overdue" : undefined}>
      <Td>
        <Link to="/books/$bookId" params={{ bookId: loan.book.id }} className="block font-book text-md text-neutral-900 no-underline hover:underline plain:text-base" data-testid="loan-book">
          {loan.book.title}
        </Link>
        <div className="truncate text-sm text-neutral-600">{loan.book.author}</div>
      </Td>
      <Td kind="num" className="text-neutral-700">{formatDate(loan.borrowedAt)}</Td>
      <Td kind="num" className={overdue ? "font-semibold text-danger-700" : "text-neutral-700"}>{formatDate(loan.dueAt)}</Td>
      {history && <Td kind="num" className="text-neutral-700 max-lg:hidden">{loan.returnedAt ? formatDate(loan.returnedAt) : "—"}</Td>}
      <Td kind="nowrap">
        <LoanStatusBadge loan={loan} />
      </Td>
      <Td kind="truncate" className="text-neutral-700 max-lg:hidden" title={loan.processedBy.name}>{loan.processedBy.name}</Td>
      {onReturn && (
        <Td align="right" kind="actions">
          <Button size="sm" onClick={onReturn} data-testid="return-button">Return</Button>
        </Td>
      )}
    </Tr>
  );
}
