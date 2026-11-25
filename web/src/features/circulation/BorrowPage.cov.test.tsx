// @vitest-environment jsdom
import type { BookDto, LoanDto, MemberDto } from "@slm/contracts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toDayInput } from "./loanFormat";
import { page, renderApp } from "./testApp";

afterEach(() => vi.unstubAllGlobals());

const BOOK_ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const MEMBER_ID = "1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1f";
const DAY = 86_400_000;

const book = (patch: Partial<BookDto> = {}): BookDto => ({
  id: BOOK_ID, title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", description: "",
  category: "Software", publisher: "", publicationYear: 2008, coverImageUrl: null, totalCopies: 4, availableCopies: 3, activeLoans: 1,
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
  borrowedAt: "2026-11-01T10:00:00.000Z", dueAt: new Date(Date.now() + 5 * DAY).toISOString(), returnedAt: null, ...patch,
});
const problem = (status: number, code: string, detail?: string, errors?: { field: string; message: string }[]) => ({
  status, body: { type: "about:blank", title: code, status, code, ...(detail ? { detail } : {}), ...(errors ? { errors } : {}) },
});

interface Setup {
  member?: MemberDto;
  book?: BookDto;
  /** the member's open loans */
  held?: LoanDto[];
  borrow?: (body: unknown) => { status?: number; body: unknown } | undefined;
  /** members / books returned by the search endpoints */
  members?: MemberDto[];
  books?: BookDto[];
  bookAfterBorrow?: BookDto | "fail";
}

/** Routes the borrow screen's API calls; `posts` records every POST /loans/borrow body. */
function api(opts: Setup = {}) {
  const posts: unknown[] = [];
  const handler = ({ method, url, body }: { method: string; url: URL; body: unknown }) => {
    const p = url.pathname;
    if (p === `/api/members/${MEMBER_ID}` && opts.member) return { body: opts.member };
    if (p === `/api/books/${BOOK_ID}` && opts.book) {
      if (posts.length > 0 && opts.bookAfterBorrow) return opts.bookAfterBorrow === "fail" ? problem(500, "INTERNAL") : { body: opts.bookAfterBorrow };
      return { body: opts.book };
    }
    if (p === "/api/members") return { body: page(opts.members ?? []) };
    if (p === "/api/books") return { body: page(opts.books ?? []) };
    if (p === "/api/loans" && method === "GET") return { body: page(opts.held ?? []) };
    if (p === "/api/loans/borrow" && method === "POST") {
      posts.push(body);
      return opts.borrow?.(body) ?? { status: 201, body: loan() };
    }
    return undefined;
  };
  return { handler, posts };
}

const prefilled = `/circulation/borrow?member=${MEMBER_ID}&book=${BOOK_ID}`;
const confirmReady = () => waitFor(() => expect(screen.getByTestId("confirm-borrow")).toBeEnabled());

