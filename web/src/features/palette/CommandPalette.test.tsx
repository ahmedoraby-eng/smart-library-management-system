// @vitest-environment jsdom
import type { BookDto, Me, MemberDto } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { librarian, page, renderApp } from "../circulation/testApp";
import { matches } from "./CommandPalette";

afterEach(() => vi.unstubAllGlobals());

const BOOK_ID = "0b6f7c8e-1d2a-4b3c-9d4e-5f6a7b8c9d0e";
const MEMBER_ID = "1c7a8d9e-2e3b-4c4d-8e5f-6a7b8c9d0e1f";
const INACTIVE_ID = "3e9c0f1a-4a5d-4e6f-8a7b-8c9d0e1f2a3b";

const supervisor: Me = {
  ...librarian,
  id: "s2",
  fullName: "Sam Supervisor",
  role: "SUPERVISOR",
  permissions: [...ROLE_PERMISSIONS.SUPERVISOR],
};

const member = (patch: Partial<MemberDto> = {}): MemberDto => ({
  id: MEMBER_ID,
  memberNumber: "M-000142",
  fullName: "Sara Haddad",
  email: "sara.haddad@example.com",
  phone: null,
  status: "ACTIVE",
  registeredAt: "2026-01-01T00:00:00.000Z",
  activeLoans: 1,
  overdueLoans: 0,
  version: 0,
  ...patch,
});
const book = (patch: Partial<BookDto> = {}): BookDto => ({
  id: BOOK_ID,
  title: "Sara's Garden",
  author: "Martin Kleppmann",
  isbn: "9781449373320",
  description: "",
  category: "Data",
  publisher: "",
  publicationYear: 2017,
  coverImageUrl: null,
  totalCopies: 4,
  availableCopies: 1,
  activeLoans: 3,
  nextDueAt: null,
  hasLoanHistory: true,
  archived: false,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...patch,
});

/** Members and books answer any ?q= with the same hits; the member detail feeds the Borrow page prefill. */
function handler({ url }: { url: URL }) {
  if (url.pathname === "/api/members")
    return { body: page([member(), member({ id: INACTIVE_ID, fullName: "Sara Inactive", status: "INACTIVE" })]) };
  if (url.pathname === "/api/books") return { body: page([book()]) };
  if (url.pathname === `/api/members/${MEMBER_ID}`) return { body: member() };
  if (url.pathname === "/api/loans") return { body: page([]) };
  return undefined;
}

async function openApp(me: Me = librarian, url = "/dashboard") {
  const user = userEvent.setup();
  const app = await renderApp(url, handler, me);
  await screen.findByTestId("palette-trigger");
  return { user, ...app };
}

const optionLabels = () =>
  within(screen.getByTestId("command-palette"))
    .queryAllByTestId("palette-option")
    .map((o) => o.querySelector(".font-medium")?.textContent);
const selected = () =>
  within(screen.getByTestId("command-palette"))
    .getAllByRole("option")
    .find((o) => o.getAttribute("aria-selected") === "true");

