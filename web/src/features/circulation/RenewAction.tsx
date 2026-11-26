import type { LoanDto } from "@slm/contracts";
import { useState } from "react";
import { Badge, Button, InlineAlert, useToast } from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import { useRenew } from "./api";

/**
 * Why a loan can't be renewed now, or null when it can (SLM-18; the API enforces the same rule).
 * The order matches the API's: returned → already renewed → overdue.
 */
export function renewBlock(loan: Pick<LoanDto, "status" | "renewedAt">): string | null {
  if (loan.status === "RETURNED") return "Returned loans can't be renewed.";
  if (loan.renewedAt) return "Already renewed once. A loan can be renewed only once.";
  if (loan.status === "OVERDUE") return "Overdue loans can't be renewed. Record the return instead.";
  return null;
}

/** The inline message for a refused or failed renewal: the API's own words for a 4xx, a generic one otherwise. */
export function renewErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500 && err.problem.detail) return err.problem.detail;
  return "Couldn't renew the loan. Nothing was saved. Try again.";
}

/**
 * One renewal flow for the Return list and Loan history: a success toast with the new due date, an inline
 * error (shown by the page with `RenewError`) on refusal. The lists refresh either way (useRenew invalidates).
 */
export function useRenewAction() {
  const renew = useRenew();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const run = (loan: LoanDto) => {
    setError(null);
    renew.mutate(loan.id, {
      onSuccess: (renewed) =>
        toast.success(
          <>
            Renewed: <em>{loan.book.title}</em>. New due date: {formatDate(renewed.dueAt)}.
          </>,
        ),
      onError: (err) => setError(renewErrorMessage(err)),
    });
  };
  return {
    run,
    pendingId: renew.isPending ? renew.variables : undefined,
    error,
    clearError: () => setError(null),
  };
}

/** [Renew]: disabled with a visible reason when the data forbids it (ADR-0125). Callers hide it from roles without LOAN_PROCESS. */
export function RenewButton({
  loan,
  pending,
  onRenew,
  className,
}: {
  loan: LoanDto;
  pending: boolean;
  onRenew: (loan: LoanDto) => void;
  className?: string;
}) {
  const block = renewBlock(loan);
  const button = (
    <Button
      size="sm"
      variant="ghost"
      disabled={Boolean(block)}
      loading={pending}
      onClick={() => onRenew(loan)}
      aria-label={`Renew ${loan.book.title} for ${loan.member.fullName}`}
      aria-describedby={block ? `renew-block-${loan.id}` : undefined}
      data-testid="renew-button"
      className={block ? undefined : className}
    >
      Renew
    </Button>
  );
  if (!block) return button;
  return (
    <span className={cn("inline-block", className)} title={block} data-testid="renew-blocked">
      {button}
      <span id={`renew-block-${loan.id}`} className="sr-only">
        {block}
      </span>
    </span>
  );
}

/** «Renewed» marker next to the status badge. */
export function RenewedBadge({ loan, className = "ml-1.5" }: { loan: Pick<LoanDto, "renewedAt">; className?: string }) {
  if (!loan.renewedAt) return null;
  return (
    <Badge
      variant="brand"
      dot={false}
      className={className}
      title={`Renewed on ${formatDate(loan.renewedAt)}`}
      data-testid="renewed-badge"
    >
      Renewed
    </Badge>
  );
}

/** The inline error of a refused renewal, above the list, until dismissed or the next renewal. */
export function RenewError({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="border-b border-border p-4">
      <InlineAlert
        variant="danger"
        testId="renew-error"
        action={
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        }
      >
        {message}
      </InlineAlert>
    </div>
  );
}
