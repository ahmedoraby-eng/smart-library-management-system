import type { ReactNode } from "react";

/** Icon 40 px neutral-400, title md/600, one-line text, one action. */
export function EmptyState({
  icon,
  title,
  text,
  action,
  testId,
}: {
  icon?: ReactNode;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-14 text-center motion-safe:animate-fade-up"
      data-testid={testId}
    >
      {icon && <div className="text-neutral-400">{icon}</div>}
      <h3 className="text-md font-semibold">{title}</h3>
      {text && <p className="max-w-md text-base text-neutral-600">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
