import type { MemberStatus } from "@slm/contracts";
import { Badge } from "../../components/ui";

/** ux.md §2: Member Active (success) / Inactive (neutral); text + dot, never colour alone. */
export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  return (
    <Badge variant={status === "ACTIVE" ? "success" : "neutral"} data-testid="member-status" data-status={status}>
      {status === "ACTIVE" ? "Active" : "Inactive"}
    </Badge>
  );
}

export { LoanStatusBadge } from "../circulation/LoanStatusBadge";