describe("SLM-20 command palette", () => {
  it("⌘K opens it with focus in the search box; Esc closes it and gives focus back", async () => {
    const { user } = await openApp();
    const trigger = screen.getByTestId("palette-trigger");
    trigger.focus();
    await user.keyboard("{Meta>}k{/Meta}");
    const dialog = await screen.findByRole("dialog", { name: "Search and actions" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const input = within(dialog).getByRole("combobox");
    expect(input).toHaveFocus();
    // Tab stays inside (focus trap).
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("Ctrl K opens it too and toggles it closed; the sidebar trigger and a click outside work as well", async () => {
    const { user } = await openApp();
    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("palette-trigger"));
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("command-palette"));
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("palette-scrim"));
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("leaves ⌘K alone when a field already handled it, and with Shift or another dialog open", async () => {
    const { user } = await openApp();
    const used = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener("keydown", used, { capture: true });
    await user.keyboard("{Meta>}k{/Meta}");
    document.removeEventListener("keydown", used, { capture: true });
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    await user.keyboard("{Meta>}{Shift>}k{/Shift}{/Meta}");
    await user.keyboard("k");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.setAttribute("aria-modal", "true");
    document.body.appendChild(other);
    await user.keyboard("{Meta>}k{/Meta}");
    other.remove();
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("is not on the sign-in page (only the signed-in shell mounts it)", async () => {
    const user = userEvent.setup();
    // Not signed in: /api/me answers 401, so sign-in stays put.
    const { router } = await renderApp("/signin", ({ url }) =>
      url.pathname === "/api/me"
        ? { status: 401, body: { type: "about:blank", title: "u", status: 401, code: "UNAUTHENTICATED" } }
        : undefined,
    );
    await screen.findByTestId("signin-email");
    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    expect(screen.queryByTestId("palette-trigger")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/signin");
  });

  it("Librarian: every action, including the write ones; the query filters them", async () => {
    const { user } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    expect(optionLabels()).toEqual([
      "Dashboard",
      "Borrow a book",
      "Return a book",
      "Add book",
      "Loan history · Overdue",
      "Loan history",
      "Books",
      "Members",
      "Book discovery",
    ]);
    await user.type(screen.getByTestId("palette-input"), "book");
    expect(optionLabels()).toEqual(["Borrow a book", "Return a book", "Add book", "Books", "Book discovery"]);
  });

  it("Supervisor: no write actions and no 'Borrow for', but still finds members and books", async () => {
    const { user, fetchMock } = await openApp(supervisor);
    await user.keyboard("{Meta>}k{/Meta}");
    expect(optionLabels()).toEqual([
      "Dashboard",
      "Loan history · Overdue",
      "Loan history",
      "Books",
      "Members",
      "Book discovery",
    ]);
    await user.type(screen.getByTestId("palette-input"), "sara");
    await screen.findByText("Sara's Garden");
    expect(optionLabels()).toEqual(["Sara Haddad", "Sara Inactive", "Sara's Garden"]);
    expect(optionLabels().some((l) => l?.startsWith("Borrow"))).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/members?q=sara"))).toBe(true);
  });

  it("Admin also sees Staff users", async () => {
    const { user } = await openApp({ ...librarian, role: "ADMIN", permissions: [...ROLE_PERMISSIONS.ADMIN] });
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("palette-input"), "staff");
    expect(optionLabels()).toEqual(["Staff users"]);
  });

  it("searches books and members as you type (debounced) and groups the hits", async () => {
    const { user, fetchMock } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("palette-input"), "sara");
    await screen.findByText("Sara's Garden");
    // One request per settled query, not one per keystroke.
    const searches = fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => /\/api\/(members|books)\?/.test(u));
    expect(searches.sort()).toEqual(["/api/books?q=sara&size=8", "/api/members?q=sara&size=8"]);
    // Borrow for: active members only, first in the list.
    expect(optionLabels()).toEqual(["Borrow for Sara Haddad", "Sara Haddad", "Sara Inactive", "Sara's Garden"]);
    const groups = within(screen.getByTestId("command-palette")).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-labelledby") && g.firstElementChild?.textContent)).toEqual([
      "Actions",
      "Members",
      "Books",
    ]);
    expect(screen.getByTestId("availability-badge")).toHaveTextContent("1 of 4");
  });

  it("says so when nothing matches", async () => {
    const { user, fetchMock } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    fetchReturnsEmpty(fetchMock);
    await user.type(screen.getByTestId("palette-input"), "zzz");
    expect(await screen.findByTestId("palette-empty")).toHaveTextContent("No matches");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("↑↓ move the highlight (aria-activedescendant, wrapping) and Enter opens the highlighted book", async () => {
    const { user, router } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("palette-input"), "sara");
    await screen.findByText("Sara's Garden");
    const input = screen.getByRole("combobox");
    expect(selected()).toHaveTextContent("Borrow for Sara Haddad");
    expect(input).toHaveAttribute("aria-activedescendant", selected()!.id);
    await user.keyboard("{ArrowUp}");
    expect(selected()).toHaveTextContent("Sara's Garden");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected()).toHaveTextContent("Sara Haddad");
    expect(selected()).not.toHaveTextContent("Borrow");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", selected()!.id);
    expect(selected()).toHaveTextContent("Sara's Garden");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe(`/books/${BOOK_ID}`));
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("a member hit opens the member page; hovering moves the highlight", async () => {
    const { user, router } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("palette-input"), "sara");
    const hit = (await screen.findAllByTestId("palette-option")).find((o) => o.textContent?.startsWith("Sara Haddad"))!;
    await user.hover(hit);
    expect(hit).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(hit);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/members/${MEMBER_ID}`));
  });

  it("'Borrow for <member>' opens the Borrow page with that member already picked", async () => {
    const { user, router } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("palette-input"), "sara");
    await screen.findByText("Borrow for Sara Haddad");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/circulation/borrow"));
    expect(router.state.location.search).toEqual({ member: MEMBER_ID });
    expect(await screen.findByTestId("picked-member")).toHaveTextContent("Sara Haddad");
  });

  it("'overdue' → Loan history filtered to overdue loans", async () => {
    const { user, router } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(screen.getByTestId("palette-input"), "overdue");
    await waitFor(() => expect(selected()).toHaveTextContent("Loan history · Overdue"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/loans"));
    expect(router.state.location.search).toMatchObject({ status: "OVERDUE" });
    expect(await screen.findByTestId("filter-status")).toHaveValue("OVERDUE");
  });

  it("each static action goes to its page", async () => {
    const { user, router } = await openApp({ ...librarian, role: "ADMIN", permissions: [...ROLE_PERMISSIONS.ADMIN] });
    const cases: [string, string][] = [
      ["Return a book", "/circulation/return"],
      ["Add book", "/books/new"],
      ["Book discovery", "/discover"],
      ["Staff users", "/admin/users"],
      ["Members", "/members"],
      ["Books", "/books"],
      ["Loan history", "/loans"],
      ["Borrow a book", "/circulation/borrow"],
      ["Dashboard", "/dashboard"],
    ];
    for (const [label, path] of cases) {
      await user.keyboard("{Meta>}k{/Meta}");
      const option = (await screen.findAllByTestId("palette-option")).find(
        (o) => o.querySelector(".font-medium")?.textContent === label,
      )!;
      fireEvent.mouseDown(option);
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
    }
  });

  it("Enter with nothing to open does nothing", async () => {
    const { user, router, fetchMock } = await openApp();
    await user.keyboard("{Meta>}k{/Meta}");
    fetchReturnsEmpty(fetchMock);
    await user.type(screen.getByTestId("palette-input"), "zzz");
    await screen.findByTestId("palette-empty");
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(router.state.location.pathname).toBe("/dashboard");
    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
  });
});

describe("matches", () => {
  it("needs every word, in any order, case-insensitive", () => {
    expect(matches("", "Anything")).toBe(true);
    expect(matches("history OVER", "Loan history · Overdue")).toBe(true);
    expect(matches("loan add", "Add book")).toBe(false);
  });
});

/** From now on members and books answer with no hits. */
function fetchReturnsEmpty(fetchMock: Awaited<ReturnType<typeof renderApp>>["fetchMock"]) {
  const original = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const u = new URL(input, "http://localhost");
    if (u.pathname === "/api/members" || u.pathname === "/api/books")
      return new Response(JSON.stringify(page([])), { status: 200, headers: { "content-type": "application/json" } });
    return original(input, init);
  });
}
