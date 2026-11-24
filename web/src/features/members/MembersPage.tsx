import type { MemberDto, MemberListQuery } from "@slm/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ActionMenu, type ActionMenuItem, Badge, Button, Card, EditIcon, EmptyState, InlineAlert, Input, Pagination, SearchIcon, Select,
  Skeleton, SortableTh, Table, Td, Th, Thead, Tr, UsersIcon,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { MemberNumber } from "../../components/MemberNumber";
import { formatDate } from "../../lib/format";
import { useCan } from "../auth/session";
import { useMembers } from "./api";
import { MemberStatusBadge } from "./badges";
import { MemberModal } from "./MemberModal";

const route = getRouteApi("/app/members");

const DEFAULT_SORT = "fullName";
const DEFAULT_STATUS = "ACTIVE" as const; // ux.md §3.5: Status filter defaults to Active
const SEARCH_DEBOUNCE_MS = 300;

/** The list as the API is asked: a missing status means the default (Active), `ALL` is explicit. */
const statusOf = (s: MemberListQuery["status"]) => s ?? DEFAULT_STATUS;

export function MembersPage() {
  const search: MemberListQuery = route.useSearch();
  const navigate = route.useNavigate();
  const can = useCan();
  const status = statusOf(search.status);
  const members = useMembers({ ...search, status });
  const [modal, setModal] = useState<{ member?: MemberDto } | null>(null);

  const setSearch = (patch: Partial<MemberListQuery>, opts: { resetPage?: boolean } = { resetPage: true }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, ...(opts.resetPage ? { page: 1 } : {}) }), replace: true });

  // Search box: local text pushed to the URL after a pause; a change from the URL (Clear filters, back) wins.
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
    // setSearch is recreated each render; restart only when the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  const filtered = Boolean(search.q || status !== DEFAULT_STATUS);
  const clearFilters = () => {
    lastPushed.current = "";
    setQText("");
    void navigate({ search: (prev) => ({ ...prev, q: undefined, status: undefined, page: 1 }), replace: true });
  };
  const data = members.data;

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-neutral-600" data-testid="result-line" aria-live="polite">
            {data ? resultLine(data.total, search.q, status) : " "}
            {data && filtered && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={clearFilters} data-testid="clear-filters">
                Clear filters
              </Button>
            )}
          </p>
        </div>
        {can("MEMBER_WRITE") && (
          <Button variant="primary" onClick={() => setModal({})} data-testid="add-member">
            <span aria-hidden="true">+</span> Add member
          </Button>
        )}
      </header>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-64 flex-1">
            <Input
              label="Search members"
              hideLabel
              compact
              leading={<SearchIcon size={16} />}
              type="search"
              placeholder="Search name, member number or email"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              data-testid="member-search"
              autoComplete="off"
            />
          </div>
          <Select
            label="Status"
            hideLabel
            value={status}
            onChange={(e) => setSearch({ status: e.target.value === DEFAULT_STATUS ? undefined : (e.target.value as MemberListQuery["status"]) })}
            data-testid="filter-status"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ALL">All statuses</option>
          </Select>
        </div>

        {members.isError && !data ? (
          <div className="p-5" data-testid="members-error">
            <InlineAlert variant="danger" action={<Button size="sm" onClick={() => void members.refetch()}>Try again</Button>}>
              {members.error instanceof ApiError && members.error.status === 400
                ? "These filters aren't valid. Clear them and try again."
                : "Couldn't load members. Check your connection and try again."}
            </InlineAlert>
          </div>
        ) : members.isPending ? (
          <MembersSkeleton />
        ) : data && data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              testId="members-empty-filtered"
              icon={<SearchIcon size={40} />}
              title={search.q ? `No members match “${search.q}”` : "No members match these filters"}
              text="Check the spelling or clear the filters."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              testId="members-empty"
              icon={<UsersIcon size={40} />}
              title="No members yet"
              text={can("MEMBER_WRITE") ? "Add your first member to start lending." : "Members added by the library team will show here."}
              action={can("MEMBER_WRITE") ? <Button variant="primary" onClick={() => setModal({})}>Add member</Button> : undefined}
            />
          )
        ) : (
          data && (
            <div className={members.isPlaceholderData ? "opacity-60 transition-opacity" : undefined} aria-busy={members.isPlaceholderData}>
              <Table aria-label="Members" data-testid="members-table">
                <Thead>
                  <tr>
                    <SortableTh label="Member" sortKey="fullName" sort={search.sort} defaultSort={DEFAULT_SORT} onSort={(s) => setSearch({ sort: s })} />
                    <SortableTh label="Member no." sortKey="memberNumber" sort={search.sort} defaultSort={DEFAULT_SORT} onSort={(s) => setSearch({ sort: s })} />
                    <Th className="max-lg:hidden">Phone</Th>
                    <Th>Status</Th>
                    <Th>Books on loan</Th>
                    <SortableTh
                      label="Registered"
                      sortKey="registeredAt"
                      sort={search.sort}
                      defaultSort={DEFAULT_SORT}
                      onSort={(s) => setSearch({ sort: s })}
                      className="max-lg:hidden"
                    />
                    <Th align="right" kind="actions">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </Thead>
                <tbody>
                  {data.items.map((m) => (
                    <MemberRow key={m.id} member={m} onEdit={(member) => setModal({ member })} />
                  ))}
                </tbody>
              </Table>
              <Pagination page={data.page} size={data.size} total={data.total} onPage={(page) => setSearch({ page }, { resetPage: false })} />
            </div>
          )
        )}
      </Card>

      {modal && <MemberModal member={modal.member} onClose={() => setModal(null)} />}
    </>
  );
}

