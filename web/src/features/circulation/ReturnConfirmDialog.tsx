import type { LoanDto } from "@slm/contracts";
import { ConfirmDialog } from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { formatDay } from "../../lib/format";
import { formatDate, formatTime, overdueDays } from "./loanFormat";

/** The confirm step of a return (ux.md §4.2), shared by the Return screen and the member page's inline [Return]. */
export function ReturnConfirmDialog({
  loan,
  loading,
  onCancel,
  onConfirm,
}: {
  loan: LoanDto;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const days = overdueDays(loan);
  return (
    <ConfirmDialog
      testId="return-dialog"
      title={`Return ${loan.book.title} from ${loan.member.fullName}?`}
      confirmLabel="Confirm return"
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      Return date: today, {formatDate(new Date())} · was due {formatDay(loan.dueAt)}
      {loan.status === "OVERDUE" && ` (${days} ${days === 1 ? "day" : "days"} overdue)`}.
    </ConfirmDialog>
  );
}

/** The toast text for a failed return, or null when the page already shows the problem (e.g. a 4xx the form handles). */
export function returnErrorMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.code === "LOAN_ALREADY_RETURNED") {
    const ctx = err.problem.context as { returnedAt?: string; returnedBy?: string | null } | undefined;
    const when = ctx?.returnedAt ? ` on ${formatDate(ctx.returnedAt)} at ${formatTime(ctx.returnedAt)}` : "";
    return `This loan was already returned${when}${ctx?.returnedBy ? ` by ${ctx.returnedBy}` : ""}.`;
  }
  if (err instanceof ApiError && err.status === 404) return "This loan no longer exists. The list has been refreshed.";
  if (!(err instanceof ApiError) || err.status >= 500)
    return "Couldn't record the return. Nothing was saved. Try again.";
  return null;
}
