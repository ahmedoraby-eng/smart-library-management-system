import { Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PlusIcon, SwapIcon } from "../../components/ui";
import { RequirePermission } from "../../app/RequirePermission";
import { useLoans } from "./api";

/** ux.md U2: Borrow and Return together under Circulation, two tabs. Hidden for Supervisor (no LOAN_PROCESS). */
export function CirculationLayout() {
  const active = useLoans({ status: "ACTIVE", size: 1 });
  return (
    <RequirePermission permission="LOAN_PROCESS">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Circulation</h1>
        <p className="mt-1 text-neutral-600">Record a borrowing or a return.</p>
      </header>
      <nav aria-label="Circulation" className="mb-6 flex gap-6 border-b border-border">
        <Tab to="/circulation/borrow" testId="tab-borrow" icon={<PlusIcon size={16} />}>
          Borrow book
        </Tab>
        <Tab to="/circulation/return" testId="tab-return" icon={<SwapIcon size={16} />}>
          Return book
          {active.data && (
            <span className="ml-1 rounded-full bg-neutral-100 px-1.5 text-xs font-semibold text-neutral-700 tabular-nums" data-testid="active-count">
              {active.data.total} active
            </span>
          )}
        </Tab>
      </nav>
      <Outlet />
    </RequirePermission>
  );
}

function Tab({ to, icon, children, testId }: { to: "/circulation/borrow" | "/circulation/return"; icon: ReactNode; children: ReactNode; testId: string }) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="-mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-1 pb-3 font-semibold text-neutral-600 no-underline hover:text-neutral-900 aria-[current=page]:border-brand-600 aria-[current=page]:text-brand-700"
      activeProps={{ "aria-current": "page" }}
    >
      {icon}
      {children}
    </Link>
  );
}
