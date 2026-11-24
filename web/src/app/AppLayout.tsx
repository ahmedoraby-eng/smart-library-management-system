import type { Permission } from "@slm/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  BookIcon, Button, DashboardIcon, EmptyState, HistoryIcon, InlineAlert, LampIcon, LogoutIcon, MemberCardIcon, ShieldIcon, Skeleton,
  SwapIcon, useToast,
} from "../components/ui";
import { LogoMark } from "../components/LogoMark";
import { ThemeToggle } from "../components/ThemeToggle";
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
  { to: "/members", label: "Members", icon: <MemberCardIcon />, needs: "MEMBER_READ" },
  { to: "/circulation", label: "Circulation", icon: <SwapIcon />, needs: "LOAN_PROCESS" },
  { to: "/loans", label: "Loan history", icon: <HistoryIcon />, needs: "LOAN_READ" },
  { to: "/discover", label: "Book discovery", icon: <LampIcon />, needs: "AI_DISCOVER", tag: "AI" },
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

/**
 * Authenticated shell: sidebar (240 px; icon rail under 1280 px), user card at the foot, page outlet.
 * Reading Room: the sidebar is the dark "spine" and the active item is a tab pulled out onto the page.
 */
export function AppLayout() {
  const me = useMe();
  const signOut = useSignOut();

  if (me.isPending) {
    return (
      <div className="flex min-h-screen" data-testid="shell-loading">
        <div className="w-16 shrink-0 bg-spine plain:border-r plain:border-border xl:w-60" />
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
      <aside
        data-spine
        className="sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-spine py-5 pr-0 pl-2 text-spine-ink xl:w-60 xl:pl-3 plain:border-r plain:border-border plain:px-2 plain:xl:px-3"
      >
        <div className="mb-5 flex items-center gap-2.5 px-1 text-md font-semibold xl:px-2">
          <LogoMark />
          <span className="hidden font-book text-[19px] text-[#f6efe0] xl:inline plain:text-md plain:text-neutral-900">
            Smart <i className="text-brass-200 plain:not-italic plain:text-inherit">Library</i>
          </span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {items.map((i) => (
            <NavLink key={i.to} item={i} />
          ))}
          {adminItems.length > 0 && <div className="mx-2 my-2.5 h-px bg-spine-line" role="separator" />}
          {adminItems.map((i) => (
            <NavLink key={i.to} item={i} />
          ))}
        </nav>
        <UserCard onSignOut={() => signOut.mutate()} signingOut={signOut.isPending} />
      </aside>
      <main className="relative min-w-0 flex-1 px-8 pt-7 pb-8" data-testid="main">
        <ThemeToggle className="absolute top-1 right-1.5" />
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
      className="group relative flex items-center gap-2.5 rounded-l-sm rounded-r-none px-2.5 py-2 font-medium no-underline max-xl:justify-center plain:rounded-md"
      inactiveProps={{ className: "text-spine-muted hover:bg-white/5 plain:hover:bg-neutral-50" }}
      activeProps={{
        className:
          "bg-canvas font-semibold text-brand-700 before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:bg-brass-500 plain:bg-brand-50 plain:font-medium plain:before:hidden",
        "aria-current": "page",
      }}
    >
      {item.icon}
      <span className="hidden xl:inline">{item.label}</span>
      {item.tag && (
        <span className="ml-auto hidden pr-2 text-[10.5px] leading-4 font-semibold tracking-[.12em] text-brass-200 group-aria-[current=page]:text-brass-700 xl:inline plain:rounded-full plain:border plain:border-brand-200 plain:bg-brand-50 plain:px-1.5 plain:text-[11px] plain:tracking-normal plain:text-brand-700">
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
    <div ref={box} className="relative mt-auto mr-2 border-t border-spine-line pt-3 xl:mr-3 plain:mr-0 plain:xl:mr-0">
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
        className={cn("flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-white/5 max-xl:justify-center plain:hover:bg-neutral-50")}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2a4d3e] text-xs font-semibold text-[#f6efe0] plain:bg-neutral-100 plain:text-neutral-700">{initials}</span>
        <span className="hidden min-w-0 flex-1 xl:block">
          <span className="block truncate text-sm font-semibold text-[#f6efe0] plain:text-neutral-900">{me.fullName}</span>
          <span className="block truncate text-xs text-spine-muted plain:text-neutral-500">{me.email}</span>
          <span className="mt-1 flex gap-1">
            <span
              className="rounded-xs border border-spine-ink/35 bg-transparent px-1.5 text-[11px] leading-4 font-medium text-spine-ink plain:border-neutral-200 plain:bg-neutral-100 plain:text-neutral-700"
              title={me.role === "SUPERVISOR" ? "Read-only" : undefined}
              data-testid="role-chip"
            >
              {ROLE_LABEL[me.role]}
            </span>
            {me.isDemo && <span className="rounded-xs border border-spine-ink/35 bg-transparent px-1.5 text-[11px] leading-4 font-medium text-spine-ink plain:border-brand-200 plain:bg-brand-50 plain:text-brand-700">Demo</span>}
          </span>
        </span>
      </button>
    </div>
  );
}
