// @vitest-environment jsdom
import type { BookDto, LoanDto, Me } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { page, renderApp } from "../circulation/testApp";
import { BackToBooks, BookLoadState } from "./BookDetailPage";

afterEach(() => vi.unstubAllGlobals());

const BOOK_ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";

const me = (role: "ADMIN" | "LIBRARIAN" | "SUPERVISOR"): Me => ({
  id: "u1", email: "u@library.test", fullName: "Test User", role, permissions: [...ROLE_PERMISSIONS[role]], isDemo: false,
});
const book = (patch: Partial<BookDto> = {}): BookDto => ({
  id: BOOK_ID, title: "Refactoring", author: "Martin Fowler", isbn: "9780134757599", description: "Improving the design\nof existing code.",
  category: "Software", publisher: "Addison-Wesley", publicationYear: 2018, coverImageUrl: null, totalCopies: 4, availableCopies: 3,
  activeLoans: 1, nextDueAt: null, hasLoanHistory: true, archived: false, version: 2,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...patch,
});
const loan = (patch: Partial<LoanDto> = {}): LoanDto => ({
  id: "L1", status: "ACTIVE", book: { id: BOOK_ID, title: "Refactoring", author: "Martin Fowler" },
  member: { id: "m1", memberNumber: "M-000007", fullName: "Nadia Said" }, processedBy: { id: "s1", name: "Layla Librarian" },
  returnedBy: null, borrowedAt: "2026-11-01T10:00:00.000Z", dueAt: new Date(Date.now() + 9 * 86_400_000).toISOString(), returnedAt: null, ...patch,
});

type Req = { method: string; url: URL; body: unknown };
const open = (b: BookDto, who: Me = me("LIBRARIAN"), extra?: (r: Req) => { status?: number; body: unknown } | undefined) =>
  renderApp(`/books/${BOOK_ID}`, (r) => {
    if (r.url.pathname === `/api/books/${BOOK_ID}` && r.method === "GET") return { body: b };
    if (r.url.pathname === "/api/loans") return { body: page([loan()]) };
    return extra?.(r);
  }, who);

