// @vitest-environment jsdom
import type { LoanDto } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, renderApp } from "./testApp";

afterEach(() => vi.unstubAllGlobals());

const BOOK_ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const MEMBER_ID = "1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1f";
const DAY = 86_400_000;

const loan = (id: string, patch: Partial<LoanDto> = {}): LoanDto => ({
  id,
  status: "ACTIVE",
  book: { id: BOOK_ID, title: "Clean Code", author: "Robert C. Martin" },
  member: { id: MEMBER_ID, memberNumber: "M-000142", fullName: "Sara Haddad" },
  processedBy: { id: "s1", name: "Layla Librarian" },
  returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z",
  dueAt: new Date(Date.now() + 5 * DAY).toISOString(),
  returnedAt: null,
  ...patch,
});
const problem = (status: number, code: string) => ({
  status,
  body: { type: "about:blank", title: code, status, code },
});
const loansOnly =
  (items: LoanDto[]) =>
  ({ url }: { url: URL }) =>
    url.pathname === "/api/loans" ? { body: page(items) } : undefined;

describe("LoanHistoryPage states", () => {
  it("no loans and no filters: 'No loans yet'", async () => {
    await renderApp("/loans", loansOnly([]));
    const empty = await screen.findByTestId("loans-empty");
    expect(empty).toHaveTextContent("No loans yet");
    expect(empty).toHaveTextContent("Borrowings you record will show here.");
    expect(screen.getByTestId("result-line")).toHaveTextContent("0 loans");
    expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument();
  });

  it("a single loan reads '1 loan'", async () => {
    await renderApp("/loans", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    expect(screen.getByTestId("result-line")).toHaveTextContent(/^1 loan$/);
  });

  it("a failed load shows the generic error; Try again reloads the list", async () => {
    const user = userEvent.setup();
    let calls = 0;
    await renderApp("/loans", ({ url }) => {
      if (url.pathname !== "/api/loans") return undefined;
      if (url.searchParams.get("status") === "OVERDUE") return { body: page([]) }; // the shell's overdue bell (SLM-18)
      return ++calls === 1 ? problem(500, "INTERNAL") : { body: page([loan("l1")]) };
    });
    const alert = await screen.findByTestId("loans-error");
    expect(alert).toHaveTextContent("Couldn't load loans. Check your connection and try again.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("history-row")).toBeInTheDocument();
  });

  it("a 400 from the API says the filters aren't valid", async () => {
    await renderApp("/loans", ({ url }) =>
      url.pathname === "/api/loans" ? problem(400, "VALIDATION_FAILED") : undefined,
    );
    expect(await screen.findByTestId("loans-error")).toHaveTextContent(
      "These filters aren't valid. Clear them and try again.",
    );
  });

  it("an unknown status in the URL is dropped instead of failing the page", async () => {
    const { fetchMock } = await renderApp("/loans?status=bogus", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    expect(screen.getByTestId("filter-status")).toHaveValue("");
    // The page's own list query carries no status; the shell's overdue bell (SLM-18) asks for status=OVERDUE&size=5.
    const pageCalls = fetchMock.mock.calls.filter(([u]) => !String(u).includes("size=5"));
    expect(pageCalls.some(([u]) => String(u).includes("status="))).toBe(false);
  });

  it("returned loans show the returned date; active ones show a dash", async () => {
    await renderApp(
      "/loans",
      loansOnly([
        loan("l1", {
          status: "RETURNED",
          returnedAt: "2026-11-20T10:00:00.000Z",
          returnedBy: { id: "s1", name: "Layla Librarian" },
        }),
        loan("l2"),
      ]),
    );
    const rows = await screen.findAllByTestId("history-row");
    expect(rows[0]).toHaveTextContent("20 Nov 2026");
    expect(within(rows[1]!).getAllByText("—")).toHaveLength(1);
    expect(rows[1]!.className).not.toContain("bg-overdue");
  });
});

describe("LoanHistoryPage filters", () => {
  it("typing in the search box pushes q to the URL after a pause and the API gets it; the page resets to 1", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/loans?page=3", ({ url }) => {
      if (url.pathname !== "/api/loans") return undefined;
      return { body: { items: [loan("l1")], page: Number(url.searchParams.get("page") ?? 1), size: 20, total: 45 } };
    });
    await screen.findByTestId("history-row");
    await user.type(screen.getByTestId("loan-search"), "clean");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "clean", page: "1" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("q=clean"))).toBe(true));
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("45 loans match these filters"));
  });

  it("emptying the search box removes q from the URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/loans?q=clean", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    expect(screen.getByTestId("loan-search")).toHaveValue("clean");
    await user.clear(screen.getByTestId("loan-search"));
    await waitFor(() => expect(router.state.location.search.q).toBeUndefined());
  });

  it("Clear filters in the header resets the box, the URL and the list", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/loans?q=clean&status=active", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    expect(screen.getByTestId("result-line")).toHaveTextContent("1 loan match these filters");
    await user.click(screen.getByTestId("clear-filters"));
    await waitFor(() => expect(screen.getByTestId("loan-search")).toHaveValue(""));
    expect(router.state.location.search.q).toBeUndefined();
    expect(router.state.location.search.status).toBeUndefined();
    await waitFor(() => expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument());
  });

  it("the date filters reach the API as from/to; a full date-time from an old link shows as its day; clearing removes it", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/loans?from=2026-11-01T00:00:00.000Z", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    expect(screen.getByTestId("filter-from")).toHaveValue("2026-11-01");
    expect(screen.getByTestId("filter-to")).toHaveValue("");

    const to = screen.getByTestId("filter-to");
    await user.type(to, "2026-11-30");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ to: "2026-11-30" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("to=2026-11-30"))).toBe(true));

    await user.clear(screen.getByTestId("filter-from"));
    await waitFor(() => expect(router.state.location.search.from).toBeUndefined());
  });

  it("the status select offers all four options and can go back to All statuses", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/loans", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    const select = screen.getByTestId("filter-status");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["All statuses", "Active (on loan)", "Overdue", "Returned"]);
    await user.selectOptions(select, "ACTIVE");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ status: "ACTIVE" }));
    await user.selectOptions(screen.getByTestId("filter-status"), "");
    await waitFor(() => expect(router.state.location.search.status).toBeUndefined());
  });

  it("filtered with no result: the empty state names the filters and its button clears them", async () => {
    const user = userEvent.setup();
    await renderApp("/loans?status=returned", loansOnly([]));
    const empty = await screen.findByTestId("loans-empty-filtered");
    expect(empty).toHaveTextContent("No loans match these filters.");
    await user.click(within(empty).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("loans-empty")).toBeInTheDocument());
  });
});

