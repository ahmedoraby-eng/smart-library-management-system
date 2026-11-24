import { Link } from "@tanstack/react-router";
import { buttonClasses, Card, CardBody, EmptyState } from "../components/ui";
import { useMe } from "../features/auth/session";

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-neutral-600">{subtitle}</p>}
    </header>
  );
}

/** Placeholder until SLM-3 (KPIs). Haya refines the shell in SLM-7. */
export function DashboardPage() {
  const me = useMe().data;
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return (
    <>
      <PageHeader title="Dashboard" subtitle={today} />
      <Card>
        <CardBody>
          <p className="text-md font-semibold">Welcome{me ? `, ${me.fullName}` : ""}.</p>
          <p className="mt-1 text-neutral-600">Catalog figures and recent borrowings will appear here. For now, manage the catalog under Books.</p>
          <Link to="/books" search={{ page: 1, size: 20 }} className={`${buttonClasses({ variant: "primary" })} mt-4`}>
            Open Books
          </Link>
        </CardBody>
      </Card>
    </>
  );
}

/** Sidebar targets that are built in later stories. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState title="Coming soon" text="This section is built in a later story." />
      </Card>
    </>
  );
}

export function ForbiddenPage() {
  const me = useMe().data;
  return (
    <Card className="mx-auto mt-16 max-w-xl">
      <EmptyState
        testId="forbidden"
        title="You don't have access to this page"
        text={me?.role === "SUPERVISOR" ? "Your role (Supervisor) is read-only." : "Your role doesn't include this page."}
        action={<Link to="/dashboard" className={buttonClasses({ variant: "secondary" })}>Back to Dashboard</Link>}
      />
    </Card>
  );
}

export function NotFoundPage() {
  return (
    <Card className="mx-auto mt-16 max-w-xl">
      <EmptyState
        testId="not-found"
        title="Page not found"
        text="This page doesn't exist or was moved."
        action={<Link to="/dashboard" className={buttonClasses({ variant: "secondary" })}>Back to Dashboard</Link>}
      />
    </Card>
  );
}
