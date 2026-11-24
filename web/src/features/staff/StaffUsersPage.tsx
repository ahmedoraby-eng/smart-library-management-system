import type { Role, StaffUserDto, StaffUserListQuery } from "@slm/contracts";
import { cn } from "../../lib/cn";
import { getRouteApi } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, InlineAlert, Pagination, Select, Skeleton, Table, Td, Th, Thead, Tr, UsersIcon, useToast,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { formatDate } from "../../lib/format";
import { useAuthProviders } from "../auth/providers";
import { useCan, useMe } from "../auth/session";
import { useResetDemoData, useStaffUsers, useUpdateStaffUser } from "./api";

const route = getRouteApi("/app/admin/users");

/** ux.md §3.7 sentences. */
export const DEMO_PROTECTED = "Demo accounts are protected so every reviewer can use them.";
export const OWN_ROLE = "You can't change your own role.";
export const OWN_STATUS = "You can't disable your own account.";

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", LIBRARIAN: "Librarian", SUPERVISOR: "Supervisor" };
const withArticle = (role: Role) => `${role === "ADMIN" ? "an" : "a"} ${ROLE_LABEL[role]}`;

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "PROTECTED_DEMO_ACCOUNT") return DEMO_PROTECTED;
    if (err.status === 409 && err.problem.detail) return err.problem.detail;
  }
  return "Couldn't save the change. Try again.";
}

