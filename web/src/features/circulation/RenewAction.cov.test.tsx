// @vitest-environment jsdom
import type { LoanDto, Me } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient";
import { formatDate } from "../../lib/format";
import { renewBlock, renewErrorMessage } from "./RenewAction";
import { page, renderApp } from "./testApp";

afterEach(() => vi.unstubAllGlobals());

const DAY = 86_400_000;
const loan = (id: string, patch: Partial<LoanDto> = {}): LoanDto => ({
  id,
  status: "ACTIVE",
  book: { id: "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e", title: "Clean Code", author: "Robert C. Martin" },
  member: { id: "1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1f", memberNumber: "M-000142", fullName: "Sara Haddad" },
  processedBy: { id: "s1", name: "Layla Librarian" },
  returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z",
  dueAt: new Date(Date.now() + 5 * DAY).toISOString(),
  returnedAt: null,
  renewedAt: null,
  ...patch,
});
const problem = (status: number, code: string, detail?: string) => ({
  status,
  body: { type: "about:blank", title: code, status, code, ...(detail ? { detail } : {}) },
});
const supervisor: Me = {
  id: "s3",
  email: "samir@library.test",
  fullName: "Samir Supervisor",
  role: "SUPERVISOR",
  permissions: [...ROLE_PERMISSIONS.SUPERVISOR],
  isDemo: false,
};

type Reply = { status?: number; body: unknown } | undefined;
/** Lists answer `items` (the bell's overdue query gets an empty page); POST …/renew answers `renew`. */
const handler =
  (items: LoanDto[], renew: (id: string) => Reply = () => undefined) =>
  ({ method, url }: { method: string; url: URL }): Reply => {
    const m = url.pathname.match(/^\/api\/loans\/([^/]+)\/renew$/);
    if (m && method === "POST") return renew(m[1]!);
    if (url.pathname !== "/api/loans") return undefined;
    if (url.searchParams.get("size") === "5") return { body: page([]) };
    return { body: page(items) };
  };

describe("SLM-18 renewal rules in the UI", () => {
  it("renewBlock: returned, then already renewed, then overdue; an active never-renewed loan can be renewed", () => {
    expect(renewBlock({ status: "RETURNED", renewedAt: "2026-11-02T00:00:00Z" })).toBe(
      "Returned loans can't be renewed.",
    );
    expect(renewBlock({ status: "OVERDUE", renewedAt: "2026-11-02T00:00:00Z" })).toMatch(/^Already renewed once/);
    expect(renewBlock({ status: "OVERDUE", renewedAt: null })).toBe(
      "Overdue loans can't be renewed. Record the return instead.",
    );
    expect(renewBlock({ status: "ACTIVE" })).toBeNull();
  });

  it("renewErrorMessage: the API's words for a 4xx; a generic message for 5xx, a 4xx without detail and network errors", () => {
    const p = (status: number, detail?: string) =>
      new ApiError({ type: "about:blank", title: "x", status, code: "X", ...(detail ? { detail } : {}) });
    expect(renewErrorMessage(p(409, "This loan is overdue."))).toBe("This loan is overdue.");
    const generic = "Couldn't renew the loan. Nothing was saved. Try again.";
    expect(renewErrorMessage(p(500, "boom"))).toBe(generic);
    expect(renewErrorMessage(p(409))).toBe(generic);
    expect(renewErrorMessage(new TypeError("Failed to fetch"))).toBe(generic);
  });
});