describe("BorrowPage prefill, search and picking", () => {
  it("member search with no match shows the empty text and Confirm stays disabled", async () => {
    const user = userEvent.setup();
    const a = api({ members: [], books: [book()] });
    await renderApp("/circulation/borrow", a.handler);
    const memberInput = await screen.findByTestId("member-combobox-input");
    await waitFor(() => expect(memberInput).toHaveFocus());
    await user.type(memberInput, "zzz");
    expect(await screen.findByText("No members match. Check the spelling or the member number.")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
  });

  it("clicking a member option picks it, shows the picked row; Change returns to the search; same for a book", async () => {
    const user = userEvent.setup();
    const a = api({ members: [member()], books: [book({ availableCopies: 3 })] });
    await renderApp("/circulation/borrow", a.handler);
    const memberInput = await screen.findByTestId("member-combobox-input");
    await user.type(memberInput, "sara");
    const option = await screen.findByTestId("member-combobox-option");
    expect(option).toHaveTextContent("M-000142 · sara.haddad@example.com · 1 book on loan");
    fireEvent.mouseDown(option);
    const picked = await screen.findByTestId("picked-member");
    expect(picked).toHaveTextContent("Sara Haddad");
    expect(picked).toHaveTextContent("SH");
    expect(picked).toHaveTextContent("M-000142 · sara.haddad@example.com · 1 book on loan");
    await waitFor(() => expect(screen.getByTestId("book-combobox-input")).toHaveFocus());
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();

    await user.type(screen.getByTestId("book-combobox-input"), "clean");
    const bookOption = await screen.findByTestId("book-combobox-option");
    expect(bookOption).toHaveTextContent("Robert C. Martin");
    fireEvent.mouseDown(bookOption);
    const pickedBook = await screen.findByTestId("picked-book");
    expect(pickedBook).toHaveTextContent("Clean Code");
    expect(pickedBook).toHaveTextContent("Robert C. Martin · ISBN 9780132350884");
    // both chosen: focus goes to Confirm
    await waitFor(() => expect(screen.getByTestId("confirm-borrow")).toHaveFocus());
    expect(screen.getByTestId("confirm-borrow")).toBeEnabled();

    // Change on the book → the book search comes back, focused
    await user.click(screen.getByTestId("picked-book-change"));
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("book-combobox-input")).toHaveFocus());
    // Change on the member → the member search comes back, focused
    await user.click(screen.getByTestId("picked-member-change"));
    expect(screen.queryByTestId("picked-member")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("member-combobox-input")).toHaveFocus());
  });

  it("book search with no match shows the empty text", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), books: [] });
    await renderApp(`/circulation/borrow?member=${MEMBER_ID}`, a.handler);
    await screen.findByTestId("picked-member");
    const input = screen.getByTestId("book-combobox-input");
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "zzz");
    expect(await screen.findByText("No books match. Check the spelling or try the ISBN.")).toBeInTheDocument();
  });

  it("an inactive member from ?member= shows the reason under Member and blocks Confirm", async () => {
    const a = api({ member: member({ status: "INACTIVE" }), book: book() });
    await renderApp(prefilled, a.handler);
    const notice = await screen.findByTestId("member-notice");
    expect(notice).toHaveTextContent("Inactive — reactivate on the member page");
    expect(screen.getByTestId("picked-member")).toHaveTextContent("Inactive");
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
  });

  it("a member at the loan limit (live count from their open loans) blocks Confirm with the reason", async () => {
    const held = Array.from({ length: 5 }, (_, i) => loan({ id: `loan-${i}`, book: { id: `other-${i}`, title: `Other ${i}`, author: "A" } }));
    const a = api({ member: member({ activeLoans: 1 }), book: book(), held });
    await renderApp(prefilled, a.handler);
    expect(await screen.findByTestId("member-notice")).toHaveTextContent("5 of 5 books on loan — return one first");
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
    // the summary lists at most the first three open loans, with the live total
    const current = screen.getByTestId("member-current-loans");
    expect(current).toHaveTextContent("Sara's current loans (5 of 5)");
    expect(within(current).getAllByRole("listitem")).toHaveLength(3);
  });

  it("an archived book from ?book= is not picked: the Book search stays empty", async () => {
    const a = api({ member: member(), book: book({ archived: true }) });
    await renderApp(prefilled, a.handler);
    await screen.findByTestId("picked-member");
    expect(await screen.findByTestId("book-combobox-input")).toBeInTheDocument();
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
  });

  it("a prefilled book the member already holds blocks Confirm and names the due day", async () => {
    const a = api({ member: member(), book: book(), held: [loan({ dueAt: "2026-12-03T10:00:00.000Z" })] });
    await renderApp(prefilled, a.handler);
    expect(await screen.findByTestId("book-notice")).toHaveTextContent("Sara already has this book (due 3 Dec)");
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
  });

  it("a prefilled book with no copies left says so, with and without a next due date", async () => {
    const a = api({ member: member(), book: book({ availableCopies: 0, nextDueAt: "2026-11-28T10:00:00.000Z" }) });
    await renderApp(prefilled, a.handler);
    expect(await screen.findByTestId("book-notice")).toHaveTextContent("No copies available · next due 28 Nov");
    expect(screen.getByTestId("copies-change")).toHaveTextContent("0 → 0 of 4");
  });

  it("no copies and no next due date: just 'No copies available'", async () => {
    const a = api({ member: member(), book: book({ availableCopies: 0, nextDueAt: null }) });
    await renderApp(prefilled, a.handler);
    expect(await screen.findByTestId("book-notice")).toHaveTextContent(/^No copies available$/);
  });

  it("opening with only a book keeps focus on Member; opening with only a member focuses Book", async () => {
    const a = api({ book: book() });
    await renderApp(`/circulation/borrow?book=${BOOK_ID}`, a.handler);
    const input = await screen.findByTestId("member-combobox-input");
    await waitFor(() => expect(input).toHaveFocus());
    await waitFor(() => expect(screen.getByTestId("picked-book")).toBeInTheDocument());
    expect(screen.getByTestId("copies-change")).toHaveTextContent("3 → 2 of 4");
    expect(screen.queryByText("This is the last copy on the shelf. The book will show as Unavailable.")).not.toBeInTheDocument();
  });

  it("the member's current loans card is absent when they hold nothing", async () => {
    const a = api({ member: member({ activeLoans: 0 }), book: book(), held: [] });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    expect(screen.queryByTestId("member-current-loans")).not.toBeInTheDocument();
    expect(screen.getByTestId("picked-member")).toHaveTextContent("0 books on loan");
  });

  it("the Clear button resets member, book and due date and refocuses Member", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("due-chip-21"));
    expect(screen.getByTestId("due-chip-21")).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByTestId("clear-borrow"));
    expect(screen.queryByTestId("picked-member")).not.toBeInTheDocument();
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
    expect(screen.getByTestId("due-chip-14")).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByTestId("member-combobox-input")).toHaveFocus());
    // nothing chosen → the summary shows dashes for the empty rows
    const summary = screen.getByTestId("borrow-summary");
    expect(within(summary).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});