describe("LoanHistoryPage scope chips, sorting and paging", () => {
  it("?memberId shows 'Member: <name>' from the first row, and the chip's × removes the filter", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp(`/loans?memberId=${MEMBER_ID}`, loansOnly([loan("l1")]));
    await screen.findAllByTestId("history-row");
    await waitFor(() => expect(screen.getByTestId("chip-member")).toHaveTextContent("Member: Sara Haddad"));
    await user.click(screen.getByRole("button", { name: "Remove filter Member: Sara Haddad" }));
    await waitFor(() => expect(router.state.location.search.memberId).toBeUndefined());
    await waitFor(() => expect(screen.queryByTestId("chip-member")).not.toBeInTheDocument());
  });

  it("?bookId shows 'Book: <title>' and removes on ×; an id that doesn't match the first row falls back to 'selected book/member'", async () => {
    const user = userEvent.setup();
    const other = "9a9a9a9a-1111-4222-8333-444444444444";
    const { router } = await renderApp(`/loans?bookId=${BOOK_ID}&memberId=${other}`, loansOnly([loan("l1")]));
    await screen.findAllByTestId("history-row");
    await waitFor(() => expect(screen.getByTestId("chip-book")).toHaveTextContent("Book: Clean Code"));
    expect(screen.getByTestId("chip-member")).toHaveTextContent("Member: selected member");
    await user.click(screen.getByRole("button", { name: "Remove filter Book: Clean Code" }));
    await waitFor(() => expect(router.state.location.search.bookId).toBeUndefined());
  });

  it("with no rows yet the chips fall back to 'selected member' / 'selected book'", async () => {
    await renderApp(`/loans?bookId=${BOOK_ID}&memberId=${MEMBER_ID}`, loansOnly([]));
    expect(await screen.findByTestId("chip-book")).toHaveTextContent("Book: selected book");
    expect(screen.getByTestId("chip-member")).toHaveTextContent("Member: selected member");
  });

  it("clicking a sortable header sorts ascending, clicking again flips it; the default column is descending first", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/loans", loansOnly([loan("l1")]));
    await screen.findByTestId("history-row");
    // default sort is newest borrowed first
    expect(screen.getByTestId("sort-borrowedAt").closest("th")).toHaveAttribute("aria-sort", "descending");
    await user.click(screen.getByTestId("sort-borrowedAt"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "borrowedAt" }));
    await user.click(screen.getByTestId("sort-borrowedAt"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "-borrowedAt" }));
    await user.click(screen.getByTestId("sort-returnedAt"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "returnedAt" }));
    await user.click(screen.getByTestId("sort-dueAt"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "dueAt" }));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("sort=dueAt"))).toBe(true);
  });

  it("Next and Previous change the page in the URL without resetting it", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/loans", ({ url }) => {
      if (url.pathname !== "/api/loans") return undefined;
      const p = Number(url.searchParams.get("page") ?? 1);
      return { body: { items: [loan(`p${p}`)], page: p, size: 20, total: 45 } };
    });
    await screen.findByTestId("history-row");
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 1–20 of 45");
    await user.click(screen.getByTestId("page-next"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "2" }));
    await waitFor(() => expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 21–40 of 45"));
    await user.click(screen.getByTestId("page-prev"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "1" }));
  });
});
