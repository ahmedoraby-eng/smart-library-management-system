// @vitest-environment jsdom
import type { BookDto } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DeleteBookDialog } from "./DeleteBookDialog";

afterEach(() => vi.unstubAllGlobals());

const book = (patch: Partial<BookDto> = {}): BookDto => ({
  id: "b1", title: "Clean Code", author: "R. Martin", isbn: null, description: "", category: "Software", publisher: "",
  publicationYear: null, coverImageUrl: null, totalCopies: 5, availableCopies: 5, activeLoans: 0, nextDueAt: null,
  hasLoanHistory: false, archived: false, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...patch,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const apiProblem = (status: number, code: string) => json({ type: "about:blank", title: code, status, code }, status);

/** DELETE answered by `onDelete`; the past-loan count query answered with `total`. */
function stub(onDelete: () => Response | Promise<Response>, total = 3) {
  const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return onDelete();
    return json({ items: [], total, page: 1, size: 1 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DeleteBookDialog outcomes", () => {
  it("deleting a never-borrowed book toasts 'deleted', calls onDone and goes to the list", async () => {
    stub(() => json({ result: "deleted" }));
    const onDone = vi.fn();
    const { router } = await renderWithProviders(<DeleteBookDialog book={book()} onClose={vi.fn()} onDone={onDone} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete book" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Clean Code deleted.");
    expect(onDone).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
  });

  it("works without an onDone callback", async () => {
    stub(() => json({ result: "deleted" }));
    const { router } = await renderWithProviders(<DeleteBookDialog book={book()} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByTestId("dialog-confirm"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
  });

  it("the past-loan count asks the loans API for this book, and 1 past loan is singular", async () => {
    const fetchMock = stub(() => json({ result: "archived" }), 1);
    await renderWithProviders(<DeleteBookDialog book={book({ hasLoanHistory: true })} onClose={vi.fn()} />);
    const dialog = await screen.findByTestId("delete-dialog-archive");
    await waitFor(() => expect(dialog).toHaveTextContent("It has 1 past loan,"));
    const url = new URL(String(fetchMock.mock.calls[0]![0]), "http://localhost");
    expect(url.pathname).toBe("/api/loans");
    expect(url.searchParams.get("bookId")).toBe("b1");
  });

  it("a never-borrowed book does not run the past-loan count", async () => {
    const fetchMock = stub(() => json({ result: "deleted" }));
    await renderWithProviders(<DeleteBookDialog book={book()} onClose={vi.fn()} />);
    await screen.findByTestId("delete-dialog-delete");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the confirm button shows loading and Cancel is disabled while the delete is in flight", async () => {
    let release!: () => void;
    stub(() => new Promise<Response>((res) => { release = () => res(json({ result: "deleted" })); }));
    await renderWithProviders(<DeleteBookDialog book={book()} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByTestId("dialog-confirm"));
    await waitFor(() => expect(screen.getByTestId("dialog-cancel")).toBeDisabled());
    release();
    await screen.findByTestId("toast");
  });
});

describe("DeleteBookDialog failures", () => {
  it("BOOK_HAS_ACTIVE_LOANS (someone borrowed it meanwhile): closes and explains", async () => {
    stub(() => apiProblem(409, "BOOK_HAS_ACTIVE_LOANS"));
    const onClose = vi.fn();
    await renderWithProviders(<DeleteBookDialog book={book()} onClose={onClose} />);
    await userEvent.click(await screen.findByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Can't remove Clean Code: copies are on loan. Record their returns first.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a server error closes and says nothing was changed", async () => {
    stub(() => apiProblem(500, "INTERNAL"));
    const onClose = vi.fn();
    await renderWithProviders(<DeleteBookDialog book={book()} onClose={onClose} />);
    await userEvent.click(await screen.findByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't remove the book. Nothing was changed. Try again.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a network failure (fetch rejects) is reported the same way", async () => {
    stub(() => Promise.reject(new TypeError("Failed to fetch")));
    const onClose = vi.fn();
    await renderWithProviders(<DeleteBookDialog book={book()} onClose={onClose} />);
    await userEvent.click(await screen.findByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't remove the book. Nothing was changed. Try again.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("other 4xx answers (e.g. 404, handled globally) close the dialog without a local toast", async () => {
    stub(() => apiProblem(404, "NOT_FOUND"));
    const onClose = vi.fn();
    await renderWithProviders(<DeleteBookDialog book={book()} onClose={onClose} />);
    await userEvent.click(await screen.findByTestId("dialog-confirm"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });
});

describe("DeleteBookDialog blocked by open loans", () => {
  it("uses the plural wording and Close dismisses it", async () => {
    const onClose = vi.fn();
    await renderWithProviders(<DeleteBookDialog book={book({ activeLoans: 3, availableCopies: 2 })} onClose={onClose} />);
    expect(await screen.findByTestId("delete-dialog-blocked")).toHaveTextContent("3 copies are on loan. Record their returns first.");
    await userEvent.click(screen.getByTestId("dialog-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("singular wording for one copy", async () => {
    await renderWithProviders(<DeleteBookDialog book={book({ activeLoans: 1 })} onClose={vi.fn()} />);
    expect(await screen.findByTestId("delete-dialog-blocked")).toHaveTextContent("1 copy is on loan. Record its return first.");
  });

  it("View active loans closes the dialog and opens Loan history filtered to this book", async () => {
    const onClose = vi.fn();
    const { router } = await renderWithProviders(<DeleteBookDialog book={book({ activeLoans: 2 })} onClose={onClose} />);
    await userEvent.click(await screen.findByTestId("dialog-view-loans"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.state.location.pathname).toBe("/loans"));
    expect(router.state.location.search).toMatchObject({ bookId: "b1", status: "ACTIVE" });
  });
});