describe("BorrowPage due date", () => {
  it("the 7 and 21 day chips set the due date and are sent as dueAt; the 14 day chip is the server default (no dueAt)", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();

    await user.click(screen.getByTestId("due-chip-7"));
    expect(screen.getByTestId("due-chip-7")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("due-chip-14")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("borrow-summary")).toHaveTextContent("(7 days)");
    await user.click(screen.getByTestId("confirm-borrow"));
    await screen.findByTestId("borrow-success");
    const sent = a.posts[0] as { bookId: string; memberId: string; dueAt?: string };
    expect(sent.bookId).toBe(BOOK_ID);
    expect(sent.memberId).toBe(MEMBER_ID);
    const days = Math.round((new Date(sent.dueAt!).getTime() - Date.now()) / DAY);
    expect(days).toBe(7);

    await user.click(screen.getByTestId("borrow-another"));
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
  });

  it("choosing 21 days then back to 14 sends no dueAt", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("due-chip-21"));
    expect(screen.getByTestId("borrow-summary")).toHaveTextContent("(21 days)");
    await user.click(screen.getByTestId("due-chip-14"));
    await user.click(screen.getByTestId("confirm-borrow"));
    await screen.findByTestId("borrow-success");
    expect(a.posts[0]).toEqual({ bookId: BOOK_ID, memberId: MEMBER_ID });
  });

  it("a typed date of tomorrow shows '(1 day)' in the summary; a custom date is sent as dueAt", async () => {
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    const tomorrow = toDayInput(new Date(Date.now() + DAY));
    fireEvent.change(screen.getByTestId("due-date"), { target: { value: tomorrow } });
    expect(screen.getByTestId("borrow-summary")).toHaveTextContent("(1 day)");
    expect(screen.queryByTestId("due-error")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-borrow"));
    await screen.findByTestId("borrow-success");
    const sent = a.posts[0] as { dueAt?: string };
    expect(Math.round((new Date(sent.dueAt!).getTime() - Date.now()) / DAY)).toBe(1);
  });

  it("today and past dates are refused with the message; an empty date reads 'Choose a date' and shows no due row", async () => {
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    const input = screen.getByTestId("due-date");
    fireEvent.change(input, { target: { value: toDayInput(new Date()) } });
    expect(screen.getByTestId("due-error")).toHaveTextContent(/^Choose a due date between tomorrow and/);
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("due-date-display")).toHaveAttribute("aria-label", "Due date: Choose a date. Change");
    expect(screen.getByTestId("due-error")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
  });

  it("the due date button opens the native picker when the browser has one", async () => {
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    const showPicker = vi.fn();
    (screen.getByTestId("due-date") as HTMLInputElement & { showPicker?: () => void }).showPicker = showPicker;
    fireEvent.click(screen.getByTestId("due-date-display"));
    expect(showPicker).toHaveBeenCalledTimes(1);
  });
});

