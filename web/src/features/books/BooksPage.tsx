import type { BookDto, BookListQuery } from "@slm/contracts";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ActionMenu,
  type ActionMenuItem,
  AvailabilityBadge,
  BookIcon,
  Button,
  buttonClasses,
  Card,
  EditIcon,
  EmptyState,
  Input,
  InlineAlert,
  Pagination,
  Select,
  SearchIcon,
  Skeleton,
  SortableTh,
  Table,
  Td,
  Th,
  Thead,
  TrashIcon,
  Tr,
} from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { useCan } from "../auth/session";
import { useBooks, useCategories } from "./api";
import { BookCover } from "./BookCover";
import { DeleteBookDialog } from "./DeleteBookDialog";

const route = getRouteApi("/app/books");

// ux.md §3.2 sort options → API sort keys.
const SORT_OPTIONS = [
  { label: "Title A–Z", value: "title" },
  { label: "Author A–Z", value: "author" },
  { label: "Newest added", value: "-createdAt" },
  { label: "Most available", value: "-availableCopies" },
] as const;
const DEFAULT_SORT = "title";
const SEARCH_DEBOUNCE_MS = 300;

export function BooksPage() {
  const search: BookListQuery = route.useSearch();
  const navigate = route.useNavigate();
  const can = useCan();
  const categories = useCategories();
  const books = useBooks(search);
  const [deleting, setDeleting] = useState<BookDto | null>(null);

  const setSearch = (patch: Partial<BookListQuery>, opts: { resetPage?: boolean } = { resetPage: true }) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch, ...(opts.resetPage ? { page: 1 } : {}) }), replace: true });

  // Search box: local text, pushed to the URL after a pause. A change that came from the URL
  // (Clear filters, back button) wins; text the user is still typing is never overwritten.
  const [qText, setQText] = useState(search.q ?? "");
  const lastPushed = useRef(search.q ?? "");
  useEffect(() => {
    if ((search.q ?? "") !== lastPushed.current) {
      lastPushed.current = search.q ?? "";
      setQText(search.q ?? "");
    }
  }, [search.q]);
  useEffect(() => {
    const next = qText.trim();
    if (next === (search.q ?? "")) return;
    const t = setTimeout(() => {
      lastPushed.current = next;
      setSearch({ q: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // setSearch is recreated each render; the effect should restart only when the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  const availability = search.availability ?? "all";
  const filtered = Boolean(search.q || search.category || availability !== "all");
  const clearFilters = () => {
    lastPushed.current = "";
    setQText("");
    void navigate({
      search: (prev) => ({ ...prev, q: undefined, category: undefined, availability: undefined, page: 1 }),
      replace: true,
    });
  };

  const sort = search.sort || DEFAULT_SORT;
  const knownSort = SORT_OPTIONS.some((o) => o.value === sort);
  const data = books.data;

  return (
    <>
      <header className="page-head mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-book text-title plain:tracking-tight">Books</h1>
          <p className="mt-1 text-neutral-600" data-testid="result-line" aria-live="polite">
            {data ? resultLine(data.total, search.q) : " "}
            {data && filtered && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={clearFilters} data-testid="clear-filters">
                Clear filters
              </Button>
            )}
          </p>
        </div>
        {can("BOOK_WRITE") && (
          <Link to="/books/new" className={buttonClasses({ variant: "primary" })} data-testid="add-book">
            <span aria-hidden="true">+</span> Add book
          </Link>
        )}
      </header>

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-64 flex-1">
            <Input
              label="Search books"
              hideLabel
              compact
              leading={<SearchIcon size={16} />}
              type="search"
              placeholder="Search title, author or ISBN"
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              data-testid="book-search"
              autoComplete="off"
            />
          </div>
          <Select
            label="Category"
            hideLabel
            value={search.category ?? ""}
            onChange={(e) => setSearch({ category: e.target.value || undefined })}
            data-testid="filter-category"
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {search.category && !categories.data?.includes(search.category) && (
              <option value={search.category}>{search.category}</option>
            )}
          </Select>
          <Select
            label="Availability"
            hideLabel
            value={availability}
            onChange={(e) =>
              setSearch({
                availability: e.target.value === "all" ? undefined : (e.target.value as BookListQuery["availability"]),
              })
            }
            data-testid="filter-availability"
          >
            <option value="all">All availability</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </Select>
          <Select
            label="Sort"
            hideLabel
            value={sort}
            onChange={(e) => setSearch({ sort: e.target.value })}
            data-testid="sort-select"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {!knownSort && <option value={sort}>Custom sort</option>}
          </Select>
        </div>

        {books.isError && !data ? (
          <div className="p-5" data-testid="books-error">
            <InlineAlert
              variant="danger"
              action={
                <Button size="sm" onClick={() => void books.refetch()}>
                  Try again
                </Button>
              }
            >
              {books.error instanceof ApiError && books.error.status === 400
                ? "These filters aren't valid. Clear them and try again."
                : "Couldn't load books. Check your connection and try again."}
            </InlineAlert>
          </div>
        ) : books.isPending ? (
          <BooksSkeleton />
        ) : data && data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              testId="books-empty-filtered"
              icon={<SearchIcon size={40} />}
              title={search.q ? `No books match “${search.q}”` : "No books match these filters"}
              text="Check the spelling or clear the filters."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              testId="books-empty"
              icon={<BookIcon size={40} />}
              title="No books yet"
              text={
                can("BOOK_WRITE")
                  ? "Add your first book to start lending."
                  : "Books added by the library team will show here."
              }
              action={
                can("BOOK_WRITE") ? (
                  <Link to="/books/new" className={buttonClasses({ variant: "primary" })}>
                    Add book
                  </Link>
                ) : undefined
              }
            />
          )
        ) : (
          data && (
            <div
              className={books.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}
              aria-busy={books.isPlaceholderData}
            >
              <Table aria-label="Books" data-testid="books-table">
                <Thead>
                  <tr>
                    <SortableTh
                      label="Book"
                      sortKey="title"
                      sort={search.sort}
                      defaultSort={DEFAULT_SORT}
                      onSort={(s) => setSearch({ sort: s })}
                    />
                    <Th>Category</Th>
                    <SortableTh
                      label="Year"
                      sortKey="publicationYear"
                      sort={search.sort}
                      defaultSort={DEFAULT_SORT}
                      onSort={(s) => setSearch({ sort: s })}
                      className="max-lg:hidden"
                    />
                    <Th className="max-wide:hidden">ISBN</Th>
                    <SortableTh
                      label="Availability"
                      sortKey="availableCopies"
                      sort={search.sort}
                      defaultSort={DEFAULT_SORT}
                      onSort={(s) => setSearch({ sort: s })}
                    />
                    <Th align="right" kind="actions">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </Thead>
                <tbody>
                  {data.items.map((book) => (
                    <BookRow key={book.id} book={book} onDelete={setDeleting} />
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={data.page}
                size={data.size}
                total={data.total}
                onPage={(page) => setSearch({ page }, { resetPage: false })}
              />
            </div>
          )
        )}
      </Card>

      {deleting && (
        <DeleteBookDialog book={deleting} onClose={() => setDeleting(null)} onDone={() => setDeleting(null)} />
      )}
    </>
  );
}

function resultLine(total: number, q: string | undefined): string {
  if (q) return `${total} ${total === 1 ? "book matches" : "books match"} “${q}”`;
  return `${total} ${total === 1 ? "book" : "books"}`;
}

function BookRow({ book, onDelete }: { book: BookDto; onDelete: (b: BookDto) => void }) {
  const can = useCan();
  const navigate = route.useNavigate();
  const candidates: Array<ActionMenuItem | false> = [
    can("BOOK_WRITE") && {
      key: "edit",
      label: "Edit",
      icon: <EditIcon size={16} />,
      onSelect: () => void navigate({ to: "/books/$bookId/edit", params: { bookId: book.id } }),
    },
    can("BOOK_DELETE") && {
      key: "delete",
      label: "Delete",
      icon: <TrashIcon size={16} />,
      danger: true,
      onSelect: () => onDelete(book),
    },
  ];
  const items = candidates.filter((i): i is ActionMenuItem => i !== false);

  return (
    <Tr
      className="cursor-pointer"
      data-testid="book-row"
      data-book-id={book.id}
      onClick={(e) => {
        // The real link in the first cell handles keyboard and middle-click; this makes the whole row a target.
        if ((e.target as HTMLElement).closest("a, button")) return;
        void navigate({ to: "/books/$bookId", params: { bookId: book.id } });
      }}
    >
      <Td>
        <div className="flex items-center gap-3">
          <BookCover title={book.title} url={book.coverImageUrl} />
          <div className="min-w-0">
            <Link
              to="/books/$bookId"
              params={{ bookId: book.id }}
              className="block font-book text-md text-neutral-900 no-underline hover:underline plain:text-base"
              data-testid="book-title"
            >
              {book.title}
            </Link>
            <div className="truncate text-sm text-neutral-600">{book.author}</div>
          </div>
        </div>
      </Td>
      <Td kind="nowrap" className="text-neutral-700">
        {book.category}
      </Td>
      <Td kind="num" className="text-neutral-700 max-lg:hidden">
        {book.publicationYear ?? "—"}
      </Td>
      <Td kind="num" className="font-mono text-[12.5px] text-neutral-700 max-wide:hidden plain:text-base">
        {book.isbn ?? "—"}
      </Td>
      <Td kind="nowrap">
        <AvailabilityBadge book={book} showNextDue />
      </Td>
      <Td align="right" kind="actions">
        <div className="flex items-center justify-end gap-2">
          {can("LOAN_PROCESS") && book.availableCopies > 0 && (
            <Link
              to="/circulation/borrow"
              search={{ book: book.id }}
              className={buttonClasses({ size: "sm" })}
              data-testid="row-borrow"
            >
              Borrow
            </Link>
          )}
          <ActionMenu label={`Actions for ${book.title}`} items={items} testId="row-actions" />
        </div>
      </Td>
    </Tr>
  );
}

function BooksSkeleton() {
  return (
    <div className="divide-y divide-border" data-testid="books-skeleton" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-11 w-8" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
      ))}
    </div>
  );
}
