// @vitest-environment jsdom
import type { BookDto, LoanDto, MemberDto } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, renderApp } from "./testApp";

afterEach(() => vi.unstubAllGlobals());

const BOOK_ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const MEMBER_ID = "1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1f";

const book = (patch: Partial<BookDto> = {}): BookDto => ({
  id: BOOK_ID, title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", isbn: "9781449373320", description: "",
  category: "Data", publisher: "", publicationYear: 2017, coverImageUrl: null, totalCopies: 4, availableCopies: 1, activeLoans: 3,
  nextDueAt: null, hasLoanHistory: true, archived: false, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});
const member = (patch: Partial<MemberDto> = {}): MemberDto => ({
  id: MEMBER_ID, memberNumber: "M-000142", fullName: "Sara Haddad", email: "sara.haddad@example.com", phone: null, status: "ACTIVE",
  registeredAt: "2026-01-01T00:00:00.000Z", activeLoans: 1, overdueLoans: 0, version: 0, ...patch,
});
const loan = (patch: Partial<LoanDto> = {}): LoanDto => ({
  id: "2d8b9e0f-3f4c-4d5e-9f6a-7b8c9d0e1f2a", status: "ACTIVE",
  book: { id: BOOK_ID, title: "Clean Code", author: "Robert C. Martin" },
  member: { id: MEMBER_ID, memberNumber: "M-000142", fullName: "Sara Haddad" },
  processedBy: { id: "s1", name: "Layla Librarian" }, returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z", dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), returnedAt: null, ...patch,
});
const problem = (status: number, code: string, detail: string, context?: Record<string, unknown>) => ({
  status, body: { type: "about:blank", title: code, status, code, detail, ...(context ? { context } : {}) },
});

