// @vitest-environment jsdom
import type { LoanDto, Me } from "@slm/contracts";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { librarian, renderApp } from "./testApp";

afterEach(() => vi.unstubAllGlobals());

const DAY = 86_400_000;
const overdueLoan = (id: string, daysOver: number, member: string, title: string): LoanDto => ({
  id,
  status: "OVERDUE",
  book: { id: `0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0${id.slice(-1)}`, title, author: "A" },
  member: { id: `1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1${id.slice(-1)}`, memberNumber: "M-000142", fullName: member },
  processedBy: { id: "s1", name: "Layla Librarian" },
  returnedBy: null,
  borrowedAt: "2026-10-01T10:00:00.000Z",
  dueAt: new Date(Date.now() - daysOver * DAY - 60_000).toISOString(),
  returnedAt: null,
});
const three = [
  overdueLoan("l1", 9, "Ann Atef", "Dune"),
  overdueLoan("l2", 3, "Ben Bassem", "Emma"),
  overdueLoan("l3", 1, "Cat Chen", "Ulysses"),
];

/** Answers the bell's query (status=OVERDUE&size=5) with `items` and `total`; everything else is unhandled (404). */
const bell =
  (items: LoanDto[], total = items.length, status = 200) =>
  ({ url }: { url: URL }) =>
    url.pathname === "/api/loans" &&
    url.searchParams.get("status") === "OVERDUE" &&
    url.searchParams.get("size") === "5"
      ? status === 200
        ? { body: { items, page: 1, size: 5, total } }
        : { status, body: { type: "about:blank", title: "x", status, code: "INTERNAL" } }
      : undefined;

describe("SLM-18 overdue bell", () => {
  it("shows the overdue count as a badge and in its accessible name; caps the badge at 99+", async () => {
    await renderApp("/dashboard", bell(three, 7));
    const button = await screen.findByRole("button", { name: "Overdue loans: 7" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(within(button).getByTestId("overdue-count")).toHaveTextContent(/^7$/);
  });

  it("caps the badge at 99+", async () => {
    await renderApp("/dashboard", bell(three, 140));
    expect(await screen.findByTestId("overdue-count")).toHaveTextContent("99+");
    expect(screen.getByTestId("overdue-bell")).toHaveAccessibleName("Overdue loans: 140");
  });

  it("zero overdue: no badge; the popover says so and offers no list", async () => {
    const user = userEvent.setup();
    await renderApp("/dashboard", bell([]));
    const button = await screen.findByRole("button", { name: "Overdue loans: none" });
    expect(screen.queryByTestId("overdue-count")).not.toBeInTheDocument();
    await user.click(button);
    expect(await screen.findByTestId("overdue-none")).toHaveTextContent("No overdue loans.");
    expect(screen.queryByTestId("overdue-view-all")).not.toBeInTheDocument();
  });

  it("opens a dialog listing the most overdue first (member, title, days overdue) with links scoped to each loan, and View all", async () => {
    const user = userEvent.setup();
    await renderApp("/dashboard", bell(three, 7));
    await user.click(await screen.findByRole("button", { name: "Overdue loans: 7" }));
    const dialog = screen.getByRole("dialog", { name: "Overdue loans" });
    expect(dialog).toHaveTextContent("Overdue loans (7)");
    expect(screen.getByTestId("overdue-bell")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("overdue-bell")).toHaveAttribute("aria-controls", dialog.id);
    const items = within(dialog).getAllByTestId("overdue-item");
    expect(items.map((i) => i.textContent)).toEqual([
      "Ann AtefDune9 days overdue",
      "Ben BassemEmma3 days overdue",
      "Cat ChenUlysses1 day overdue",
    ]);
    const href = new URL(items[0]!.getAttribute("href")!, "http://x");
    expect(href.pathname).toBe("/loans");
    expect(href.searchParams.get("status")).toBe("OVERDUE");
    expect(href.searchParams.get("memberId")).toBe(three[0]!.member.id);
    expect(href.searchParams.get("bookId")).toBe(three[0]!.book.id);
    const all = new URL(within(dialog).getByTestId("overdue-view-all").getAttribute("href")!, "http://x");
    expect(all.pathname).toBe("/loans");
    expect(all.searchParams.get("status")).toBe("OVERDUE");
    expect(all.searchParams.get("memberId")).toBeNull();
  });

  it("keyboard: focus goes to the first item, arrows move, Esc closes and returns focus to the bell", async () => {
    const user = userEvent.setup();
    await renderApp("/dashboard", bell(three));
    const button = await screen.findByRole("button", { name: "Overdue loans: 3" });
    button.focus();
    await user.keyboard("{Enter}");
    const items = await screen.findAllByTestId("overdue-item");
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByTestId("overdue-view-all")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("overdue-popover")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("choosing a loan opens Loan history scoped to it and closes the popover", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/dashboard", bell(three));
    await user.click(await screen.findByTestId("overdue-bell"));
    await user.click(screen.getAllByTestId("overdue-item")[1]!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/loans"));
    expect(router.state.location.search).toMatchObject({
      status: "OVERDUE",
      memberId: three[1]!.member.id,
      bookId: three[1]!.book.id,
    });
    expect(screen.queryByTestId("overdue-popover")).not.toBeInTheDocument();
  });

  it("a click outside or tabbing out closes it; the bell toggles it", async () => {
    const user = userEvent.setup();
    await renderApp("/dashboard", bell(three));
    const button = await screen.findByTestId("overdue-bell");
    await user.click(button);
    expect(screen.getByTestId("overdue-popover")).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByTestId("overdue-popover")).not.toBeInTheDocument();

    await user.click(button);
    fireEvent.mouseDown(screen.getByTestId("main"));
    expect(screen.queryByTestId("overdue-popover")).not.toBeInTheDocument();

    await user.click(button);
    const inside = screen.getAllByTestId("overdue-item")[0]!;
    // Focus moving inside keeps it open; focus leaving the bell's box closes it.
    act(() => inside.focus());
    fireEvent.blur(inside, { relatedTarget: screen.getAllByTestId("overdue-item")[1] });
    expect(screen.getByTestId("overdue-popover")).toBeInTheDocument();
    fireEvent.blur(inside, { relatedTarget: screen.getByTestId("theme-toggle") });
    expect(screen.queryByTestId("overdue-popover")).not.toBeInTheDocument();
  });

  it("a failed load says so inside the popover", async () => {
    const user = userEvent.setup();
    await renderApp("/dashboard", bell([], 0, 500));
    const button = await screen.findByRole("button", { name: "Overdue loans" });
    await user.click(button);
    expect(await screen.findByTestId("overdue-error")).toHaveTextContent("Couldn't load overdue loans.");
  });

  it("D-46-1 regression: the bell sits in the top bar (no layout shift on the page); its own box is relative only, so the popover anchors to it", async () => {
    await renderApp("/dashboard", bell(three));
    const slot = await screen.findByTestId("overdue-bell-slot");
    expect(screen.getByTestId("top-bar")).toContainElement(slot);
    const box = screen.getByTestId("overdue-bell").parentElement!;
    expect(slot).toContainElement(box);
    expect(box.className).toBe("relative");
  });

  it("a role without LOAN_READ sees no bell", async () => {
    const noLoans: Me = { ...librarian, permissions: librarian.permissions.filter((p) => p !== "LOAN_READ") };
    await renderApp("/dashboard", bell(three), noLoans);
    await screen.findByTestId("main");
    expect(screen.queryByTestId("overdue-bell")).not.toBeInTheDocument();
  });
});
