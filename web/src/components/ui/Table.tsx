import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-base", className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-neutral-25 text-xs font-medium text-neutral-600">{children}</thead>;
}

export function Th({ className, align, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return (
    <th
      scope="col"
      className={cn("border-b border-border px-4 py-3 text-xs font-medium", align === "right" ? "text-right" : "text-left", className)}
      {...rest}
    />
  );
}

/** Sort strings are "key" (ascending) or "-key" (descending), as the API expects. */
export function SortableTh({ label, sortKey, sort, defaultSort, onSort, className, align }: {
  label: string;
  sortKey: string;
  sort: string | undefined;
  /** The order the API applies when `sort` is empty; marks that column as sorted. */
  defaultSort?: string;
  onSort: (next: string) => void;
  className?: string;
  align?: "right";
}) {
  const current = sort || defaultSort;
  const dir = current === sortKey ? "ascending" : current === `-${sortKey}` ? "descending" : "none";
  return (
    <Th className={className} align={align} aria-sort={dir}>
      <button
        type="button"
        onClick={() => onSort(dir === "ascending" ? `-${sortKey}` : sortKey)}
        className={cn("-mx-1 inline-flex items-center gap-1 rounded-sm px-1 font-medium hover:text-neutral-900", dir !== "none" && "text-neutral-900")}
        data-testid={`sort-${sortKey}`}
      >
        {label}
        {dir === "ascending" ? <ChevronUpIcon size={14} /> : dir === "descending" ? <ChevronDownIcon size={14} /> : <span className="w-3.5" aria-hidden="true" />}
      </button>
    </Th>
  );
}

export function Tr({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border last:border-b-0 hover:bg-neutral-25", className)} {...rest} />;
}

export function Td({ className, align, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "right" }) {
  return <td className={cn("px-4 py-3 align-middle", align === "right" && "text-right tabular-nums", className)} {...rest} />;
}