describe("Book detail page", () => {
  it("shows the book, its meta line, description, copies and the availability badge", async () => {
    await open(book());
    expect(await screen.findByTestId("book-detail-title")).toHaveTextContent("Refactoring");
    expect(screen.getByText("Martin Fowler")).toBeInTheDocument();
    expect(screen.getByText("Software · Addison-Wesley · 2018 · ISBN 9780134757599")).toBeInTheDocument();
    expect(screen.getByText(/Improving the design/)).toBeInTheDocument();
    expect(screen.getByTestId("copies-total")).toHaveTextContent("4");
    expect(screen.getByTestId("copies-on-loan")).toHaveTextContent("1");
    expect(screen.getByTestId("copies-available")).toHaveTextContent("3");
    expect(screen.getByTestId("availability-badge")).toHaveTextContent("3 of 4 available");
    expect(screen.queryByTestId("archived-tag")).not.toBeInTheDocument();
    expect(screen.queryByTestId("next-due")).not.toBeInTheDocument();
  });

  it("falls back to 'No description' and leaves empty meta parts out", async () => {
    await open(book({ description: "", isbn: null, publisher: "", publicationYear: null }));
    expect(await screen.findByText("No description")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
  });

  it("a librarian can borrow and edit but is not offered Delete", async () => {
    await open(book());
    const borrow = await screen.findByTestId("detail-borrow");
    expect(borrow).toHaveAttribute("href", expect.stringContaining("/circulation/borrow"));
    expect(borrow.getAttribute("href")).toContain(BOOK_ID);
    expect(screen.getByTestId("edit-book")).toHaveAttribute("href", `/books/${BOOK_ID}/edit`);
    expect(screen.queryByTestId("detail-actions")).not.toBeInTheDocument();
  });

  it("with no copies left Borrow is disabled with a reason, and the next due date shows", async () => {
    await open(book({ availableCopies: 0, activeLoans: 4, nextDueAt: "2026-12-24T10:00:00.000Z" }));
    const wrap = await screen.findByTestId("detail-borrow-disabled");
    expect(within(wrap).getByRole("button", { name: "Borrow" })).toBeDisabled();
    expect(wrap).toHaveTextContent("No copies available");
    expect(screen.queryByTestId("detail-borrow")).not.toBeInTheDocument();
    expect(screen.getByTestId("copies-card").querySelector('[data-testid="next-due"]')).toHaveTextContent(/Next copy due back/);
  });

  it("a supervisor is read-only: no borrow, edit or delete, but the loans list is there", async () => {
    await open(book(), me("SUPERVISOR"));
    await screen.findByTestId("book-detail-title");
    expect(screen.queryByTestId("detail-borrow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-book")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-actions")).not.toBeInTheDocument();
    expect(await screen.findByTestId("book-loans")).toBeInTheDocument();
  });

  it("without LOAN_READ the loans section is not rendered", async () => {
    const noLoans: Me = { ...me("LIBRARIAN"), permissions: ["BOOK_READ", "BOOK_WRITE"] };
    await open(book(), noLoans);
    await screen.findByTestId("book-detail-title");
    expect(screen.queryByTestId("book-loans")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-borrow")).not.toBeInTheDocument();
  });

  it("an archived book is read-only: tag, notice, no availability badge, no actions", async () => {
    await open(book({ archived: true, availableCopies: 0, nextDueAt: "2026-12-24T10:00:00.000Z" }), me("ADMIN"));
    expect(await screen.findByTestId("archived-tag")).toHaveTextContent("Archived");
    expect(screen.getByTestId("archived-notice")).toHaveTextContent("This book was archived.");
    expect(screen.queryByTestId("availability-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-book")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-actions")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-borrow")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("copies-card")).queryByTestId("next-due")).not.toBeInTheDocument();
  });

  it("an admin deletes a never-borrowed book: confirm sends DELETE and returns to the list", async () => {
    const user = userEvent.setup();
    const { fetchMock, router } = await open(book({ hasLoanHistory: false, activeLoans: 0 }), me("ADMIN"), ({ method, url }) => {
      if (url.pathname === `/api/books/${BOOK_ID}` && method === "DELETE") return { body: { result: "deleted" } };
      if (url.pathname === "/api/books") return { body: page([]) };
      return undefined;
    });
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-delete"));
    expect(await screen.findByTestId("delete-dialog-delete")).toBeInTheDocument();
    await user.click(screen.getByTestId("dialog-confirm"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
    expect(fetchMock).toHaveBeenCalledWith(`/api/books/${BOOK_ID}`, expect.objectContaining({ method: "DELETE" }));
  });

  it("cancelling the delete dialog closes it and sends nothing", async () => {
    const user = userEvent.setup();
    const { fetchMock } = await open(book({ hasLoanHistory: false, activeLoans: 0 }), me("ADMIN"));
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-delete"));
    await user.click(await screen.findByTestId("dialog-cancel"));
    await waitFor(() => expect(screen.queryByTestId("delete-dialog-delete")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toBe(false);
  });

  it("a book with copies on loan gets the blocking dialog", async () => {
    const user = userEvent.setup();
    await open(book({ activeLoans: 1 }), me("ADMIN"));
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-delete"));
    expect(await screen.findByTestId("delete-dialog-blocked")).toHaveTextContent("1 copy is on loan. Record its return first.");
  });

  it("shows 'doesn't exist or was deleted' on 404 with a way back", async () => {
    await renderApp(`/books/${BOOK_ID}`, ({ url }) =>
      url.pathname === `/api/books/${BOOK_ID}` ? { status: 404, body: { type: "about:blank", title: "nf", status: 404, code: "NOT_FOUND" } } : undefined);
    expect(await screen.findByTestId("book-not-found")).toHaveTextContent("This book doesn't exist or was deleted.");
    expect(screen.getByRole("link", { name: "Back to Books" })).toHaveAttribute("href", expect.stringContaining("/books"));
  });

  it("shows a retryable error on a server failure; Try again asks the API again", async () => {
    const user = userEvent.setup();
    let calls = 0;
    await renderApp(`/books/${BOOK_ID}`, ({ url }) => {
      if (url.pathname === `/api/books/${BOOK_ID}`) {
        calls++;
        return calls === 1
          ? { status: 500, body: { type: "about:blank", title: "x", status: 500, code: "INTERNAL" } }
          : { body: book() };
      }
      if (url.pathname === "/api/loans") return { body: page([]) };
      return undefined;
    });
    expect(await screen.findByTestId("book-error")).toHaveTextContent("Couldn't load this book.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("book-detail-title")).toHaveTextContent("Refactoring");
    expect(calls).toBe(2);
  });
});

describe("BookLoadState / BackToBooks", () => {
  it("shows the skeleton while loading", async () => {
    const query = { isPending: true } as unknown as Parameters<typeof BookLoadState>[0]["query"];
    await renderWithProviders(<BookLoadState query={query} />);
    expect(await screen.findByTestId("book-skeleton")).toHaveAttribute("aria-busy", "true");
  });

  it("renders a link back to the Books list", async () => {
    await renderWithProviders(<BackToBooks />);
    expect(await screen.findByRole("link", { name: /Books/ })).toHaveAttribute("href", expect.stringContaining("/books"));
  });
});
