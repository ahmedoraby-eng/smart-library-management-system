import type { LoanDto, MemberStatus } from "@slm/contracts";
import { Badge } from "../../components/ui";
import { loanBadge } from "../../lib/loanStatus";

/** ux.md §2: Member Active (success) / Inactive (neutral); text + dot, never colour alone. */
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <Badge variant={status === "ACTIVE" ? "success" : "neutral"} data-testid="member-status" data-status={status}>
      {status === "ACTIVE" ? "Active" : "Inactive"}
    </Badge>
  );
}

/** ux.md §2 loan statuses: Active (info), Due soon (warning), Overdue (danger), Returned (neutral, no dot). */
export function LoanStatusBadge({ loan }: { loan: Pick<LoanDto, "status" | "dueAt"> }) {
  const m = loanBadge(loan);
  return (
    <Badge variant={m.variant} dot={m.kind !== "returned"} data-testid="loan-status" data-kind={m.kind}>
      {m.label}
    </Badge>
  );
}
