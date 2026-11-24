import type { BookDto } from "@slm/contracts";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatDay } from "../../lib/format";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "brand" | "brass";

const styles: Record<BadgeVariant, { pill: string; dot: string }> = {
  success: { pill: "bg-success-50 border-success-200 text-success-700", dot: "bg-success-500" },
  warning: { pill: "bg-warning-50 border-warning-200 text-warning-700", dot: "bg-warning-500" },
  danger: { pill: "bg-danger-50 border-danger-200 text-danger-700", dot: "bg-danger-500" },
  info: { pill: "bg-info-50 border-info-200 text-info-700", dot: "bg-info-700" },
  neutral: { pill: "bg-neutral-100 border-neutral-200 text-neutral-700", dot: "bg-neutral-500" },
  brand: { pill: "bg-brand-50 border-brand-200 text-brand-700", dot: "bg-brand-600" },
  brass: { pill: "bg-brass-50 border-brass-200 text-brass-700", dot: "bg-brass-500" },
};

/** 22 px stamp (a pill in the plain theme): dot + text, so status is never colour alone (ux.md U8). */
export function Badge({ variant = "neutral", dot = true, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}) {
  const s = styles[variant];
  return (
    <span
      className={cn("inline-flex h-5.5 items-center gap-1.5 rounded-xs border px-2 text-xs font-medium whitespace-nowrap tabular-nums", s.pill, className)}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-xs", s.dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}

export type AvailabilityLevel = "available" | "low" | "unavailable";

/** ux.md §2 status mapping: ≥2 Available, exactly 1 Low (U9), 0 Unavailable. */
export function availabilityLevel(availableCopies: number): AvailabilityLevel {
  if (availableCopies >= 2) return "available";
  if (availableCopies === 1) return "low";
  return "unavailable";
}

const levelVariant: Record<AvailabilityLevel, BadgeVariant> = { available: "success", low: "warning", unavailable: "danger" };
const levelName: Record<AvailabilityLevel, string> = { available: "Available", low: "Low", unavailable: "Unavailable" };

/**
 * "3 of 5 available" (compact: "3 of 5"). When nothing is available, `showNextDue` adds
 * "Next copy due back 28 Nov" from `nextDueAt`.
 */
export function AvailabilityBadge({ book, compact = false, showNextDue = false }: {
  book: Pick<BookDto, "availableCopies" | "totalCopies" | "nextDueAt">;
  compact?: boolean;
  showNextDue?: boolean;
}) {
  const level = availabilityLevel(book.availableCopies);
  const text = `${book.availableCopies} of ${book.totalCopies}${compact ? "" : " available"}`;
  return (
    <span className="inline-flex flex-col items-start gap-1" data-testid="availability">
      <Badge variant={levelVariant[level]} data-testid="availability-badge" data-level={level}>
        {text}
        {/* Screen readers get the level word too, not just the colour. */}
        <span className="sr-only"> ({levelName[level]})</span>
      </Badge>
      {showNextDue && level === "unavailable" && book.nextDueAt && (
        <span className="text-xs text-neutral-600" data-testid="next-due">
          Next copy due back {formatDay(book.nextDueAt)}
        </span>
      )}
    </span>
  );
}
