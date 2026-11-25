import { Button } from "./Button";

/** "Showing 1–20 of 128" + Prev/Next. Hidden when there is nothing to page. */
export function Pagination({
  page,
  size,
  total,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-sm text-neutral-600 tabular-nums" data-testid="pagination-summary">
        Showing {from}–{to} of {total}
      </p>
      {/* One page: the summary stays, Previous/Next are hidden (Haya pass 4). */}
      {lastPage > 1 && (
        <div className="flex gap-2">
          <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="page-prev">
            Previous
          </Button>
          <Button size="sm" disabled={page >= lastPage} onClick={() => onPage(page + 1)} data-testid="page-next">
            Next
          </Button>
        </div>
      )}
    </nav>
  );
}
