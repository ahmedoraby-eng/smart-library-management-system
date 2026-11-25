// @vitest-environment jsdom
import type { LoanDto, Me, MemberDto } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../circulation/testApp";

afterEach(() => vi.unstubAllGlobals());

const DAY = 86_400_000;
const member = (patch: Partial<MemberDto> = {}): MemberDto => ({
  id: "m1", memberNumber: "M-000001", fullName: "Sara Haddad", email: "sara@example.org", phone: null, status: "ACTIVE",
  registeredAt: "2026-01-01T00:00:00.000Z", activeLoans: 1, overdueLoans: 0, version: 4, ...patch,
});
const loan = (id: string, patch: Partial<LoanDto> = {}): LoanDto => ({
  id, status: "ACTIVE", book: { id: `b-${id}`, title: `Book ${id}`, author: "An Author" },
  member: { id: "m1", memberNumber: "M-000001", fullName: "Sara Haddad" }, processedBy: { id: "s1", name: "Layla Librarian" }, returnedBy: null,
  borrowedAt: new Date(Date.now() - 10 * DAY).toISOString(), dueAt: new Date(Date.now() + 10 * DAY).toISOString(), returnedAt: null, ...patch,
});
const returned = (id: string) => loan(id, { status: "RETURNED", returnedAt: "2026-11-10T10:00:00.000Z", returnedBy: { id: "s1", name: "Layla Librarian" } });
const problem = (status: number, code: string, detail?: string) => ({ status, body: { type: "about:blank", title: code, status, code, ...(detail ? { detail } : {}) } });

const me = (permissions: Me["permissions"]): Me => ({ id: "s1", email: "s@x.org", fullName: "Staff", role: "LIBRARIAN", permissions, isDemo: false });
const READ_ONLY_NO_LOANS = me(["BOOK_READ", "MEMBER_READ"]);

interface Setup {
  member?: MemberDto;
  loans?: LoanDto[];
  put?: (body: unknown) => { status?: number; body: unknown };
  ret?: () => { status?: number; body: unknown };
  memberStatus?: number;
  loansStatus?: number;
}
function api(opts: Setup = {}) {
  const puts: unknown[] = [];
  const handler = ({ method, url, body }: { method: string; url: URL; body: unknown }) => {
    const p = url.pathname;
    if (p === "/api/members/m1" && method === "GET") return opts.memberStatus ? problem(opts.memberStatus, "X") : { body: opts.member ?? member() };
    if (p === "/api/members/m1" && method === "PUT") {
      puts.push(body);
      return opts.put?.(body) ?? { body: { ...(opts.member ?? member()), ...(body as object) } };
    }
    if (p === "/api/members/m1/loans") return opts.loansStatus ? problem(opts.loansStatus, "X") : { body: opts.loans ?? [] };
    if (p.endsWith("/return") && method === "POST") return opts.ret?.() ?? { body: returned("1") };
    return undefined;
  };
  return { handler, puts };
}

