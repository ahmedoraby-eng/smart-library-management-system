import type { LoanDto } from "@slm/contracts";
import { Badge } from "../../components/ui";
import { overdueDays } from "./loanFormat";

/** ux.md §2 status mapping: Active info · Overdue danger with days · Returned neutral, no dot. */
export function LoanStatusBadge({ loan }: { loan: Pick<LoanDto, "status" | "dueAt"> }) {
  if (loan.status === "RETURNED") {
    return (
      <Badge variant="neutral" dot={false} data-testid="loan-status" data-status="RETURNED">
        Returned
      </Badge>
    );
  }
  if (loan.status === "OVERDUE") {
    const n = overdueDays(loan);
    return (
      <Badge variant="danger" data-testid="loan-status" data-status="OVERDUE">
        Overdue · {n} {n === 1 ? "day" : "days"}
      </Badge>
    );
  }
  return (
    <Badge variant="info" data-testid="loan-status" data-status="ACTIVE">
      Active
    </Badge>
  );
}
