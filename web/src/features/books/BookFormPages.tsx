import type { BookDto, BookInput } from "@slm/contracts";
import { getRouteApi, Navigate, useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { ConfirmDialog, useToast } from "../../components/ui";
import { RequirePermission } from "../../app/RequirePermission";
import { useBook, useCategories, useSaveBook } from "./api";
import { BackToBooks, BookLoadState } from "./BookDetailPage";
import { BookForm } from "./BookForm";

const editRoute = getRouteApi("/app/books/$bookId/edit");

export function BookNewPage() {
  return (
    <RequirePermission permission="BOOK_WRITE">
      <FormScreen title="Add book" />
    </RequirePermission>
  );
}

export function BookEditPage() {
  const { bookId } = editRoute.useParams();
  const [reloads, setReloads] = useState(0);
  const query = useBook(bookId);
  if (!query.data) {
    return (
      <RequirePermission permission="BOOK_WRITE">
        <BookLoadState query={query} />
      </RequirePermission>
    );
  }
  // Archived books are read-only: send the user to the detail page.
  if (query.data.archived) return <Navigate to="/books/$bookId" params={{ bookId }} replace />;
  return (
    <RequirePermission permission="BOOK_WRITE">
      {/* Remounted only on an explicit Reload (edit conflict): background refetches never touch what the user is typing. */}
      <EditHost
        key={reloads}
        latest={query.data}
        onReload={async () => {
          await query.refetch();
          setReloads((n) => n + 1);
        }}
      />
    </RequirePermission>
  );
}

/** Pins the version the user started from, so a background refetch can't make a stale edit look current. */
function EditHost({ latest, onReload }: { latest: BookDto; onReload: () => void }) {
  const [snapshot] = useState(latest);
  return <FormScreen title="Edit book" book={snapshot} onReload={onReload} />;
}

function FormScreen({ title, book, onReload }: { title: string; book?: BookDto; onReload?: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const categories = useCategories();
  const save = useSaveBook(book?.id, book?.version);
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  // Unsaved changes: confirm before leaving (in-app navigation and tab close).
  const blocker = useBlocker({ shouldBlockFn: () => dirty.current, enableBeforeUnload: () => dirty.current, withResolver: true });

  const submit = async (input: BookInput) => {
    const saved = await save.mutateAsync(input);
    dirty.current = false;
    toast.success(book ? "Changes saved." : "Book added.");
    await navigate({ to: "/books/$bookId", params: { bookId: saved.id } });
  };

  const cancel = () => {
    if (book) void navigate({ to: "/books/$bookId", params: { bookId: book.id } });
    else void navigate({ to: "/books", search: { page: 1, size: 20 } });
  };

  return (
    <>
      <BackToBooks />
      <h1 className="mb-6 text-xl font-semibold tracking-tight">{title}</h1>
      <BookForm
        book={book}
        categories={categories.data ?? []}
        onSubmit={submit}
        onCancel={cancel}
        onDirtyChange={onDirtyChange}
        onReload={onReload}
      />
      {blocker.status === "blocked" && (
        <ConfirmDialog
          title="Discard changes?"
          cancelLabel="Keep editing"
          confirmLabel="Discard"
          destructive
          onCancel={blocker.reset}
          onConfirm={blocker.proceed}
          testId="discard-dialog"
        >
          <p>Your edits to this book will be lost.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
