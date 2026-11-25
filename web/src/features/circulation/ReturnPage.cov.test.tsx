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
  id, status: "ACTIVE",
  book: { id: BOOK_ID, title: "Clean Code", author: "Robert C. Martin" },
  member: { id: MEMBER_ID, memberNumber: "M-000142", fullName: "Sara Haddad" },
  processedBy: { id: "s1", name: "Layla Librarian" }, returnedBy: null,
  borrowedAt: "2026-11-01T10:00:00.000Z", dueAt: new Date(Date.now() + 5 * DAY).toISOString(), returnedAt: null, ...patch,
});
const problem = (status: number, code: string, detail?: string, context?: Record<string, unknown>) => ({
  status, body: { type: "about:blank", title: code, status, code, ...(detail ? { detail } : {}), ...(context ? { context } : {}) },
});

type Req = { method: string; url: URL; body: unknown };

describe("ReturnPage list states", () => {
  it("a failed load shows the error with Try again, which reloads the list", async () => {
    const user = userEvent.setup();
    let calls = 0;
    await renderApp("/circulation/return", ({ method, url }) => {
      if (url.pathname === "/api/loans" && method === "GET" && url.searchParams.get("size") === "20") {
        return ++calls === 1 ? problem(500, "INTERNAL") : { body: page([loan("l1")]) };
      }
      return undefined;
    });
    const alert = await screen.findByTestId("loans-error");
    expect(alert).toHaveTextContent("Couldn't load active loans. Check your connection and try again.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("loan-row")).toBeInTheDocument();
    expect(screen.queryByTestId("loans-error")).not.toBeInTheDocument();
  });

  it("overdue rows are tinted, the due date is emphasised, and the borrowed and due dates are shown", async () => {
    await renderApp("/circulation/return", ({ url }) =>
      url.pathname === "/api/loans" ? { body: page([loan("l1", { status: "OVERDUE", dueAt: new Date(Date.now() - 2 * DAY - 1000).toISOString() }), loan("l2")]) } : undefined);
    const rows = await screen.findAllByTestId("loan-row");
    expect(rows[0]!.className).toContain("bg-overdue");
    expect(rows[1]!.className).not.toContain("bg-overdue");
    expect(rows[0]).toHaveTextContent("1 Nov 2026");
    expect(rows[0]).toHaveTextContent("M-000142");
    expect(within(rows[1]!).getByTestId("loan-status")).toHaveTextContent("Active");
  });

  it("more than one page: shows the range and Next/Previous move the URL page", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/circulation/return", ({ url }) => {
      if (url.pathname !== "/api/loans") return undefined;
      const p = Number(url.searchParams.get("page") ?? 1);
      return { body: { items: [loan(`p${p}`)], page: p, size: 20, total: 45 } };
    });
    await screen.findByTestId("loan-row");
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 1–20 of 45");
    await user.click(screen.getByTestId("page-next"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "2" }));
    await waitFor(() => expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 21–40 of 45"));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("page=2"))).toBe(true);
    await user.click(screen.getByTestId("page-prev"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "1" }));
  });
});