describe("SLM-18 Renew on the Return list", () => {
  it("an eligible loan renews: POST /renew, a toast with the new due date, the list is fetched again", async () => {
    const user = userEvent.setup();
    const newDue = new Date(Date.now() + 19 * DAY).toISOString();
    const { fetchMock } = await renderApp(
      "/circulation/return",
      handler([loan("l1")], (id) => ({ body: loan(id, { dueAt: newDue, renewedAt: new Date().toISOString() }) })),
    );
    const row = await screen.findByTestId("loan-row");
    const listCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("size=20")).length;
    const before = listCalls();
    const button = within(row).getByRole("button", { name: "Renew Clean Code for Sara Haddad" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(await screen.findByTestId("toast")).toHaveTextContent(
      `Renewed: Clean Code. New due date: ${formatDate(newDue)}.`,
    );
    expect(fetchMock.mock.calls.some(([u, i]) => String(u) === "/api/loans/l1/renew" && i?.method === "POST")).toBe(
      true,
    );
    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
    expect(screen.queryByTestId("renew-error")).not.toBeInTheDocument();
  });

  it("overdue and already-renewed loans: Renew is disabled with the reason; a renewed loan shows the Renewed marker", async () => {
    await renderApp(
      "/circulation/return",
      handler([
        loan("l1", { status: "OVERDUE", dueAt: new Date(Date.now() - 2 * DAY).toISOString() }),
        loan("l2", { renewedAt: "2026-11-10T10:00:00.000Z" }),
      ]),
    );
    const [overdue, renewed] = await screen.findAllByTestId("loan-row");
    expect(within(overdue!).getByTestId("renew-button")).toBeDisabled();
    expect(within(overdue!).getByTestId("renew-blocked")).toHaveAttribute(
      "title",
      "Overdue loans can't be renewed. Record the return instead.",
    );
    expect(within(overdue!).getByTestId("renew-button")).toHaveAccessibleDescription(
      "Overdue loans can't be renewed. Record the return instead.",
    );
    expect(within(overdue!).queryByTestId("renewed-badge")).not.toBeInTheDocument();
    expect(within(renewed!).getByTestId("renew-button")).toBeDisabled();
    expect(within(renewed!).getByTestId("renew-blocked")).toHaveAttribute(
      "title",
      "Already renewed once. A loan can be renewed only once.",
    );
    const badge = within(renewed!).getByTestId("renewed-badge");
    expect(badge).toHaveTextContent("Renewed");
    expect(badge).toHaveAttribute("title", `Renewed on ${formatDate("2026-11-10T10:00:00.000Z")}`);
  });

  it("a refusal shows the API's reason inline (no toast); Dismiss hides it", async () => {
    const user = userEvent.setup();
    await renderApp(
      "/circulation/return",
      handler([loan("l1")], () =>
        problem(409, "LOAN_ALREADY_RENEWED", "This loan was already renewed on 20 Nov 2026."),
      ),
    );
    await user.click(within(await screen.findByTestId("loan-row")).getByTestId("renew-button"));
    const alert = await screen.findByTestId("renew-error");
    expect(alert).toHaveTextContent("This loan was already renewed on 20 Nov 2026.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("renew-error")).not.toBeInTheDocument();
  });

  it("a server error shows the generic inline message", async () => {
    const user = userEvent.setup();
    await renderApp(
      "/circulation/return",
      handler([loan("l1")], () => problem(500, "INTERNAL")),
    );
    await user.click(within(await screen.findByTestId("loan-row")).getByTestId("renew-button"));
    expect(await screen.findByTestId("renew-error")).toHaveTextContent(
      "Couldn't renew the loan. Nothing was saved. Try again.",
    );
  });
});

describe("SLM-18 Renew in Loan history", () => {
  it("Librarian: Renew on open loans only (none on returned ones); renewed loans carry the marker; a renewal works from here too", async () => {
    const user = userEvent.setup();
    await renderApp(
      "/loans",
      handler(
        [
          loan("l1"),
          loan("l2", {
            status: "RETURNED",
            returnedAt: "2026-11-20T10:00:00.000Z",
            returnedBy: { id: "s1", name: "Layla Librarian" },
            renewedAt: "2026-11-10T10:00:00.000Z",
          }),
        ],
        (id) => ({ body: loan(id, { renewedAt: new Date().toISOString() }) }),
      ),
    );
    const [open, returned] = await screen.findAllByTestId("history-row");
    expect(within(returned!).queryByTestId("renew-button")).not.toBeInTheDocument();
    expect(within(returned!).getByTestId("renewed-badge")).toBeInTheDocument();
    expect(within(open!).queryByTestId("renewed-badge")).not.toBeInTheDocument();
    await user.click(within(open!).getByTestId("renew-button"));
    expect(await screen.findByTestId("toast")).toHaveTextContent(/^Renewed: Clean Code\. New due date: /);
  });

  it("a refusal from Loan history shows inline above the table", async () => {
    const user = userEvent.setup();
    await renderApp(
      "/loans",
      handler([loan("l1")], () => problem(409, "LOAN_OVERDUE", "This loan is overdue.")),
    );
    await user.click(within(await screen.findByTestId("history-row")).getByTestId("renew-button"));
    expect(await screen.findByTestId("renew-error")).toHaveTextContent("This loan is overdue.");
  });

  it("Supervisor (no LOAN_PROCESS): no Renew button and no actions column, but the Renewed marker shows", async () => {
    await renderApp("/loans", handler([loan("l1", { renewedAt: "2026-11-10T10:00:00.000Z" })]), supervisor);
    const row = await screen.findByTestId("history-row");
    expect(within(row).queryByTestId("renew-button")).not.toBeInTheDocument();
    expect(within(row).getByTestId("renewed-badge")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
  });
});