describe("SLM-4 Borrow page (ux.md §4.1)", () => {
  it("SLM-4 AC1 prefilled member + book → live summary, Confirm posts once, success banner with the new count", async () => {
    let posted: unknown;
    const user = userEvent.setup();
    await renderApp(`/circulation/borrow?member=${MEMBER_ID}&book=${BOOK_ID}`, ({ method, url, body }) => {
      if (url.pathname === `/api/members/${MEMBER_ID}`) return { body: member() };
      if (url.pathname === `/api/books/${BOOK_ID}`) return { body: posted ? book({ availableCopies: 0 }) : book() };
      if (url.pathname === "/api/loans" && method === "GET") return { body: page([]) };
      if (url.pathname === "/api/loans/borrow" && method === "POST") {
        posted = body;
        return { status: 201, body: loan({ book: { id: BOOK_ID, title: "Designing Data-Intensive Applications", author: "Martin Kleppmann" }, dueAt: "2026-12-08T10:00:00.000Z" }) };
      }
      return undefined;
    });
    const summary = await screen.findByTestId("borrow-summary");
    await waitFor(() => expect(within(summary).getByText("Sara Haddad")).toBeInTheDocument());
    expect(within(summary).getByText("Designing Data-Intensive Applications")).toBeInTheDocument();
    expect(within(summary).getByText("Layla Librarian")).toBeInTheDocument();
    expect(screen.getByTestId("copies-change")).toHaveTextContent("1 → 0 of 4");
    expect(screen.getByTestId("copies-change")).toHaveTextContent("This is the last copy on the shelf.");

    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("borrow-success")).toHaveTextContent(
      "Borrowed. Designing Data-Intensive Applications → Sara Haddad, due 8 Dec 2026. 0 of 4 copies now available.",
    );
    // Untouched due date → the server default (LOAN_DAYS); no dueAt sent.
    expect(posted).toEqual({ bookId: BOOK_ID, memberId: MEMBER_ID });
    expect(screen.getByTestId("borrow-another")).toHaveTextContent("Borrow another for Sara");
  });

  it("SLM-4 AC2 due date defaults to today + 14 days; a date beyond 60 days shows the message and blocks Confirm", async () => {
    const user = userEvent.setup();
    await renderApp(`/circulation/borrow?member=${MEMBER_ID}&book=${BOOK_ID}`, ({ url }) => {
      if (url.pathname === `/api/members/${MEMBER_ID}`) return { body: member() };
      if (url.pathname === `/api/books/${BOOK_ID}`) return { body: book() };
      if (url.pathname === "/api/loans") return { body: page([]) };
      return undefined;
    });
    expect(await screen.findByTestId("due-chip-14")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("confirm-borrow")).toBeEnabled());
    const input = screen.getByTestId("due-date");
    await user.clear(input);
    await user.type(input, "2099-01-01");
    expect(screen.getByTestId("due-error")).toHaveTextContent(/^Choose a due date between tomorrow and \d{1,2} \w{3} \d{4}\.$/);
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
  });

  it("SLM-4 AC3 race: 409 BOOK_UNAVAILABLE → notice under Book, book field reset", async () => {
    const user = userEvent.setup();
    await renderApp(`/circulation/borrow?member=${MEMBER_ID}&book=${BOOK_ID}`, ({ method, url }) => {
      if (url.pathname === `/api/members/${MEMBER_ID}`) return { body: member() };
      if (url.pathname === `/api/books/${BOOK_ID}`) return { body: book() };
      if (url.pathname === "/api/loans" && method === "GET") return { body: page([]) };
      if (url.pathname === "/api/loans/borrow") return problem(409, "BOOK_UNAVAILABLE", "No copies left.");
      return undefined;
    });
    await waitFor(() => expect(screen.getByTestId("confirm-borrow")).toBeEnabled());
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("book-notice")).toHaveTextContent(
      "The last copy of Designing Data-Intensive Applications was just borrowed. Choose another book.",
    );
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
    expect(screen.getByTestId("book-combobox-input")).toHaveFocus();
  });

  it("SLM-4 AC4 member search lists inactive and at-limit members as not selectable, with the reason", async () => {
    const user = userEvent.setup();
    await renderApp("/circulation/borrow", ({ url }) => {
      if (url.pathname === "/api/members") {
        return { body: page([
          member({ id: "a", fullName: "Omar Nasser", status: "INACTIVE" }),
          member({ id: "b", fullName: "Nadia Karim", activeLoans: 5 }),
          member({ id: "c", fullName: "Sara Haddad" }),
        ]) };
      }
      if (url.pathname === "/api/loans") return { body: page([]) };
      return undefined;
    });
    const input = await screen.findByTestId("member-combobox-input");
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "a");
    const options = await screen.findAllByTestId("member-combobox-option");
    expect(options[0]).toHaveAttribute("aria-disabled", "true");
    expect(options[0]).toHaveTextContent("Inactive — reactivate on the member page");
    expect(options[1]).toHaveAttribute("aria-disabled", "true");
    expect(options[1]).toHaveTextContent("5 of 5 books on loan — return one first");
    expect(options[2]).not.toHaveAttribute("aria-disabled");
    // Keyboard: ↓↓ to the selectable one, Enter picks it and focus moves to Book.
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(await screen.findByTestId("picked-member")).toHaveTextContent("Sara Haddad");
    await waitFor(() => expect(screen.getByTestId("book-combobox-input")).toHaveFocus());
  });

  it("SLM-4 AC4 a book the member already holds is not selectable (ALREADY_BORROWED)", async () => {
    const user = userEvent.setup();
    await renderApp(`/circulation/borrow?member=${MEMBER_ID}`, ({ url }) => {
      if (url.pathname === `/api/members/${MEMBER_ID}`) return { body: member() };
      if (url.pathname === "/api/loans") return { body: page([loan({ book: { id: BOOK_ID, title: "Designing Data-Intensive Applications", author: "M" }, dueAt: "2026-12-03T10:00:00.000Z" })]) };
      if (url.pathname === "/api/books") return { body: page([book({ availableCopies: 3 }), book({ id: "other", title: "System Design Interview", availableCopies: 0, nextDueAt: "2026-11-28T10:00:00.000Z" })]) };
      return undefined;
    });
    await screen.findByTestId("picked-member");
    await user.type(screen.getByTestId("book-combobox-input"), "design");
    const options = await screen.findAllByTestId("book-combobox-option");
    expect(options[0]).toHaveAttribute("aria-disabled", "true");
    expect(options[0]).toHaveTextContent("Sara already has this book (due 3 Dec)");
    expect(options[1]).toHaveTextContent("No copies available · next due 28 Nov");
  });
});

