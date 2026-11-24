import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...rest} />;
}

/** Header 16×20 with a title (book serif; md/600 in plain) and one optional link/action. */
export function CardHeader({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-border px-5 py-4", className)}>
      <h2 className="font-book text-[19px] leading-6 plain:text-md">{title}</h2>
      {action}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...rest} />;
}
