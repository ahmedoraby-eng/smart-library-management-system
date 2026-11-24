import type { BookDto } from "@slm/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ActionMenu, ArrowLeftIcon, AvailabilityBadge, Badge, Button, buttonClasses, Card, CardHeader, CardBody, EditIcon, EmptyState,
  InlineAlert, Skeleton, TrashIcon,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { useCan } from "../auth/session";
import { useBook } from "./api";
import { BookCover } from "./BookCover";
import { DeleteBookDialog } from "./DeleteBookDialog";
import { formatDay } from "../../lib/format";

const route = getRouteApi("/app/books/$bookId");

export function BackToBooks() {
  return (
    <Link to="/books" search={{ page: 1, size: 20 }} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 no-underline hover:text-neutral-900">
      <ArrowLeftIcon size={16} /> Books
    </Link>
  );
}

/** Shared by detail and edit: loading, 404 ("doesn't exist or was deleted") and failed-load states. */
export function BookLoadState({ query }: { query: ReturnType<typeof useBook> }) {
  if (query.isPending) {
    return (
      <div data-testid="book-skeleton" aria-busy="true">
        <Skeleton className="mb-4 h-5 w-16" />
        <div className="flex gap-6">
          <Skeleton className="h-33 w-24" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    );
  }
  const notFound = query.error instanceof ApiError && query.error.status === 404;
  return (
    <>
      <BackToBooks />
      {notFound ? (
        <Card>
          <EmptyState
            testId="book-not-found"
            title="This book doesn't exist or was deleted."
            action={<Link to="/books" search={{ page: 1, size: 20 }} className={buttonClasses()}>Back to Books</Link>}
          />
        </Card>
      ) : (
        <InlineAlert variant="danger" testId="book-error" action={<Button size="sm" onClick={() => void query.refetch()}>Try again</Button>}>
          Couldn't load this book. Check your connection and try again.
        </InlineAlert>
      )}
    </>
  );
}

export function BookDetailPage() {
  const { bookId } = route.useParams();
  const query = useBook(bookId);
  if (!query.data) return <BookLoadState query={query} />;
  return <BookDetail book={query.data} />;
}

function BookDetail({ book }: { book: BookDto }) {
  const can = useCan();
  const [deleting, setDeleting] = useState(false);
  const meta = [book.category, book.publisher, book.publicationYear, book.isbn ? `ISBN ${book.isbn}` : null].filter(Boolean);
  const writable = !book.archived;

  return (
    <>
      <BackToBooks />
      <header className="mb-6 flex items-start justify-between gap-6">
        <div className="flex items-start gap-6">
          <BookCover title={book.title} url={book.coverImageUrl} size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight" data-testid="book-detail-title">
              {book.title}
              {book.archived && (
                <Badge variant="neutral" dot={false} className="ml-3 align-middle" data-testid="archived-tag">
                  Archived
                </Badge>
              )}
            </h1>
            <p className="mt-1 text-md text-neutral-700">{book.author}</p>
            <p className="mt-1 text-neutral-600">{meta.join(" · ")}</p>
            {!book.archived && (
              <div className="mt-3">
                <AvailabilityBadge book={book} />
              </div>
            )}
          </div>
        </div>
        {writable && (
          <div className="flex items-center gap-2">
            {/* SLM-4: Borrow action (primary; disabled with tooltip "No copies available" at 0). */}
            {can("BOOK_WRITE") && (
              <Link to="/books/$bookId/edit" params={{ bookId: book.id }} className={buttonClasses()} data-testid="edit-book">
                <EditIcon size={16} /> Edit
              </Link>
            )}
            {can("BOOK_DELETE") && (
              <ActionMenu
                label="More actions"
                testId="detail-actions"
                items={[{ key: "delete", label: "Delete", icon: <TrashIcon size={16} />, danger: true, onSelect: () => setDeleting(true) }]}
              />
            )}
          </div>
        )}
      </header>

      {book.archived && (
        <InlineAlert variant="info" className="mb-4" testId="archived-notice">
          This book was archived. It is hidden from Books and search, and kept for Loan history.
        </InlineAlert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Description" />
          <CardBody>
            {book.description ? <p className="whitespace-pre-line text-neutral-800">{book.description}</p> : <p className="text-neutral-600">No description</p>}
          </CardBody>
          {/* SLM-5: Loans table (tabs Active (n) / History) goes here. */}
        </Card>
        <Card data-testid="copies-card">
          <CardHeader title="Copies" />
          <CardBody>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Total" value={book.totalCopies} testId="copies-total" />
              <Stat label="On loan" value={book.activeLoans} testId="copies-on-loan" />
              <Stat label="Available" value={book.availableCopies} testId="copies-available" />
            </dl>
            {!book.archived && book.availableCopies === 0 && book.nextDueAt && (
              <p className="mt-4 text-sm text-neutral-600" data-testid="next-due">
                Next copy due back {formatDay(book.nextDueAt)}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {deleting && <DeleteBookDialog book={book} onClose={() => setDeleting(false)} onDone={() => setDeleting(false)} />}
    </>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-600">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
