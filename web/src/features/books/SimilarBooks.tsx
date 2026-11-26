import type { SimilarBook } from "@slm/contracts";
import { Link } from "@tanstack/react-router";
import { AvailabilityBadge, buttonClasses, Card, CardBody, CardHeader, Skeleton } from "../../components/ui";
import { useCan } from "../auth/session";
import { useSimilarBooks } from "./api";
import { BookCover } from "./BookCover";

const HEADING = "More like this";

/**
 * SLM-19: up to 4 catalogue books closest in meaning to this one, from the stored embeddings (no AI call per
 * view). Hidden when there are none (book not indexed yet) and when the request fails: it's a helper, never a
 * blocker on the book page.
 */
export function SimilarBooks({ bookId }: { bookId: string }) {
  const query = useSimilarBooks(bookId);
  const can = useCan();
  if (query.isPending) {
    return (
      <Card className="mt-4" data-testid="similar-skeleton" aria-busy="true">
        <CardHeader title={HEADING} />
        <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="flex gap-3">
              <Skeleton className="h-16.5 w-12" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    );
  }
  const items = query.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card className="mt-4" data-testid="similar-books">
      <CardHeader title={HEADING} action={<span className="text-sm text-neutral-600">Close in meaning</span>} />
      <CardBody>
        <ul className="slm-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <SimilarBookCard key={item.book.id} item={item} canBorrow={can("LOAN_PROCESS")} />
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function SimilarBookCard({ item: { book }, canBorrow }: { item: SimilarBook; canBorrow: boolean }) {
  return (
    <li className="group/card flex min-w-0 gap-3" data-testid="similar-book" data-book-id={book.id}>
      <BookCover title={book.title} url={book.coverImageUrl} size="md" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <Link
          to="/books/$bookId"
          params={{ bookId: book.id }}
          className="line-clamp-2 font-book leading-5 text-neutral-900 no-underline hover:underline"
          data-testid="similar-book-link"
        >
          {book.title}
        </Link>
        <p className="truncate text-sm text-neutral-600">{book.author}</p>
        <AvailabilityBadge book={book} showNextDue />
        {canBorrow && book.availableCopies > 0 && (
          <Link
            to="/circulation/borrow"
            search={{ book: book.id }}
            className={buttonClasses({ variant: "secondary", size: "sm" })}
            data-testid="similar-borrow"
          >
            Borrow
          </Link>
        )}
      </div>
    </li>
  );
}