describe("BorrowPage submitting", () => {
  it("success: banner with the live copy count, View loan link, Borrow another and New borrowing", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book({ totalCopies: 1, availableCopies: 1 }), bookAfterBorrow: book({ totalCopies: 1, availableCopies: 0 }) });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    expect(screen.getByTestId("copies-change")).toHaveTextContent("This is the last copy on the shelf.");
    await user.click(screen.getByTestId("confirm-borrow"));
    const banner = await screen.findByTestId("borrow-success");
    expect(banner).toHaveTextContent("0 of 1 copy now available.");
    expect(screen.getByTestId("view-loan")).toHaveAttribute("href", expect.stringContaining(`memberId=${MEMBER_ID}`));
    // the member stays; the book is cleared and stays cleared after the books are re-read (the ?book= prefill runs once)
    expect(screen.getByTestId("picked-member")).toBeInTheDocument();
    // the banner's "0 of 1" comes from the re-read book, so the refetch has landed; give React a moment to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("borrow-another"));
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
    expect(screen.queryByTestId("borrow-success")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("book-combobox-input")).toHaveFocus());
  });

  it("success when the refreshed book can't be read: the count falls back to the picked copy minus one", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book({ totalCopies: 4, availableCopies: 3 }), bookAfterBorrow: "fail" });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("borrow-success")).toHaveTextContent("2 of 4 copies now available.");
  });

  it("New borrowing clears the whole form after a success", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    await screen.findByTestId("borrow-success");
    await user.click(screen.getByTestId("new-borrowing"));
    expect(screen.queryByTestId("borrow-success")).not.toBeInTheDocument();
    expect(screen.queryByTestId("picked-member")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("member-combobox-input")).toHaveFocus());
  });

  it("Ctrl+Enter before the form is valid posts nothing", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp("/circulation/borrow", a.handler);
    await screen.findByTestId("member-combobox-input");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(a.posts).toHaveLength(0);
  });

  it("Ctrl+Enter confirms from anywhere once the form is valid", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(a.posts).toHaveLength(1));
    expect(await screen.findByTestId("borrow-success")).toBeInTheDocument();
  });

  it("Meta+Enter works too and a plain Enter does not post", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(a.posts).toHaveLength(0);
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(a.posts).toHaveLength(1));
  });

  it("409 ALREADY_BORROWED: the server's message goes under Book, the book is cleared and the member's loans are refetched", async () => {
    const user = userEvent.setup();
    const a = api({
      member: member(), book: book(),
      borrow: () => problem(409, "ALREADY_BORROWED", "Sara Haddad already has Clean Code."),
    });
    const { fetchMock } = await renderApp(prefilled, a.handler);
    await confirmReady();
    const loanGets = () => fetchMock.mock.calls.filter(([u, init]) => String(u).startsWith("/api/loans?") && (init?.method ?? "GET") === "GET").length;
    const before = loanGets();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("book-notice")).toHaveTextContent("Sara Haddad already has Clean Code.");
    expect(screen.queryByTestId("picked-book")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("book-combobox-input")).toHaveFocus());
    await waitFor(() => expect(loanGets()).toBeGreaterThan(before));
  });

  it.each(["MEMBER_INACTIVE", "LOAN_LIMIT_REACHED"])("409 %s: the message goes under Member and the member is cleared", async (code) => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book(), borrow: () => problem(409, code, "This member can't borrow right now.") });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("member-notice")).toHaveTextContent("This member can't borrow right now.");
    expect(screen.queryByTestId("picked-member")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("member-combobox-input")).toHaveFocus());
  });

  it("404 NOT_FOUND: 'no longer exists' error banner; the choices stay", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book(), borrow: () => problem(404, "NOT_FOUND", "gone") });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("borrow-error")).toHaveTextContent("This member or book no longer exists. Choose again.");
    expect(screen.getByTestId("picked-member")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("400 VALIDATION_FAILED on dueAt shows the server message under Due date; editing the date clears it", async () => {
    const user = userEvent.setup();
    const a = api({
      member: member(), book: book(),
      borrow: () => problem(400, "VALIDATION_FAILED", "Invalid", [{ field: "dueAt", message: "The due date can't be more than 60 days away." }]),
    });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("due-error")).toHaveTextContent("The due date can't be more than 60 days away.");
    expect(screen.getByTestId("confirm-borrow")).toBeDisabled();
    await user.click(screen.getByTestId("due-chip-7"));
    expect(screen.queryByTestId("due-error")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("confirm-borrow")).toBeEnabled());
  });

  it("400 VALIDATION_FAILED on another field shows the message in the form banner", async () => {
    const user = userEvent.setup();
    const a = api({
      member: member(), book: book(),
      borrow: () => problem(400, "VALIDATION_FAILED", "Check the request.", [{ field: "bookId", message: "Bad book." }]),
    });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("borrow-error")).toHaveTextContent("Check the request.");
  });

  it("an unknown 4xx code shows the server message in the banner; a 403 shows no banner (handled app-wide)", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book(), borrow: () => problem(422, "SOMETHING_ELSE", "Not allowed today.") });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("borrow-error")).toHaveTextContent("Not allowed today.");
  });

  it("403: no banner under the form", async () => {
    const user = userEvent.setup();
    const a = api({ member: member(), book: book(), borrow: () => problem(403, "FORBIDDEN", "No.") });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    await waitFor(() => expect(a.posts).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("confirm-borrow")).not.toHaveAttribute("aria-busy", "true"));
    expect(screen.queryByTestId("borrow-error")).not.toBeInTheDocument();
  });

  it("a server error shows the retry banner; Try again posts the borrowing again and succeeds", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const a = api({
      member: member(), book: book(),
      borrow: () => (++attempts === 1 ? problem(503, "UNAVAILABLE", "down") : { status: 201, body: loan() }),
    });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    const error = await screen.findByTestId("borrow-error");
    expect(error).toHaveTextContent("Couldn't record the borrowing. Nothing was saved. Try again.");
    await user.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("borrow-success")).toBeInTheDocument();
    expect(a.posts).toHaveLength(2);
  });

  it("a network failure (no response) is treated like a server error", async () => {
    const user = userEvent.setup();
    const a = api({
      member: member(), book: book(),
      borrow: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await renderApp(prefilled, a.handler);
    await confirmReady();
    await user.click(screen.getByTestId("confirm-borrow"));
    expect(await screen.findByTestId("borrow-error")).toHaveTextContent("Couldn't record the borrowing. Nothing was saved. Try again.");
  });

  it("the processed-by row shows the signed-in staff member", async () => {
    const a = api({ member: member(), book: book() });
    await renderApp(prefilled, a.handler);
    const summary = await screen.findByTestId("borrow-summary");
    await waitFor(() => expect(within(summary).getByText("Layla Librarian")).toBeInTheDocument());
  });
});
