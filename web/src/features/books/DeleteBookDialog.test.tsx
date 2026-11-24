// @vitest-environment jsdom
import type { BookDto } from "@slm/contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { DeleteBookDialog } from "./DeleteBookDialog";

const book = (patch: Partial<BookDto>): BookDto => ({
  id: "b1", title: "Clean Code", author: "R. Martin", isbn: null, description: "", category: "Software", publisher: "",
  publicationYear: null, coverImageUrl: null, totalCopies: 5, availableCopies: 5, activeLoans: 0, nextDueAt: null,
  hasLoanHistory: false, archived: false, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...patch,
});

afterEach(() => vi.unstubAllGlobals());

describe("DeleteBookDialog variants (ux.md §3.4)", () => {
  it("open loans → blocking dialog, no destructive action", async () => {
    await renderWithProviders(<DeleteBookDialog book={book({ activeLoans: 2, availableCopies: 3 })} onClose={() => undefined} />);
    expect(await screen.findByTestId("delete-dialog-blocked")).toHaveTextContent("2 copies are on loan. Record their returns first.");
    expect(screen.queryByTestId("dialog-confirm")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View active loans" })).toBeInTheDocument();
  });

  it("past loans only → archive wording, focus on the safe button", async () => {
    await renderWithProviders(<DeleteBookDialog book={book({ hasLoanHistory: true })} onClose={() => undefined} />);
    const dialog = await screen.findByTestId("delete-dialog-archive");
    expect(dialog).toHaveTextContent("archived");
    expect(screen.getByRole("button", { name: "Archive book" })).toBeInTheDocument();
    expect(screen.getByTestId("dialog-cancel")).toHaveFocus();
  });

  it("never borrowed → permanent delete wording", async () => {
    await renderWithProviders(<DeleteBookDialog book={book({})} onClose={() => undefined} />);
    const dialog = await screen.findByTestId("delete-dialog-delete");
    expect(dialog).toHaveTextContent("deleted permanently. This can't be undone.");
    expect(screen.getByRole("button", { name: "Delete book" })).toBeInTheDocument();
  });

  it("Esc cancels", async () => {
    const onClose = vi.fn();
    await renderWithProviders(<DeleteBookDialog book={book({})} onClose={onClose} />);
    await screen.findByTestId("delete-dialog-delete");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("confirming calls DELETE and reports the archived toast", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: "archived" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await renderWithProviders(<DeleteBookDialog book={book({ hasLoanHistory: true })} onClose={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: "Archive book" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Clean Code archived.");
    expect(fetchMock).toHaveBeenCalledWith("/api/books/b1", expect.objectContaining({ method: "DELETE" }));
  });
});
