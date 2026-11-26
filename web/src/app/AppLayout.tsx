import type { Permission } from "@slm/contracts";
import { useIsFetching, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BookIcon,
  Button,
  DashboardIcon,
  EmptyState,
  HistoryIcon,
  InlineAlert,
  LampIcon,
  LogoutIcon,
  MemberCardIcon,
  ShieldIcon,
  SwapIcon,
  useToast,
} from "../components/ui";
import { LoadingScreen } from "../components/LoadingScreen";
import { LogoMark } from "../components/LogoMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { cn } from "../lib/cn";
import { ApiError, api } from "../lib/apiClient";
import { useMe } from "../features/auth/session";
import { OverdueBell } from "../features/circulation/OverdueBell";
import { CommandPalette } from "../features/palette/CommandPalette";

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
const ADMIN_NAV: NavItem[] = [
  { to: "/admin/users", label: "Staff users", icon: <ShieldIcon />, needs: "STAFF_MANAGE" },
];

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (me.isPending) return <LoadingScreen testId="shell-loading" />;
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
        <InlineAlert
          variant="danger"
          action={
            <Button size="sm" onClick={() => void me.refetch()}>
              Try again
            </Button>
          }
        >
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
        <CommandPalette />
        <nav aria-label="Main" className="relative flex flex-col gap-0.5">
          <NavIndicator active={[...items, ...adminItems].find((i) => isUnder(pathname, i.to))?.to} />
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
        {/* The slot is out of the flow (no layout shift); the bell's own box stays relative, so its popover opens under it (D-46-1). */}
        {can("LOAN_READ") && (
          <div className="absolute top-1 right-8 z-40" data-testid="overdue-bell-slot">
            <OverdueBell />
          </div>
        )}
        <ThemeToggle className="absolute top-1 right-1.5" />
        <FetchProgress />
        {/* A new section fades up; tabs inside Circulation animate in CirculationLayout instead. */}
        <div key={pageKey(pathname)} className="motion-safe:animate-page-in" data-testid="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** One key per page, so moving between pages replays the entrance; Circulation's tabs share one. */
export const pageKey = (pathname: string) => (pathname.startsWith("/circulation") ? "/circulation" : pathname);

const isUnder = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

/**
 * The active tab (cream paper with the brass edge; a tinted row in plain) is one element that slides to the
 * current link, so changing section reads as one movement. It is placed without a slide the first time.
 */
function NavIndicator({ active }: { active: NavTo | undefined }) {
  const self = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ top: number; height: number; slide: boolean } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = active ? self.current?.parentElement?.querySelector<HTMLElement>(`a[href="${active}"]`) : null;
      setBox((prev) => (el ? { top: el.offsetTop, height: el.offsetHeight, slide: prev !== null } : null));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active]);
  return (
    <span
      ref={self}
      aria-hidden="true"
      data-testid="nav-indicator"
      data-visible={box ? "true" : "false"}
      className={cn(
        "pointer-events-none absolute top-0 right-0 left-0 rounded-l-sm bg-canvas before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:bg-brass-500 plain:rounded-md plain:bg-brand-50 plain:before:hidden",
        box?.slide && "transition-[transform,height,opacity] duration-250 ease-out",
        !box && "opacity-0",
      )}
      style={box ? { transform: `translateY(${box.top}px)`, height: box.height } : undefined}
    />
  );
}

/** A thin brass line along the top of the page while data loads for longer than a moment (decorative). */
function FetchProgress() {
  const fetching = useIsFetching() > 0;
  if (!fetching) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="fetch-progress"
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden motion-safe:animate-[slm-fade-in_200ms_ease-out_300ms_backwards]"
    >
      <div className="h-full w-1/3 bg-brass-500 plain:bg-brand-600 motion-safe:animate-[slm-progress_1.1s_var(--ease-out)_infinite]" />
    </div>
  );
}

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      title={item.label}
      data-testid={`nav-${item.to.slice(1).replaceAll("/", "-")}`}
      className="group relative flex items-center gap-2.5 rounded-l-sm rounded-r-none px-2.5 py-2 font-medium no-underline transition-colors duration-200 ease-out max-xl:justify-center plain:rounded-md"
      inactiveProps={{ className: "text-spine-muted hover:bg-white/5 hover:text-spine-ink plain:hover:bg-neutral-50" }}
      activeProps={{ className: "font-semibold text-brand-700 plain:font-medium", "aria-current": "page" }}
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

  const initials = me.fullName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div ref={box} className="relative mt-auto mr-2 border-t border-spine-line pt-3 xl:mr-3 plain:mr-0 plain:xl:mr-0">
      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full left-0 mb-2 min-w-40 origin-bottom rounded-lg border border-border bg-surface p-1 shadow-pop motion-safe:animate-pop-up"
        >
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
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-white/5 max-xl:justify-center plain:hover:bg-neutral-50",
        )}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2a4d3e] text-xs font-semibold text-[#f6efe0] plain:bg-neutral-100 plain:text-neutral-700">
          {initials}
        </span>
        <span className="hidden min-w-0 flex-1 xl:block">
          <span className="block truncate text-sm font-semibold text-[#f6efe0] plain:text-neutral-900">
            {me.fullName}
          </span>
          <span className="block truncate text-xs text-spine-muted plain:text-neutral-500">{me.email}</span>
          <span className="mt-1 flex gap-1">
            <span
              className="rounded-xs border border-spine-ink/35 bg-transparent px-1.5 text-[11px] leading-4 font-medium text-spine-ink plain:border-neutral-200 plain:bg-neutral-100 plain:text-neutral-700"
              title={me.role === "SUPERVISOR" ? "Read-only" : undefined}
              data-testid="role-chip"
            >
              {ROLE_LABEL[me.role]}
            </span>
            {me.isDemo && (
              <span className="rounded-xs border border-spine-ink/35 bg-transparent px-1.5 text-[11px] leading-4 font-medium text-spine-ink plain:border-brand-200 plain:bg-brand-50 plain:text-brand-700">
                Demo
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}
