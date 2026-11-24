import type { Permission } from "@slm/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  BookIcon, Button, DashboardIcon, EmptyState, HistoryIcon, InlineAlert, LogoutIcon, ShieldIcon, Skeleton,
  SparkIcon, SwapIcon, UsersIcon, useToast,
} from "../components/ui";
import { cn } from "../lib/cn";
import { ApiError, api } from "../lib/apiClient";
import { meQueryKey, useMe } from "../features/auth/session";

type NavTo = "/dashboard" | "/books" | "/members" | "/circulation" | "/loans" | "/discover" | "/admin/users";
interface NavItem {
  to: NavTo;
  label: string;
  icon: ReactNode;
  /** Hidden when the role lacks this permission (U10). */
  needs?: Permission;
  tag?: string;
}

// ux.md §1: 6 items + Staff users (Admin) below a divider. Circulation is hidden for Supervisor (no LOAN_PROCESS).
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { to: "/books", label: "Books", icon: <BookIcon />, needs: "BOOK_READ" },
  { to: "/members", label: "Members", icon: <UsersIcon />, needs: "MEMBER_READ" },
  { to: "/circulation", label: "Circulation", icon: <SwapIcon />, needs: "LOAN_PROCESS" },
  { to: "/loans", label: "Loan history", icon: <HistoryIcon />, needs: "LOAN_READ" },
  { to: "/discover", label: "Book discovery", icon: <SparkIcon />, needs: "AI_DISCOVER", tag: "AI" },
];
const ADMIN_NAV: NavItem[] = [{ to: "/admin/users", label: "Staff users", icon: <ShieldIcon />, needs: "STAFF_MANAGE" }];

const ROLE_LABEL = { ADMIN: "Admin", LIBRARIAN: "Librarian", SUPERVISOR: "Supervisor" } as const;

function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: async () => {
      queryClient.clear();
      await router.navigate({ to: "/signin", search: {} });
      toast.success("You've signed out.");
    },
  });
}

/** Authenticated shell: sidebar (240 px; icon rail under 1280 px), user card at the foot, page outlet. */
export function AppLayout() {
  const me = useMe();
  const signOut = useSignOut();

  if (me.isPending) {
    return (
      <div className="flex min-h-screen" data-testid="shell-loading">
        <div className="w-16 shrink-0 border-r border-border bg-surface xl:w-60" />
        <div className="flex-1 p-7">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-6 h-64 w-full" />
        </div>
      </div>
    );
  }
  if (me.error instanceof ApiError && me.error.code === "USER_DISABLED") {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <EmptyState
          testId="account-disabled"
          title="Your account is disabled"
          text="Ask an Admin to reactivate it."
          action={<Button onClick={() => signOut.mutate()}>Sign out</Button>}
        />
      </main>
    );
  }
  if (!me.data) {
    // 401 is redirected to /signin by the router; anything else is a failed load.
    if (me.error instanceof ApiError && me.error.status === 401) return null;
    return (
      <main className="mx-auto max-w-lg p-10">
        <InlineAlert variant="danger" action={<Button size="sm" onClick={() => void me.refetch()}>Try again</Button>}>
          Couldn't load your account. Check your connection and try again.
        </InlineAlert>
      </main>
    );
  }

  const can = (p?: Permission) => !p || me.data.permissions.includes(p);
  const items = NAV.filter((i) => can(i.needs));
  const adminItems = ADMIN_NAV.filter((i) => can(i.needs));

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-surface px-2 py-5 xl:w-60 xl:px-3">
        <div className="mb-5 flex items-center gap-2.5 px-1 text-md font-semibold xl:px-2">
          <div className="grid h-7.5 w-7.5 shrink-0 place-items-center rounded-md bg-brand-600 text-white">
            <BookIcon size={17} />
          </div>
          <span className="hidden xl:inline">Smart Library</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {items.map((i) => (
            <NavLink key={i.to} item={i} />
          ))}
          {adminItems.length > 0 && <div className="mx-2 my-2.5 h-px bg-border" role="separator" />}
          {adminItems.map((i) => (
            <NavLink key={i.to} item={i} />
          ))}
        </nav>
        <UserCard onSignOut={() => signOut.mutate()} signingOut={signOut.isPending} />
      </aside>
      <main className="min-w-0 flex-1 px-8 pt-7 pb-8" data-testid="main">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      title={item.label}
      data-testid={`nav-${item.to.slice(1).replaceAll("/", "-")}`}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 font-medium text-neutral-600 no-underline hover:bg-neutral-50 max-xl:justify-center"
      activeProps={{ className: "bg-brand-50 text-brand-700 hover:bg-brand-50", "aria-current": "page" }}
    >
      {item.icon}
      <span className="hidden xl:inline">{item.label}</span>
      {item.tag && (
        <span className="ml-auto hidden rounded-full border border-brand-200 bg-brand-50 px-1.5 text-[11px] leading-4 font-semibold text-brand-700 xl:inline">
          {item.tag}
        </span>
      )}
    </Link>
  );
}

function UserCard({ onSignOut, signingOut }: { onSignOut: () => void; signingOut: boolean }) {
  const me = useMe().data!;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = me.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div ref={box} className="relative mt-auto border-t border-border pt-3">
      {open && (
        <div role="menu" className="absolute right-0 bottom-full left-0 mb-2 min-w-40 rounded-lg border border-border bg-surface p-1 shadow-pop">
          <button
            type="button"
            role="menuitem"
            autoFocus
            disabled={signingOut}
            onClick={onSignOut}
            data-testid="sign-out"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-base text-neutral-700 hover:bg-neutral-50"
          >
            <LogoutIcon size={16} /> Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="user-menu"
        title={`${me.fullName} · ${ROLE_LABEL[me.role]}`}
        className={cn("flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-neutral-50 max-xl:justify-center")}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">{initials}</span>
        <span className="hidden min-w-0 flex-1 xl:block">
          <span className="block truncate text-sm font-semibold">{me.fullName}</span>
          <span className="block truncate text-xs text-neutral-500">{me.email}</span>
          <span className="mt-1 flex gap-1">
            <span
              className="rounded-full border border-neutral-200 bg-neutral-100 px-1.5 text-[11px] leading-4 font-medium text-neutral-700"
              title={me.role === "SUPERVISOR" ? "Read-only" : undefined}
              data-testid="role-chip"
            >
              {ROLE_LABEL[me.role]}
            </span>
            {me.isDemo && <span className="rounded-full border border-brand-200 bg-brand-50 px-1.5 text-[11px] leading-4 font-medium text-brand-700">Demo</span>}
          </span>
        </span>
      </button>
    </div>
  );
}