describe("ReturnPage search", () => {
  it("typing narrows the list through the URL after a pause; no match → filtered empty state with Clear search and a Loan history link", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/circulation/return", ({ url }) => {
      if (url.pathname !== "/api/loans") return undefined;
      return { body: page(url.searchParams.get("q") === "zzz" ? [] : [loan("l1")]) };
    });
    await screen.findByTestId("loan-row");
    await user.type(screen.getByTestId("return-search"), "zzz");
    const empty = await screen.findByTestId("return-empty-filtered");
    expect(empty).toHaveTextContent("No active loans match “zzz”");
    expect(empty).toHaveTextContent("Check Loan history for returned books.");
    expect(router.state.location.search).toMatchObject({ q: "zzz", page: "1" });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("q=zzz"))).toBe(true);
    expect(within(empty).getByRole("link", { name: "Open Loan history" })).toHaveAttribute("href", "/loans");

    await user.click(within(empty).getByRole("button", { name: "Clear search" }));
    expect(await screen.findByTestId("loan-row")).toBeInTheDocument();
    expect(screen.getByTestId("return-search")).toHaveValue("");
    expect(router.state.location.search.q).toBeUndefined();
  });

  it("clearing the box removes q from the URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/circulation/return?q=clean", ({ url }) =>
      url.pathname === "/api/loans" ? { body: page([loan("l1")]) } : undefined);
    await screen.findByTestId("loan-row");
    expect(screen.getByTestId("return-search")).toHaveValue("clean");
    await user.clear(screen.getByTestId("return-search"));
    await waitFor(() => expect(router.state.location.search.q).toBeUndefined());
  });

  it("an exact member number that yields one loan focuses that loan's Return button (scanner flow)", async () => {
    await renderApp("/circulation/return?q=m-000142", ({ url }) =>
      url.pathname === "/api/loans" ? { body: page([loan("l1")]) } : undefined);
    const button = await screen.findByTestId("return-button");
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("an ISBN-shaped query that yields one loan focuses Return too", async () => {
    await renderApp("/circulation/return?q=978-0-13-235088-4", ({ url }) =>
      url.pathname === "/api/loans" ? { body: page([loan("l1")]) } : undefined);
    const button = await screen.findByTestId("return-button");
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("a free-text query with one match does not steal focus", async () => {
    await renderApp("/circulation/return?q=clean", ({ url }) =>
      url.pathname === "/api/loans" ? { body: page([loan("l1")]) } : undefined);
    const button = await screen.findByTestId("return-button");
    await waitFor(() => expect(screen.getByTestId("return-search")).toHaveFocus());
    expect(button).not.toHaveFocus();
  });

  it("an exact member number with several loans does not focus a button", async () => {
    await renderApp("/circulation/return?q=M-000142", ({ url }) =>
      url.pathname === "/api/loans" ? { body: page([loan("l1"), loan("l2")]) } : undefined);
    const buttons = await screen.findAllByTestId("return-button");
    for (const b of buttons) expect(b).not.toHaveFocus();
  });
});

describe("ReturnPage returning a book", () => {
  const stub = (returnHandler: (req: Req) => { status?: number; body: unknown } | undefined, bookBody?: unknown) => ({ method, url, body }: Req) => {
    if (url.pathname === "/api/loans" && method === "GET") return { body: page([loan("l1")]) };
    if (url.pathname === "/api/loans/l1/return") return returnHandler({ method, url, body });
    if (url.pathname === `/api/books/${BOOK_ID}`) return bookBody ? { body: bookBody } : problem(500, "INTERNAL");
    return undefined;
  };
  const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByTestId("return-button"));
    return screen.findByTestId("return-dialog");
  };

  it("Cancel closes the dialog and posts nothing", async () => {
    const user = userEvent.setup();
    const { fetchMock } = await renderApp("/circulation/return", stub(() => ({ body: loan("l1") })));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("when the book can't be read after the return, the toast still confirms the return (no copy count)", async () => {
    const user = userEvent.setup();
    await renderApp("/circulation/return", stub(() => ({ body: { ...loan("l1"), status: "RETURNED" } })));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent(/^Returned: Clean Code\.$/);
    expect(toast).toHaveAttribute("data-kind", "success");
  });

  it("a single-copy book reads '1 of 1 copy now available.'", async () => {
    const user = userEvent.setup();
    await renderApp("/circulation/return", stub(() => ({ body: loan("l1") }), { id: BOOK_ID, availableCopies: 1, totalCopies: 1 }));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Returned: Clean Code. 1 of 1 copy now available.");
  });

  it("404: toast says the loan no longer exists and the dialog closes", async () => {
    const user = userEvent.setup();
    await renderApp("/circulation/return", stub(() => problem(404, "NOT_FOUND")));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("This loan no longer exists. The list has been refreshed.");
    expect(toast).toHaveAttribute("data-kind", "error");
    expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument();
  });

  it("5xx: toast says nothing was saved", async () => {
    const user = userEvent.setup();
    await renderApp("/circulation/return", stub(() => problem(500, "INTERNAL")));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't record the return. Nothing was saved. Try again.");
  });

  it("any other 4xx closes the dialog without a toast", async () => {
    const user = userEvent.setup();
    const { fetchMock } = await renderApp("/circulation/return", stub(() => problem(403, "FORBIDDEN")));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    await waitFor(() => expect(screen.queryByTestId("return-dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/return") && init?.method === "POST")).toBe(true);
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("the row fades out (pointer events off) as soon as the return is accepted", async () => {
    const user = userEvent.setup();
    let returned = false;
    await renderApp("/circulation/return", ({ method, url }) => {
      if (url.pathname === "/api/loans" && method === "GET") return { body: page([loan("l1")]) };
      if (url.pathname === "/api/loans/l1/return") {
        returned = true;
        return { body: loan("l1") };
      }
      return undefined;
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("dialog-confirm"));
    await waitFor(() => expect(returned).toBe(true));
    await waitFor(() => expect(screen.getByTestId("loan-row").className).toContain("opacity-0"));
    expect(screen.getByTestId("loan-row").className).toContain("pointer-events-none");
  });
});