describe("SLM-4 Return page (ux.md §4.2)", () => {
  it("SLM-4 AC9 active loans listed before any search; Return → confirm → POST; toast with the new count", async () => {
    const user = userEvent.setup();
    const overdue = loan({ id: "3e9c0f1a-4a5d-4e6f-8a7b-8c9d0e1f2a3b", status: "OVERDUE", dueAt: new Date(Date.now() - 3 * 86_400_000 - 1000).toISOString() });
    let returned = false;
    const { fetchMock } = await renderApp("/circulation/return", ({ method, url }) => {
      if (url.pathname === "/api/loans" && method === "GET") return { body: page(returned ? [] : [overdue]) };
      if (url.pathname === `/api/loans/${overdue.id}/return`) {
        returned = true;
        return { body: { ...overdue, status: "RETURNED", returnedAt: new Date().toISOString() } };
      }
      if (url.pathname === `/api/books/${BOOK_ID}`) return { body: book({ title: "Clean Code", availableCopies: 3, totalCopies: 5 }) };
      return undefined;
    });
    const row = await screen.findByTestId("loan-row");
    expect(within(row).getByTestId("loan-status")).toHaveTextContent("Overdue · 3 days");
    expect(screen.getByTestId("active-count")).toHaveTextContent("1 active");
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/api/loans?status=ACTIVE"))).toBe(true);

    await user.click(within(row).getByTestId("return-button"));
    const dialog = await screen.findByTestId("return-dialog");
    expect(dialog).toHaveTextContent("Return Clean Code from Sara Haddad?");
    expect(dialog).toHaveTextContent("(3 days overdue)");
    expect(within(dialog).getByTestId("dialog-confirm")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Returned: Clean Code. 3 of 5 copies now available.");
    expect(await screen.findByTestId("return-empty")).toHaveTextContent("No books are out on loan right now.");
  });

  it("SLM-4 AC6 409 LOAN_ALREADY_RETURNED → error toast naming when and who", async () => {
    const user = userEvent.setup();
    const l = loan();
    await renderApp("/circulation/return", ({ method, url }) => {
      if (url.pathname === "/api/loans" && method === "GET") return { body: page([l]) };
      if (url.pathname === `/api/loans/${l.id}/return`) {
        return problem(409, "LOAN_ALREADY_RETURNED", "Already.", { returnedAt: "2026-11-24T10:42:00.000Z", returnedBy: "Omar Nasser" });
      }
      return undefined;
    });
    await user.click(await screen.findByTestId("return-button"));
    await user.click(await screen.findByTestId("dialog-confirm"));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveAttribute("data-kind", "error");
    expect(toast).toHaveTextContent(/^This loan was already returned on 24 Nov 2026 at \d{2}:\d{2} by Omar Nasser\./);
  });
});

describe("SLM-4 role rule (U10): Circulation is hidden for Supervisor", () => {
  it("Supervisor deep link to /circulation/borrow → /403; no Circulation in the sidebar", async () => {
    const supervisor = { id: "s3", email: "sam@library.test", fullName: "Samir Supervisor", role: "SUPERVISOR" as const, permissions: [...ROLE_PERMISSIONS.SUPERVISOR], isDemo: false };
    const { router } = await renderApp("/circulation/borrow", () => undefined, supervisor);
    expect(await screen.findByTestId("forbidden")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/403");
    expect(screen.queryByTestId("nav-circulation")).not.toBeInTheDocument();
  });
});
