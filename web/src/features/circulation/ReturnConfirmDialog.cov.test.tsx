// @vitest-environment jsdom
import type { LoanDto } from "@slm/contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/apiClient";
import { renderWithProviders } from "../../test/render";
import { ReturnConfirmDialog, returnErrorMessage } from "./ReturnConfirmDialog";

const DAY = 86_400_000;
const loan = (patch: Partial<LoanDto> = {}): LoanDto => ({
  id: "l1",
  status: "ACTIVE",
  book: { id: "b1", title: "Clean Code", author: "Robert C. Martin" },
  member: { id: "m1", memberNumber: "M-000142", fullName: "Sara Haddad" },
  processedBy: { id: "s1", name: "Layla Librarian" },
  returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z",
  dueAt: new Date(Date.now() + 5 * DAY).toISOString(),
  returnedAt: null,
  ...patch,
});
const apiError = (status: number, code: string, context?: Record<string, unknown>) =>
  new ApiError({ type: "about:blank", title: code, status, code, ...(context ? { context } : {}) });

async function show(l: LoanDto, extra: { loading?: boolean } = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  await renderWithProviders(
    <ReturnConfirmDialog loan={l} loading={extra.loading ?? false} onCancel={onCancel} onConfirm={onConfirm} />,
  );
  return { dialog: await screen.findByTestId("return-dialog"), onCancel, onConfirm };
}

describe("ReturnConfirmDialog", () => {
  it("an on-time loan shows the title, today's return date and the due day, with no overdue note", async () => {
    const { dialog } = await show(loan({ dueAt: "2026-12-08T10:00:00.000Z" }));
    expect(dialog).toHaveTextContent("Return Clean Code from Sara Haddad?");
    expect(dialog).toHaveTextContent(/Return date: today, \d{1,2} \w{3} \d{4} · was due 8 Dec/);
    expect(dialog).not.toHaveTextContent("overdue");
  });

  it("an overdue loan says how many days: singular for one day, plural otherwise", async () => {
    const one = await show(loan({ status: "OVERDUE", dueAt: new Date(Date.now() - DAY - 1000).toISOString() }));
    expect(one.dialog).toHaveTextContent("(1 day overdue)");
  });

  it("an overdue loan older than a day is plural", async () => {
    const { dialog } = await show(
      loan({ status: "OVERDUE", dueAt: new Date(Date.now() - 4 * DAY - 1000).toISOString() }),
    );
    expect(dialog).toHaveTextContent("(4 days overdue)");
  });

  it("an overdue loan due under a day ago counts as 1 day", async () => {
    const { dialog } = await show(loan({ status: "OVERDUE", dueAt: new Date(Date.now() - 3_600_000).toISOString() }));
    expect(dialog).toHaveTextContent("(1 day overdue)");
  });

  it("Confirm and Cancel call back once each", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = await show(loan());
    await user.click(screen.getByTestId("dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("dialog-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("returnErrorMessage", () => {
  it("LOAN_ALREADY_RETURNED with when and who names both", () => {
    const msg = returnErrorMessage(
      apiError(409, "LOAN_ALREADY_RETURNED", { returnedAt: "2026-11-24T10:42:00.000Z", returnedBy: "Omar Nasser" }),
    );
    expect(msg).toMatch(/^This loan was already returned on 24 Nov 2026 at \d{2}:\d{2} by Omar Nasser\.$/);
  });

  it("LOAN_ALREADY_RETURNED with a time but no staff name omits 'by'", () => {
    const msg = returnErrorMessage(
      apiError(409, "LOAN_ALREADY_RETURNED", { returnedAt: "2026-11-24T10:42:00.000Z", returnedBy: null }),
    );
    expect(msg).toMatch(/^This loan was already returned on 24 Nov 2026 at \d{2}:\d{2}\.$/);
  });

  it("LOAN_ALREADY_RETURNED with no context is just the plain sentence", () => {
    expect(returnErrorMessage(apiError(409, "LOAN_ALREADY_RETURNED"))).toBe("This loan was already returned.");
  });

  it("LOAN_ALREADY_RETURNED with only a name and no time still names who", () => {
    expect(returnErrorMessage(apiError(409, "LOAN_ALREADY_RETURNED", { returnedBy: "Omar Nasser" }))).toBe(
      "This loan was already returned by Omar Nasser.",
    );
  });

  it("404 says the loan no longer exists", () => {
    expect(returnErrorMessage(apiError(404, "NOT_FOUND"))).toBe(
      "This loan no longer exists. The list has been refreshed.",
    );
  });

  it("5xx and non-API errors say nothing was saved", () => {
    expect(returnErrorMessage(apiError(500, "INTERNAL"))).toBe(
      "Couldn't record the return. Nothing was saved. Try again.",
    );
    expect(returnErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Couldn't record the return. Nothing was saved. Try again.",
    );
  });

  it("any other 4xx is left to the page (null)", () => {
    expect(returnErrorMessage(apiError(403, "FORBIDDEN"))).toBeNull();
    expect(returnErrorMessage(apiError(409, "SOMETHING_ELSE"))).toBeNull();
  });
});