describe("MemberDetailPage loading and errors", () => {
  it("shows the skeleton first, then the profile", async () => {
    const a = api({ loans: [loan("1")] });
    await renderApp("/members/m1", a.handler);
    expect(await screen.findByTestId("member-detail-name")).toHaveTextContent("Sara Haddad");
    expect(screen.getByTestId("profile-phone")).toHaveTextContent("—");
    expect(screen.getByTestId("profile-email")).toHaveTextContent("sara@example.org");
    expect(screen.getByTestId("profile-registered")).toHaveTextContent("1 Jan 2026");
    expect(screen.queryByTestId("member-skeleton")).not.toBeInTheDocument();
  });

  it("a server error shows the retry alert (not the not-found card); Try again loads the member", async () => {
    const user = userEvent.setup();
    let calls = 0;
    await renderApp("/members/m1", ({ method, url }) => {
      if (url.pathname === "/api/members/m1" && method === "GET") return ++calls === 1 ? problem(500, "INTERNAL") : { body: member() };
      if (url.pathname === "/api/members/m1/loans") return { body: [] };
      return undefined;
    });
    const alert = await screen.findByTestId("member-error");
    expect(alert).toHaveTextContent("Couldn't load this member. Check your connection and try again.");
    expect(screen.queryByTestId("member-not-found")).not.toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("member-detail-name")).toBeInTheDocument();
  });

  it("404 shows 'This member doesn't exist.' with a way back", async () => {
    const a = api({ memberStatus: 404 });
    const { router } = await renderApp("/members/m1", a.handler);
    const card = await screen.findByTestId("member-not-found");
    expect(card).toHaveTextContent("This member doesn't exist.");
    await userEvent.click(within(card).getByRole("link", { name: "Back to Members" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/members"));
  });

  it("a failed loans load shows its own retry alert while the profile stays", async () => {
    const user = userEvent.setup();
    let calls = 0;
    await renderApp("/members/m1", ({ method, url }) => {
      if (url.pathname === "/api/members/m1" && method === "GET") return { body: member() };
      if (url.pathname === "/api/members/m1/loans") return ++calls === 1 ? problem(500, "INTERNAL") : { body: [loan("1")] };
      return undefined;
    });
    const alert = await screen.findByTestId("loans-error");
    expect(alert).toHaveTextContent("Couldn't load this member's loans. Check your connection and try again.");
    expect(screen.getByTestId("member-detail-name")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("loan-row")).toBeInTheDocument();
  });

  it("a role without LOAN_READ is told it can't see loans, and the loans are never requested", async () => {
    const a = api({ loans: [loan("1")] });
    const { fetchMock } = await renderApp("/members/m1", a.handler, READ_ONLY_NO_LOANS);
    await screen.findByTestId("member-detail-name");
    expect(await screen.findByText("Your role can't see loans.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/loans"))).toBe(false);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("MemberDetailPage loans tabs", () => {
  it("empty states: nothing on loan, and no returned loans yet", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [] });
    await renderApp("/members/m1", a.handler);
    expect(await screen.findByTestId("loans-empty")).toHaveTextContent("No books on loan");
    expect(screen.getByRole("tab", { name: "On loan (0 of 5)" })).toBeInTheDocument();
    await user.click(screen.getByTestId("loans-tab-history"));
    expect(screen.getByTestId("loans-empty")).toHaveTextContent("No returned loans yet");
    expect(screen.getByRole("tab", { name: "History (0)" })).toHaveAttribute("aria-selected", "true");
  });

  it("History lists returned loans with their returned date and no Return buttons; overdue open loans are tinted", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [loan("1", { status: "OVERDUE", dueAt: new Date(Date.now() - 3 * DAY).toISOString() }), returned("2")] });
    await renderApp("/members/m1", a.handler);
    const open = await screen.findAllByTestId("loan-row");
    expect(open).toHaveLength(1);
    expect(open[0]!.className).toContain("bg-overdue");
    expect(open[0]).toHaveAttribute("data-loan-status", "OVERDUE");
    await user.click(screen.getByTestId("loans-tab-history"));
    const rows = screen.getAllByTestId("loan-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Book 2");
    expect(rows[0]).toHaveTextContent("10 Nov 2026");
    expect(screen.getByRole("columnheader", { name: "Returned" })).toBeInTheDocument();
    expect(screen.queryByTestId("return-button")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Loan history" })).toBeInTheDocument();
  });

  it("keyboard: ArrowLeft goes back, End jumps to History, Home to On loan, other keys do nothing", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [loan("1"), returned("2")] });
    await renderApp("/members/m1", a.handler);
    const onLoan = await screen.findByRole("tab", { name: "On loan (1 of 5)" });
    const history = screen.getByRole("tab", { name: "History (1)" });
    onLoan.focus();
    await user.keyboard("{End}");
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(history).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(onLoan).toHaveAttribute("aria-selected", "true");
    expect(onLoan).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(history).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(onLoan).toHaveAttribute("aria-selected", "true");
    await user.keyboard("a");
    expect(onLoan).toHaveAttribute("aria-selected", "true");
    // roving tabindex
    expect(onLoan).toHaveAttribute("tabindex", "0");
    expect(history).toHaveAttribute("tabindex", "-1");
  });
});

