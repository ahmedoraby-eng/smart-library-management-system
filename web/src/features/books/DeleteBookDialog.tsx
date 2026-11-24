import type { BookDto } from "@slm/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { Button, ConfirmDialog, Modal, useToast } from "../../components/ui";
import { ApiError } from "../../lib/apiClient";
import { useLoans } from "../circulation/api";
import { useDeleteBook } from "./api";

/**
 * The three delete outcomes of ux.md §3.4 / scope D3, chosen from the BookDto before any call:
 * open loans → blocked, past loans only → archive, never borrowed → permanent delete.
 */
export function DeleteBookDialog({ book, onClose, onDone }: { book: BookDto; onClose: () => void; onDone?: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const del = useDeleteBook();
  const closeRef = useRef<HTMLButtonElement>(null);
  // ux §3.4: the archive dialog states how many past loans the book has (one cheap count query).
  const past = useLoans({ bookId: book.id, size: 1 }, { enabled: book.activeLoans === 0 && book.hasLoanHistory });
  const pastCount = past.data?.total;

  if (book.activeLoans > 0) {
    return <BlockedDialog book={book} onClose={onClose} closeRef={closeRef} />;
  }

  const archive = book.hasLoanHistory;
  const run = () =>
    del.mutate(book.id, {
      onSuccess: (res) => {
        toast.success(
          <>
            <em>{book.title}</em> {res.result === "archived" ? "archived" : "deleted"}.
          </>,
        );
        onDone?.();
        void navigate({ to: "/books", search: { page: 1, size: 20 } });
      },
      onError: (err) => {
        onClose();
        if (err instanceof ApiError && err.code === "BOOK_HAS_ACTIVE_LOANS") {
          toast.error(<>Can't remove <em>{book.title}</em>: copies are on loan. Record their returns first.</>);
        } else if (!(err instanceof ApiError) || err.status >= 500) {
          toast.error("Couldn't remove the book. Nothing was changed. Try again.");
        }
      },
    });

  return archive ? (
    <ConfirmDialog
      title={`Remove ${book.title} from the catalog?`}
      confirmLabel="Archive book"
      destructive
      loading={del.isPending}
      onCancel={onClose}
      onConfirm={run}
      testId="delete-dialog-archive"
    >
      <p>
        It has {pastCount === undefined ? "past loans" : `${pastCount} past ${pastCount === 1 ? "loan" : "loans"}`}, so it will be <strong>archived</strong>: hidden from Books and search, still shown in Loan history.
      </p>
    </ConfirmDialog>
  ) : (
    <ConfirmDialog
      title={`Delete ${book.title}?`}
      confirmLabel="Delete book"
      destructive
      loading={del.isPending}
      onCancel={onClose}
      onConfirm={run}
      testId="delete-dialog-delete"
    >
      <p>It has never been borrowed, so it will be deleted permanently. This can't be undone.</p>
    </ConfirmDialog>
  );
}

function BlockedDialog({ book, onClose, closeRef }: { book: BookDto; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const navigate = useNavigate();
  return (
    <Modal
      title={`Can't delete ${book.title}`}
      onClose={onClose}
      initialFocusRef={closeRef}
      testId="delete-dialog-blocked"
      footer={
        <>
          <Button
            onClick={() => {
              onClose();
              void navigate({ to: "/loans", search: { bookId: book.id, status: "ACTIVE", page: 1, size: 20 } });
            }}
            data-testid="dialog-view-loans"
          >
            View active loans
          </Button>
          <Button ref={closeRef} variant="primary" onClick={onClose} data-testid="dialog-cancel">
            Close
          </Button>
        </>
      }
    >
      <p>
        {book.activeLoans === 1 ? "1 copy is" : `${book.activeLoans} copies are`} on loan. Record {book.activeLoans === 1 ? "its return" : "their returns"} first.
      </p>
    </Modal>
  );
}
