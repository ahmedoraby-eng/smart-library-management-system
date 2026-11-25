// @vitest-environment jsdom
import type { BookDto, Me } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, renderApp } from "../circulation/testApp";

afterEach(() => vi.unstubAllGlobals());

const ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const supervisor: Me = { id: "u2", email: "s@library.test", fullName: "Sam Supervisor", role: "SUPERVISOR", permissions: [...ROLE_PERMISSIONS.SUPERVISOR], isDemo: false };
const book = (patch: Partial<BookDto> = {}): BookDto => ({
  id: ID, title: "Refactoring", author: "Martin Fowler", isbn: null, description: "", category: "Software", publisher: "",
  publicationYear: 2018, coverImageUrl: null, totalCopies: 4, availableCopies: 3, activeLoans: 1, nextDueAt: null,
  hasLoanHistory: true, archived: false, version: 7, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...patch,
});
const problem = (status: number, code: string) => ({ status, body: { type: "about:blank", title: code, status, code } });
const sent = (fetchMock: { mock: { calls: unknown[][] } }, method: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => url === path && (init as RequestInit | undefined)?.method === method);

describe("Add book page", () => {
  it("creates a book, confirms with a toast and opens its detail page", async () => {
    const user = userEvent.setup();
    const { fetchMock, router } = await renderApp("/books/new", ({ method, url }) => {
      if (url.pathname === "/api/books/categories") return { body: { items: ["Fiction", "Software"] } };
      if (url.pathname === "/api/books" && method === "POST") return { status: 201, body: book({ id: "new-1", title: "Dune" }) };
      if (url.pathname === "/api/books/new-1") return { body: book({ id: "new-1", title: "Dune" }) };
      if (url.pathname === "/api/loans") return { body: page([]) };
      return undefined;
    });
    expect(await screen.findByRole("heading", { name: "Add book" })).toBeInTheDocument();
    await user.type(await screen.findByTestId("field-title"), "Dune");
    await user.type(screen.getByTestId("field-author"), "Frank Herbert");
    await user.type(screen.getByTestId("field-category"), "Fiction");
    await user.click(screen.getByTestId("save-book"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books/new-1"));
    const posts = sent(fetchMock, "POST", "/api/books");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String((posts[0]![1] as RequestInit).body))).toMatchObject({ title: "Dune", author: "Frank Herbert", category: "Fiction", totalCopies: 1 });
    expect(await screen.findByText("Book added.")).toBeInTheDocument();
  });

  it("Cancel on a clean form goes back to the Books list without a prompt", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/books/new", () => undefined);
    await user.click(await screen.findByTestId("cancel-book"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
    expect(screen.queryByTestId("discard-dialog")).not.toBeInTheDocument();
  });

  it("asks before discarding edits; Keep editing stays, Discard leaves", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/books/new", () => undefined);
    await user.type(await screen.findByTestId("field-title"), "Half-typed");
    await user.click(screen.getByTestId("cancel-book"));
    const dialog = await screen.findByTestId("discard-dialog");
    expect(dialog).toHaveTextContent("Your edits to this book will be lost.");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByTestId("discard-dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/books/new");
    expect(screen.getByTestId("field-title")).toHaveValue("Half-typed");

    await user.click(screen.getByTestId("cancel-book"));
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
  });

  it("a supervisor (no BOOK_WRITE) lands on the 403 page and no form is shown", async () => {
    const { router } = await renderApp("/books/new", () => undefined, supervisor);
    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/403");
    expect(screen.queryByTestId("book-form")).not.toBeInTheDocument();
  });
});

describe("Edit book page", () => {
  const editHandler = (b: BookDto, extra?: Parameters<typeof renderApp>[1]): Parameters<typeof renderApp>[1] => (r) => {
    if (r.url.pathname === "/api/books/categories") return { body: { items: ["Software"] } };
    if (r.url.pathname === `/api/books/${ID}` && r.method === "GET") return { body: b };
    if (r.url.pathname === "/api/loans") return { body: page([]) };
    return extra?.(r);
  };

  it("loads the book into the form and saves with the loaded version", async () => {
    const user = userEvent.setup();
    const { fetchMock, router } = await renderApp(`/books/${ID}/edit`, editHandler(book(), ({ method, url }) =>
      url.pathname === `/api/books/${ID}` && method === "PUT" ? { body: book({ title: "Refactoring 2e", version: 8 }) } : undefined));
    expect(await screen.findByRole("heading", { name: "Edit book" })).toBeInTheDocument();
    expect(await screen.findByTestId("field-title")).toHaveValue("Refactoring");
    await user.clear(screen.getByTestId("field-title"));
    await user.type(screen.getByTestId("field-title"), "Refactoring 2e");
    await user.click(screen.getByTestId("save-book"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/books/${ID}`));
    const puts = sent(fetchMock, "PUT", `/api/books/${ID}`);
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String((puts[0]![1] as RequestInit).body))).toMatchObject({ title: "Refactoring 2e", version: 7 });
    expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
  });

  it("Cancel goes back to the book's detail page", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp(`/books/${ID}/edit`, editHandler(book()));
    await user.click(await screen.findByTestId("cancel-book"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/books/${ID}`));
  });

  it("an archived book can't be edited: the user is sent to its detail page", async () => {
    const { router } = await renderApp(`/books/${ID}/edit`, editHandler(book({ archived: true })));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/books/${ID}`));
    expect(screen.queryByTestId("book-form")).not.toBeInTheDocument();
    expect(await screen.findByTestId("archived-tag")).toBeInTheDocument();
  });

  it("a stale save shows the conflict notice; Reload fetches the latest version and remounts the form", async () => {
    const user = userEvent.setup();
    let latest = book();
    const { fetchMock } = await renderApp(`/books/${ID}/edit`, ({ method, url }) => {
      if (url.pathname === "/api/books/categories") return { body: { items: [] } };
      if (url.pathname === `/api/books/${ID}` && method === "PUT") return problem(409, "STALE_VERSION");
      if (url.pathname === `/api/books/${ID}`) return { body: latest };
      return undefined;
    });
    await user.type(await screen.findByTestId("field-publisher"), "Pearson");
    await user.click(screen.getByTestId("save-book"));
    await screen.findByTestId("stale-notice");
    latest = book({ title: "Refactoring (their edit)", version: 8 });
    await user.click(screen.getByTestId("reload-book"));
    await waitFor(() => expect(screen.getByTestId("field-title")).toHaveValue("Refactoring (their edit)"));
    expect(screen.getByTestId("field-publisher")).toHaveValue("");
    expect(screen.queryByTestId("stale-notice")).not.toBeInTheDocument();
    expect(sent(fetchMock, "GET", `/api/books/${ID}`).length).toBeGreaterThanOrEqual(2); // initial load + the explicit Reload
  });

  it("shows the not-found state for an unknown book", async () => {
    await renderApp(`/books/${ID}/edit`, ({ url }) => (url.pathname === `/api/books/${ID}` ? problem(404, "NOT_FOUND") : undefined));
    expect(await screen.findByTestId("book-not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("book-form")).not.toBeInTheDocument();
  });

  it("a supervisor is sent to 403", async () => {
    const { router } = await renderApp(`/books/${ID}/edit`, editHandler(book()), supervisor);
    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/403");
  });
});
