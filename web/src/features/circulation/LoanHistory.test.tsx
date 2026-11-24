// @vitest-environment jsdom
import type { LoanDto } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, renderApp } from "./testApp";

afterEach(() => vi.unstubAllGlobals());

const BOOK_ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const MEMBER_ID = "1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1f";
const loan = (patch: Partial<LoanDto> = {}): LoanDto => ({
  id: crypto.randomUUID(), status: "ACTIVE",
  book: { id: BOOK_ID, title: "Clean Code", author: "Robert C. Martin" },
  member: { id: MEMBER_ID, memberNumber: "M-000142", fullName: "Sara Haddad" },
  processedBy: { id: "s1", name: "Layla Librarian" }, returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z", dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), returnedAt: null, ...patch,
});
const supervisor = { id: "s3", email: "sam@library.test", fullName: "Samir Supervisor", role: "SUPERVISOR" as const, permissions: [...ROLE_PERMISSIONS.SUPERVISOR], isDemo: false };

describe("SLM-5 Loan history page (ux.md §3.6)", () => {
  it("SLM-5 AC1 rows show book, member, dates, returned «—», status and processed by; overdue rows are tinted", async () => {
    await renderApp("/loans", ({ url }) => {
      if (url.pathname === "/api/loans") {
        return { body: page([
          loan({ status: "OVERDUE", dueAt: new Date(Date.now() - 2 * 86_400_000 - 1000).toISOString() }),
          loan({ status: "RETURNED", returnedAt: "2026-11-20T10:00:00.000Z", returnedBy: { id: "s1", name: "Layla Librarian" } }),
        ]) };
      }
      return undefined;
    }, supervisor);
    const rows = await screen.findAllByTestId("history-row");
    expect(rows[0]).toHaveAttribute("data-status", "OVERDUE");
    expect(rows[0]!.className).toContain("bg-overdue");
    expect(within(rows[0]!).getByTestId("loan-status")).toHaveTextContent("Overdue · 2 days");
    expect(rows[0]).toHaveTextContent("Clean Code");
    expect(rows[0]).toHaveTextContent("Sara Haddad");
    expect(rows[0]).toHaveTextContent("Layla Librarian");
    expect(rows[0]).toHaveTextContent("—");
    expect(within(rows[1]!).getByTestId("loan-status")).toHaveTextContent("Returned");
    expect(rows[1]).toHaveTextContent("20 Nov");
    expect(screen.getByTestId("result-line")).toHaveTextContent("2 loans");
    // AC5: no fee, fine or payment anywhere on the page.
    expect(document.body.textContent).not.toMatch(/fee|fine|payment/i);
  });

  it("SLM-5 AC2 filters live in the URL and reach the API; ?status=overdue from the dashboard works; no match → empty state + Clear filters", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/loans?status=overdue", ({ url }) => {
      if (url.pathname === "/api/loans") return { body: page(url.searchParams.get("status") === "RETURNED" ? [] : [loan({ status: "OVERDUE" })]) };
      return undefined;
    });
    await screen.findAllByTestId("history-row");
    expect(screen.getByTestId("filter-status")).toHaveValue("OVERDUE");
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("status=OVERDUE"))).toBe(true);

    await user.click(screen.getByTestId("sort-dueAt"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "dueAt" }));

    await user.selectOptions(screen.getByTestId("filter-status"), "RETURNED");
    expect(await screen.findByTestId("loans-empty-filtered")).toHaveTextContent("No loans match these filters.");
    expect(router.state.location.search).toMatchObject({ status: "RETURNED" });

    await user.click(within(screen.getByTestId("loans-empty-filtered")).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(router.state.location.search.status).toBeUndefined());
    expect(await screen.findAllByTestId("history-row")).toHaveLength(1);
  });

  it("SLM-5 clicking a member narrows the history to that member (memberId in the URL, removable chip)", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/loans", ({ url }) => (url.pathname === "/api/loans" ? { body: page([loan()]) } : undefined));
    await user.click(await screen.findByTestId("member-filter-link"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ memberId: MEMBER_ID }));
    expect(await screen.findByTestId("chip-member")).toHaveTextContent("Member: Sara Haddad");
  });
});