export function StaffUsersPage() {
  const search: StaffUserListQuery = route.useSearch();
  const navigate = route.useNavigate();
  const can = useCan();
  const me = useMe().data;
  const providers = useAuthProviders();
  const staff = useStaffUsers(search);
  const toast = useToast();
  const update = useUpdateStaffUser();
  const reset = useResetDemoData();
  const [disabling, setDisabling] = useState<StaffUserDto | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // DEMO_ACCOUNTS_ENABLED: from the public providers endpoint; a demo user signed in proves it too.
  const demoEnabled = providers.data?.demo === true || me?.isDemo === true;
  const showReset = can("STAFF_MANAGE") && demoEnabled;
  const data = staff.data;

  const setStatus = (u: StaffUserDto, status: StaffUserDto["status"], done?: () => void) =>
    update.mutate(
      { id: u.id, change: { role: u.role, status } },
      {
        onSuccess: (saved) => toast.success(status === "DISABLED" ? `${saved.fullName} is disabled.` : `${saved.fullName} is enabled.`),
        onError: (err) => toast.error(errorText(err)),
        onSettled: done,
      },
    );

  const doReset = () =>
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirmReset(false);
        toast.success("Demo data reset.");
      },
      onError: () => toast.error("Couldn't reset demo data. Try again."),
    });

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Staff users</h1>
          <p className="mt-1 text-neutral-600" data-testid="staff-caption">
            People appear here after their first Google sign-in.
          </p>
        </div>
        {showReset && (
          <Button variant="secondary" onClick={() => setConfirmReset(true)} data-testid="reset-demo">
            Reset demo data
          </Button>
        )}
      </header>

      <Card>
        {staff.isError && !data ? (
          <div className="p-5" data-testid="staff-error">
            <InlineAlert variant="danger" action={<Button size="sm" onClick={() => void staff.refetch()}>Try again</Button>}>
              Couldn't load staff users. Check your connection and try again.
            </InlineAlert>
          </div>
        ) : staff.isPending ? (
          <StaffSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState testId="staff-empty" icon={<UsersIcon size={40} />} title="No staff users yet" text="People appear here after their first Google sign-in." />
        ) : (
          data && (
            <div className={staff.isPlaceholderData ? "opacity-60 transition-opacity" : undefined} aria-busy={staff.isPlaceholderData}>
              <Table aria-label="Staff users" data-testid="staff-table">
                <Thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th className="max-lg:hidden">Added</Th>
                    <Th align="right" kind="actions">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </Thead>
                <tbody>
                  {data.items.map((u) => (
                    <StaffRow
                      key={u.id}
                      user={u}
                      isSelf={u.id === me?.id}
                      onDisable={() => setDisabling(u)}
                      onEnable={() => setStatus(u, "ACTIVE")}
                    />
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={data.page}
                size={data.size}
                total={data.total}
                onPage={(page) => void navigate({ search: (prev) => ({ ...prev, page }), replace: true })}
              />
            </div>
          )
        )}
      </Card>

      {disabling && (
        <ConfirmDialog
          title={`Disable ${disabling.fullName}?`}
          confirmLabel="Disable"
          destructive
          loading={update.isPending}
          onConfirm={() => setStatus(disabling, "DISABLED", () => setDisabling(null))}
          onCancel={() => setDisabling(null)}
          testId="disable-dialog"
        >
          <p>They will be signed out of the app on their next request.</p>
        </ConfirmDialog>
      )}

      {confirmReset && (
        <ConfirmDialog
          title="Reset demo data?"
          confirmLabel="Reset demo data"
          destructive
          loading={reset.isPending}
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
          testId="reset-dialog"
        >
          <p>
            Books, members and loans go back to the original demo set. Staff accounts stay. This also runs every night at 02:00 (Cairo).
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function StaffRow({ user, isSelf, onDisable, onEnable }: { user: StaffUserDto; isSelf: boolean; onDisable: () => void; onEnable: () => void }) {
  const toast = useToast();
  const update = useUpdateStaffUser();
  // The select shows the chosen role at once; it goes back to the stored role if the API refuses.
  const [pendingRole, setPendingRole] = useState<Role | undefined>(undefined);
  useEffect(() => setPendingRole(undefined), [user.role]);

  const roleTip = user.isDemo ? DEMO_PROTECTED : isSelf ? OWN_ROLE : undefined;
  const statusTip = user.isDemo ? DEMO_PROTECTED : isSelf ? OWN_STATUS : undefined;

  const changeRole = (role: Role) => {
    if (role === user.role) return;
    setPendingRole(role);
    update.mutate(
      { id: user.id, change: { role, status: user.status } },
      {
        onSuccess: (saved) => toast.success(`${saved.fullName} is now ${withArticle(saved.role)}.`),
        onError: (err) => {
          setPendingRole(undefined);
          toast.error(errorText(err));
        },
      },
    );
  };

  return (
    <Tr data-testid="staff-row" data-staff-id={user.id}>
      <Td kind="nowrap">
        <div className="flex items-center gap-2">
          {user.isDemo && <LockIcon className="shrink-0 text-neutral-500" data-testid="demo-lock" />}
          <span className="font-semibold text-neutral-900" data-testid="staff-name">{user.fullName}</span>
          {user.isDemo && (
            <Badge variant="neutral" dot={false} data-testid="demo-tag">
              Demo
            </Badge>
          )}
          {isSelf && <span className="text-sm text-neutral-500">(you)</span>}
        </div>
      </Td>
      <Td kind="truncate" className="text-neutral-700" title={user.email}>{user.email}</Td>
      <Td kind="nowrap">
        {/* Fixed-width box: the select fills it whether or not it sits in the tooltip wrapper (Haya pass 4). */}
        <Tip text={roleTip} className="w-36">
          <Select
            label={`Role of ${user.fullName}`}
            hideLabel
            value={pendingRole ?? user.role}
            disabled={Boolean(roleTip) || update.isPending}
            onChange={(e) => changeRole(e.target.value as Role)}
            data-testid="role-select"
          >
            <option value="ADMIN">Admin</option>
            <option value="LIBRARIAN">Librarian</option>
            <option value="SUPERVISOR">Supervisor</option>
          </Select>
        </Tip>
      </Td>
      <Td kind="nowrap">
        <Badge variant={user.status === "ACTIVE" ? "success" : "neutral"} data-testid="staff-status" data-status={user.status}>
          {user.status === "ACTIVE" ? "Active" : "Disabled"}
        </Badge>
      </Td>
      <Td kind="num" className="text-neutral-700 max-lg:hidden">{formatDate(user.createdAt)}</Td>
      <Td align="right" kind="actions">
        <Tip text={statusTip}>
          {user.status === "ACTIVE" ? (
            <Button size="sm" variant="secondary" disabled={Boolean(statusTip)} onClick={onDisable} data-testid="disable-user">
              Disable
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled={Boolean(statusTip)} onClick={onEnable} data-testid="enable-user">
              Enable
            </Button>
          )}
        </Tip>
      </Td>
    </Tr>
  );
}

/** Disabled controls get no hover events, so the tooltip sits on a wrapper; screen readers get the same text. */
function Tip({ text, children, className }: { text: string | undefined; children: ReactNode; className?: string }) {
  if (!text) return <div className={className}>{children}</div>;
  return (
    <span className={cn("inline-block", className)} title={text} data-testid="control-tip">
      {children}
      <span className="sr-only">{text}</span>
    </span>
  );
}

function LockIcon({ className, ...rest }: { className?: string; "data-testid"?: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} role="img" aria-label="Locked demo account" {...rest}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function StaffSkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="staff-skeleton" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