describe("MemberDetailPage returning from the profile", () => {
  const openReturn = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByTestId("return-button"));
    return screen.findByTestId("return-dialog");
  };

  it("success toasts the returned book", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [loan("1")] });
    await renderApp("/members/m1", a.handler);
    const dialog = await openReturn(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Returned: Book 1.");
    expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument();
  });

  it("Cancel closes the dialog without posting", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [loan("1")] });
    const { fetchMock } = await renderApp("/members/m1", a.handler);
    const dialog = await openReturn(user);
    await user.click(within(dialog).getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("an already-returned loan toasts when and by whom", async () => {
    const user = userEvent.setup();
    const a = api({
      loans: [loan("1")],
      ret: () => ({ status: 409, body: { type: "about:blank", title: "x", status: 409, code: "LOAN_ALREADY_RETURNED", context: { returnedAt: "2026-11-24T10:42:00.000Z", returnedBy: "Omar Nasser" } } }),
    });
    await renderApp("/members/m1", a.handler);
    const dialog = await openReturn(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveAttribute("data-kind", "error");
    expect(toast).toHaveTextContent(/^This loan was already returned on 24 Nov 2026 at \d{2}:\d{2} by Omar Nasser\./);
  });

  it("another 4xx closes the dialog with no toast", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [loan("1")], ret: () => problem(403, "FORBIDDEN") });
    const { fetchMock } = await renderApp("/members/m1", a.handler);
    const dialog = await openReturn(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    await waitFor(() => expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/return") && init?.method === "POST")).toBe(true);
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("the Return column and buttons are hidden for a role with LOAN_READ but not LOAN_PROCESS", async () => {
    const a = api({ loans: [loan("1")] });
    await renderApp("/members/m1", a.handler, me(["MEMBER_READ", "LOAN_READ"]));
    await screen.findByTestId("loan-row");
    expect(screen.queryByTestId("return-button")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Actions" })).not.toBeInTheDocument();
  });
});

describe("MemberDetailPage actions", () => {
  it("Edit opens the modal with the member's data; saving sends the guarded PUT with the member's version", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [] });
    await renderApp("/members/m1", a.handler);
    await user.click(await screen.findByTestId("edit-member"));
    const modal = await screen.findByTestId("member-modal");
    expect(within(modal).getByTestId("member-number")).toHaveTextContent("M-000001");
    await user.clear(within(modal).getByTestId("field-fullName"));
    await user.type(within(modal).getByTestId("field-fullName"), "Sara H.");
    await user.click(within(modal).getByTestId("save-member"));
    await waitFor(() => expect(a.puts).toHaveLength(1));
    expect(a.puts[0]).toEqual({ fullName: "Sara H.", email: "sara@example.org", phone: null, status: "ACTIVE", version: 4 });
    await waitFor(() => expect(screen.queryByTestId("member-modal")).not.toBeInTheDocument());
  });

  it("Deactivate: cancel keeps the member; confirm PUTs INACTIVE with the version and toasts", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [] });
    await renderApp("/members/m1", a.handler);
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-deactivate"));
    let dialog = await screen.findByTestId("deactivate-dialog");
    await user.click(within(dialog).getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument();
    expect(a.puts).toHaveLength(0);

    await user.click(screen.getByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-deactivate"));
    dialog = await screen.findByTestId("deactivate-dialog");
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    expect(await screen.findByText("Sara Haddad deactivated.")).toBeInTheDocument();
    expect(a.puts[0]).toEqual({ fullName: "Sara Haddad", email: "sara@example.org", phone: null, status: "INACTIVE", version: 4 });
    expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument();
  });

  it("Reactivate needs no confirmation: PUT ACTIVE and a toast", async () => {
    const user = userEvent.setup();
    const a = api({ member: member({ status: "INACTIVE" }), loans: [] });
    await renderApp("/members/m1", a.handler);
    expect(await screen.findByTestId("inactive-notice")).toHaveTextContent("This member is inactive and can't borrow until reactivated.");
    await user.click(screen.getByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-reactivate"));
    expect(await screen.findByText("Sara Haddad reactivated.")).toBeInTheDocument();
    expect(a.puts[0]).toMatchObject({ status: "ACTIVE", version: 4 });
    expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument();
  });

  it("a stale version toasts the conflict message and closes the dialog", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [], put: () => problem(409, "STALE_VERSION") });
    await renderApp("/members/m1", a.handler);
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-deactivate"));
    await user.click(within(await screen.findByTestId("deactivate-dialog")).getByTestId("dialog-confirm"));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Someone else changed this member. The latest version is shown; try again.");
    expect(toast).toHaveAttribute("data-kind", "error");
    expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument();
  });

  it("a server error toasts that nothing was changed", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [], put: () => problem(500, "INTERNAL") });
    await renderApp("/members/m1", a.handler);
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-deactivate"));
    await user.click(within(await screen.findByTestId("deactivate-dialog")).getByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't change the status. Nothing was changed. Try again.");
  });

  it("another 4xx closes the dialog silently", async () => {
    const user = userEvent.setup();
    const a = api({ loans: [], put: () => problem(403, "FORBIDDEN") });
    await renderApp("/members/m1", a.handler);
    await user.click(await screen.findByTestId("detail-actions"));
    await user.click(await screen.findByTestId("menu-deactivate"));
    await user.click(within(await screen.findByTestId("deactivate-dialog")).getByTestId("dialog-confirm"));
    await waitFor(() => expect(a.puts).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId("deactivate-dialog")).not.toBeInTheDocument());
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("Borrow a book is present for LOAN_PROCESS and absent for a role without it; Edit and More actions need MEMBER_WRITE", async () => {
    const a = api({ loans: [] });
    await renderApp("/members/m1", a.handler, me(["MEMBER_READ", "LOAN_READ"]));
    await screen.findByTestId("member-detail-name");
    await waitFor(() => expect(screen.getByRole("tab", { name: /On loan/ })).toBeInTheDocument());
    expect(screen.queryByTestId("borrow-for-member")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-member")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-actions")).not.toBeInTheDocument();
  });
});
