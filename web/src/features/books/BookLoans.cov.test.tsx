// @vitest-environment jsdom
import type { LoanDto } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../test/render";
import { BookLoans } from "../circulation/BookLoans";

afterEach(() => vi.unstubAllGlobals());

const DAY = 86_400_000;
const loan = (patch: Partial<LoanDto> = {}): LoanDto => ({
  id: "L1",
  status: "ACTIVE",
  book: { id: "b1", title: "Refactoring", author: "Martin Fowler" },
  member: { id: "m1", memberNumber: "M-000007", fullName: "Nadia Said" },
  processedBy: { id: "s1", name: "Layla Librarian" },
  returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z",
  dueAt: new Date(Date.now() + 9 * DAY).toISOString(),
  returnedAt: null,
  ...patch,
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** Answers /api/loans from `byStatus` (key = status query param or "all") and records the URLs. */
function stubLoans(byStatus: Record<string, LoanDto[]>) {
  const urls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(String(input), "http://localhost");
      urls.push(url);
      const items = byStatus[url.searchParams.get("status") ?? "all"] ?? [];
      return json({ items, page: 1, size: 10, total: items.length });
    }),
  );
  return urls;
}

describe("BookLoans (book detail, ux.md §3.3)", () => {
  it("opens on Active when copies are on loan, and asks the API for this book's ACTIVE loans only", async () => {
    const urls = stubLoans({ ACTIVE: [loan()] });
    await renderWithProviders(<BookLoans bookId="b1" activeCount={2} />);
    const rows = await screen.findAllByTestId("book-loan-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("Nadia Said")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Layla Librarian")).toBeInTheDocument();
    expect(screen.getByTestId("book-loans-tab-active")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("book-loans-tab-active")).toHaveTextContent("Active (2)");
    expect(screen.getByRole("table", { name: "Active loans of this book" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Returned" })).not.toBeInTheDocument();
    const q = urls.at(-1)!.searchParams;
    expect(q.get("bookId")).toBe("b1");
    expect(q.get("status")).toBe("ACTIVE");
    expect(q.get("size")).toBe("10");
  });

  it("opens on History when nothing is on loan; History has a Returned column and a dash for open loans", async () => {
    const urls = stubLoans({
      all: [
        loan({
          id: "L2",
          status: "RETURNED",
          returnedAt: "2026-11-10T09:00:00.000Z",
          returnedBy: { id: "s1", name: "Layla Librarian" },
        }),
        loan({ id: "L3" }),
      ],
    });
    await renderWithProviders(<BookLoans bookId="b1" activeCount={0} />);
    const rows = await screen.findAllByTestId("book-loan-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByTestId("book-loans-tab-history")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table", { name: "Loan history of this book" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Returned" })).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Returned")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("—")).toBeInTheDocument();
    expect(urls.at(-1)!.searchParams.has("status")).toBe(false);
  });

  it("switching tabs refetches with the other filter", async () => {
    const urls = stubLoans({
      ACTIVE: [loan()],
      all: [loan({ id: "L9", status: "RETURNED", returnedAt: "2026-11-05T10:00:00.000Z" })],
    });
    const user = userEvent.setup();
    await renderWithProviders(<BookLoans bookId="b1" activeCount={1} />);
    await screen.findAllByTestId("book-loan-row");
    await user.click(screen.getByTestId("book-loans-tab-history"));
    await waitFor(() => expect(screen.getByRole("table", { name: "Loan history of this book" })).toBeInTheDocument());
    expect(urls.at(-1)!.searchParams.has("status")).toBe(false);
    await user.click(screen.getByTestId("book-loans-tab-active"));
    await waitFor(() => expect(screen.getByRole("table", { name: "Active loans of this book" })).toBeInTheDocument());
    expect(urls.at(-1)!.searchParams.get("status")).toBe("ACTIVE");
  });

  it("highlights an overdue loan and shows the overdue badge", async () => {
    stubLoans({ ACTIVE: [loan({ status: "OVERDUE", dueAt: new Date(Date.now() - 3 * DAY).toISOString() })] });
    await renderWithProviders(<BookLoans bookId="b1" activeCount={1} />);
    const row = await screen.findByTestId("book-loan-row");
    expect(row.className).toContain("bg-overdue");
    expect(within(row).getByTestId("loan-status")).toHaveAttribute("data-status", "OVERDUE");
    expect(within(row).getByTestId("loan-status")).toHaveTextContent("Overdue");
  });

  it("empty states differ per tab", async () => {
    stubLoans({});
    const user = userEvent.setup();
    await renderWithProviders(<BookLoans bookId="b1" activeCount={1} />);
    expect(await screen.findByText("No copies are on loan.")).toBeInTheDocument();
    await user.click(screen.getByTestId("book-loans-tab-history"));
    expect(await screen.findByText("This book hasn't been borrowed yet.")).toBeInTheDocument();
  });

  it("links to Loan history filtered by this book (and ACTIVE on the Active tab)", async () => {
    stubLoans({});
    const user = userEvent.setup();
    await renderWithProviders(<BookLoans bookId="b1" activeCount={1} />);
    const link = await screen.findByTestId("book-loans-all");
    expect(link).toHaveTextContent("View in Loan history");
    expect(link.getAttribute("href")).toContain("bookId=b1");
    expect(link.getAttribute("href")).toContain("ACTIVE");
    await user.click(screen.getByTestId("book-loans-tab-history"));
    await waitFor(() => expect(screen.getByTestId("book-loans-all").getAttribute("href")).not.toContain("ACTIVE"));
    expect(screen.getByTestId("book-loans-all").getAttribute("href")).toContain("bookId=b1");
  });

  it("shows a skeleton while the loans load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    await renderWithProviders(<BookLoans bookId="b1" activeCount={1} />);
    expect(await screen.findByTestId("book-loans")).toBeInTheDocument();
    expect(screen.queryByTestId("book-loan-row")).not.toBeInTheDocument();
    expect(screen.queryByText("No copies are on loan.")).not.toBeInTheDocument();
  });

  it("treats a failed request as an empty list rather than crashing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ type: "about:blank", title: "x", status: 500, code: "INTERNAL" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await renderWithProviders(<BookLoans bookId="b1" activeCount={0} />);
    expect(await screen.findByText("This book hasn't been borrowed yet.")).toBeInTheDocument();
  });
});
