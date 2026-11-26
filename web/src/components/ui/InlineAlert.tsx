import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { AlertIcon, CheckCircleIcon } from "./icons";

export type AlertVariant = "info" | "warning" | "danger" | "success";

const styles: Record<AlertVariant, string> = {
  info: "bg-info-50 border-info-200 text-info-700",
  warning: "bg-warning-50 border-warning-200 text-warning-700",
  danger: "bg-danger-50 border-danger-200 text-danger-700",
  success: "bg-success-50 border-success-200 text-success-700",
};

/** Page-level message bar. Danger and warning announce themselves (role=alert); the rest use role=status. */
export function InlineAlert({
  variant = "info",
  children,
  action,
  className,
  testId,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const Icon = variant === "success" ? CheckCircleIcon : AlertIcon;
  return (
    <div
      role={variant === "danger" || variant === "warning" ? "alert" : "status"}
      data-testid={testId}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-base motion-safe:animate-fade-up",
        styles[variant],
        className,
      )}
    >
      <Icon size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
