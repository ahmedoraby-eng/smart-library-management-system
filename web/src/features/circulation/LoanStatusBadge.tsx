import type { LoanDto } from "@slm/contracts";
import { Badge } from "../../components/ui";
import { loanStatus } from "../../lib/loanStatus";

/**
 * The one loan status badge (ux.md §2; Haya pass 1, M4): Active (info) · Due today / Due in n days
 * (warning) · Overdue · n days (danger) · Returned (neutral, no dot). Every screen uses this, so the
 * same loan shows the same status everywhere. `data-status` keeps the API status for tests.
 */
export function LoanStatusBadge({ loan, now }: { loan: Pick<LoanDto, "status" | "dueAt">; now?: Date }) {
  const m = loanStatus(loan, now);
  return (
    <Badge
      variant={m.variant}
      dot={m.kind !== "returned"}
      data-testid="loan-status"
      data-status={loan.status}
      data-kind={m.kind}
    >
      {m.label}
    </Badge>
  );
}
