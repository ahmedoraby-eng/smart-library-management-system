// @vitest-environment jsdom
import type { BookDto, Me, SimilarBook, SimilarBooksResponse } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { page, renderApp } from "../circulation/testApp";
import { SimilarBooks } from "./SimilarBooks";

afterEach(() => vi.unstubAllGlobals());

const HAWK = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const HMART = "1b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";

const me = (role: "ADMIN" | "LIBRARIAN" | "SUPERVISOR"): Me => ({
  id: "u1",
  email: "u@library.test",
  fullName: "Test User",
  role,
  permissions: [...ROLE_PERMISSIONS[role]],
  isDemo: false,
});
const detail = (id: string, title: string, patch: Partial<BookDto> = {}): BookDto => ({
  id,
  title,
  author: "Some Author",
  isbn: null,
  description: "About it.",
  category: "Memoir",
  publisher: "",
  publicationYear: 2014,
  coverImageUrl: null,
  totalCopies: 2,
  availableCopies: 2,
  activeLoans: 0,
  nextDueAt: null,
  hasLoanHistory: false,
  archived: false,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});
const similar = (id: string, title: string, patch: Partial<SimilarBook["book"]> = {}, similarity = 0.5) => ({
  book: {
    id,
    title,
    author: `${title} Author`,
    category: "Memoir",
    publicationYear: 2020,
    coverImageUrl: null,
    availableCopies: 1,
    totalCopies: 2,
    nextDueAt: null,
    ...patch,
  },
  similarity,
});
const HAWK_SIMILAR: SimilarBooksResponse = {
  items: [
    similar(HMART, "Crying in H Mart", {}, 0.49),
    similar("2b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e", "A Grief Observed", {
      availableCopies: 0,
      nextDueAt: "2026-12-24T10:00:00.000Z",
    }),
    similar("3b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e", "To Kill a Mockingbird"),
    similar("4b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e", "A History of the Arab Peoples"),
  ],
};

type Answer = { status?: number; body: unknown };
/** The book page at /books/:id, with /similar answered per book id. */
const open = (
  similarFor: (id: string) => Answer | undefined,
  who: Me = me("LIBRARIAN"),
  book: BookDto = detail(HAWK, "H Is for Hawk"),
) =>
  renderApp(
    `/books/${book.id}`,
    (r) => {
      const m = r.url.pathname.match(/^\/api\/books\/([^/]+)(\/similar)?$/);
      if (m && m[2]) return similarFor(m[1]!);
      if (m && m[1] === book.id) return { body: book };
      if (m && m[1] === HMART) return { body: detail(HMART, "Crying in H Mart") };
      if (r.url.pathname === "/api/loans") return { body: page([]) };
      return undefined;
    },
    who,
  );

describe("More like this (SLM-19)", () => {
  it("shows up to 4 cards with cover, title link, author and availability; a librarian gets Borrow on books on the shelf", async () => {
    const { fetchMock } = await open(() => ({ body: HAWK_SIMILAR }));
    const section = await screen.findByTestId("similar-books");
    expect(within(section).getByRole("heading", { name: "More like this" })).toBeInTheDocument();
    const cards = within(section).getAllByTestId("similar-book");
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => within(c).getByTestId("similar-book-link").textContent)).toEqual([
      "Crying in H Mart",
      "A Grief Observed",
      "To Kill a Mockingbird",
      "A History of the Arab Peoples",
    ]);
    expect(within(cards[0]!).getByTestId("similar-book-link")).toHaveAttribute("href", `/books/${HMART}`);
    expect(within(cards[0]!).getByText("Crying in H Mart Author")).toBeInTheDocument();
    expect(within(cards[0]!).getAllByTestId("book-cover")).toHaveLength(1);
    expect(within(cards[0]!).getByTestId("availability-badge")).toHaveTextContent("1 of 2 available");
    const borrow = within(cards[0]!).getByTestId("similar-borrow");
    expect(borrow.getAttribute("href")).toContain("/circulation/borrow");
    expect(borrow.getAttribute("href")).toContain(HMART);
    // None on the shelf: no Borrow, and the next due date instead.
    expect(within(cards[1]!).queryByTestId("similar-borrow")).not.toBeInTheDocument();
    expect(within(cards[1]!).getByTestId("availability-badge")).toHaveTextContent("0 of 2 available");
    expect(within(cards[1]!).getByTestId("next-due")).toHaveTextContent(/Next copy due back/);
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith(`/api/books/${HAWK}/similar`))).toBe(true);
  });

  it("a supervisor sees the books but no Borrow (no LOAN_PROCESS)", async () => {
    await open(() => ({ body: HAWK_SIMILAR }), me("SUPERVISOR"));
    expect(await screen.findAllByTestId("similar-book")).toHaveLength(4);
    expect(screen.queryByTestId("similar-borrow")).not.toBeInTheDocument();
  });

  it("is hidden when the book has no neighbours (not indexed yet)", async () => {
    const { fetchMock } = await open(() => ({ body: { items: [] } }));
    await screen.findByTestId("book-detail-title");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith(`/api/books/${HAWK}/similar`))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByTestId("similar-skeleton")).not.toBeInTheDocument());
    expect(screen.queryByTestId("similar-books")).not.toBeInTheDocument();
    expect(screen.queryByText("More like this")).not.toBeInTheDocument();
  });

  it("is hidden when the request fails: the book page itself is unaffected", async () => {
    await open(() => ({ status: 500, body: { type: "about:blank", title: "x", status: 500, code: "INTERNAL" } }));
    expect(await screen.findByTestId("book-detail-title")).toHaveTextContent("H Is for Hawk");
    await waitFor(() => expect(screen.queryByTestId("similar-skeleton")).not.toBeInTheDocument());
    expect(screen.queryByTestId("similar-books")).not.toBeInTheDocument();
    expect(screen.queryByTestId("book-error")).not.toBeInTheDocument();
  });

  it("an archived book doesn't ask for similar books", async () => {
    const { fetchMock } = await open(
      () => ({ body: HAWK_SIMILAR }),
      me("ADMIN"),
      detail(HAWK, "H Is for Hawk", { archived: true }),
    );
    expect(await screen.findByTestId("archived-tag")).toBeInTheDocument();
    expect(screen.queryByTestId("similar-skeleton")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/similar"))).toBe(false);
  });

  it("opening a suggested book shows that book and its own strip", async () => {
    const user = userEvent.setup();
    const { router } = await open((id) =>
      id === HAWK
        ? { body: HAWK_SIMILAR }
        : {
            body: { items: [similar(HAWK, "H Is for Hawk"), similar("5b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e", "Grief")] },
          },
    );
    const first = (await screen.findAllByTestId("similar-book-link"))[0]!;
    await user.click(first);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/books/${HMART}`));
    expect(await screen.findByTestId("book-detail-title")).toHaveTextContent("Crying in H Mart");
    await waitFor(() =>
      expect(screen.getAllByTestId("similar-book-link").map((l) => l.textContent)).toEqual(["H Is for Hawk", "Grief"]),
    );
  });

  it("shows a skeleton with the section title while loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    await renderWithProviders(<SimilarBooks bookId={HAWK} />);
    const skeleton = await screen.findByTestId("similar-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(within(skeleton).getByRole("heading", { name: "More like this" })).toBeInTheDocument();
    expect(screen.queryByTestId("similar-book")).not.toBeInTheDocument();
  });
});