function resultLine(total: number, q: string | undefined, status: string): string {
  const noun = total === 1 ? "member" : "members";
  const label = status === "ACTIVE" ? `active ${noun}` : status === "INACTIVE" ? `inactive ${noun}` : noun;
  if (q) return `${total} ${total === 1 ? "member matches" : "members match"} “${q}”`;
  return `${total} ${label}`;
}

function MemberRow({ member, onEdit }: { member: MemberDto; onEdit: (m: MemberDto) => void }) {
  const can = useCan();
  const navigate = route.useNavigate();
  const items: ActionMenuItem[] = can("MEMBER_WRITE")
    ? [{ key: "edit", label: "Edit", icon: <EditIcon size={16} />, onSelect: () => onEdit(member) }]
    : [];

  return (
    <Tr
      className="cursor-pointer"
      data-testid="member-row"
      data-member-id={member.id}
      onClick={(e) => {
        // The real link in the first cell serves keyboard and middle-click; this makes the whole row a target.
        if ((e.target as HTMLElement).closest("a, button")) return;
        void navigate({ to: "/members/$memberId", params: { memberId: member.id } });
      }}
    >
      <Td>
        <Link to="/members/$memberId" params={{ memberId: member.id }} className="block font-semibold text-neutral-900 no-underline hover:underline" data-testid="member-name">
          {member.fullName}
        </Link>
        <div className="truncate text-sm text-neutral-600">{member.email}</div>
      </Td>
      <Td kind="nowrap" className="text-neutral-700" data-testid="member-number-cell"><MemberNumber value={member.memberNumber} /></Td>
      <Td kind="num" className="text-neutral-700 max-lg:hidden">{member.phone ?? "—"}</Td>
      <Td kind="nowrap">
        <MemberStatusBadge status={member.status} />
      </Td>
      <Td kind="nowrap">
        <div className="flex items-center gap-2">
          <span className="tabular-nums" data-testid="active-loans">{member.activeLoans}</span>
          {member.overdueLoans > 0 && (
            <Badge variant="danger" data-testid="overdue-badge">
              {member.overdueLoans} overdue
            </Badge>
          )}
        </div>
      </Td>
      <Td kind="num" className="text-neutral-700 max-lg:hidden">{formatDate(member.registeredAt)}</Td>
      <Td align="right" kind="actions">
        <div className="flex items-center justify-end gap-2">
          {/* SLM-4: Borrow action (secondary button, only for ACTIVE members, role with LOAN_PROCESS). */}
          <ActionMenu label={`Actions for ${member.fullName}`} items={items} testId="row-actions" />
        </div>
      </Td>
    </Tr>
  );
}

function MembersSkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="members-skeleton" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
