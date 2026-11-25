// @vitest-environment jsdom
import type { MemberDto } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, renderApp } from "../circulation/testApp";

afterEach(() => vi.unstubAllGlobals());

const member = (id: string, patch: Partial<MemberDto> = {}): MemberDto => ({
  id,
  memberNumber: `M-${id.padStart(6, "0")}`,
  fullName: `Member ${id}`,
  email: `m${id}@example.org`,
  phone: null,
  status: "ACTIVE",
  registeredAt: "2026-01-05T00:00:00.000Z",
  activeLoans: 0,
  overdueLoans: 0,
  version: 0,
  ...patch,
});
const supervisor = {
  id: "s3",
  email: "sam@library.test",
  fullName: "Samir Supervisor",
  role: "SUPERVISOR" as const,
  permissions: [...ROLE_PERMISSIONS.SUPERVISOR],
  isDemo: false,
};
const problem = (status: number, code: string) => ({
  status,
  body: { type: "about:blank", title: code, status, code },
});
const list =
  (items: MemberDto[]) =>
  ({ url }: { url: URL }) =>
    url.pathname === "/api/members" ? { body: page(items) } : undefined;

describe("MembersPage list states", () => {
  it("no members at all: the empty state invites a Librarian to add the first one, and the button opens the modal", async () => {
    const user = userEvent.setup();
    await renderApp("/members", list([]));
    const empty = await screen.findByTestId("members-empty");
    expect(empty).toHaveTextContent("No members yet");
    expect(empty).toHaveTextContent("Add your first member to start lending.");
    expect(screen.getByTestId("result-line")).toHaveTextContent("0 active members");
    await user.click(within(empty).getByRole("button", { name: "Add member" }));
    expect(await screen.findByTestId("member-modal")).toBeInTheDocument();
  });

  it("no members at all, read-only role: the empty state has no Add button and a different text", async () => {
    await renderApp("/members", list([]), supervisor);
    const empty = await screen.findByTestId("members-empty");
    expect(empty).toHaveTextContent("Members added by the library team will show here.");
    expect(within(empty).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("add-member")).not.toBeInTheDocument();
  });

  it("a failed load shows the generic error; Try again reloads", async () => {
    const user = userEvent.setup();
    let calls = 0;
    await renderApp("/members", ({ url }) => {
      if (url.pathname !== "/api/members") return undefined;
      return ++calls === 1 ? problem(500, "INTERNAL") : { body: page([member("1")]) };
    });
    const alert = await screen.findByTestId("members-error");
    expect(alert).toHaveTextContent("Couldn't load members. Check your connection and try again.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("members-table")).toBeInTheDocument();
  });

  it("a 400 from the API says the filters aren't valid", async () => {
    await renderApp("/members", ({ url }) =>
      url.pathname === "/api/members" ? problem(400, "VALIDATION_FAILED") : undefined,
    );
    expect(await screen.findByTestId("members-error")).toHaveTextContent(
      "These filters aren't valid. Clear them and try again.",
    );
  });

  it("rows show phone or a dash, loans count, overdue badge only when overdue, and the registered date", async () => {
    await renderApp(
      "/members",
      list([member("1", { phone: "+20 100 123 4567", activeLoans: 3, overdueLoans: 2 }), member("2")]),
    );
    const rows = await screen.findAllByTestId("member-row");
    expect(rows[0]).toHaveTextContent("+20 100 123 4567");
    expect(within(rows[0]!).getByTestId("active-loans")).toHaveTextContent("3");
    expect(within(rows[0]!).getByTestId("overdue-badge")).toHaveTextContent("2 overdue");
    expect(rows[0]).toHaveTextContent("5 Jan 2026");
    expect(rows[1]).toHaveTextContent("—");
    expect(within(rows[1]!).queryByTestId("overdue-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("result-line")).toHaveTextContent("2 active members");
  });

  it("a single active member reads '1 active member'", async () => {
    await renderApp("/members", list([member("1")]));
    await screen.findByTestId("members-table");
    expect(screen.getByTestId("result-line")).toHaveTextContent(/^1 active member$/);
  });
});

describe("MembersPage filters", () => {
  it("the Status filter asks the API for Inactive, then All, and back to Active (no status in the URL)", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/members", list([member("1", { status: "INACTIVE" })]));
    await screen.findByTestId("members-table");
    const lastStatus = () => {
      const calls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/members?"));
      return new URL(String(calls.at(-1)![0]), "http://x").searchParams.get("status");
    };
    expect(lastStatus()).toBe("ACTIVE");

    await user.selectOptions(screen.getByTestId("filter-status"), "INACTIVE");
    await waitFor(() => expect(lastStatus()).toBe("INACTIVE"));
    expect(router.state.location.search).toMatchObject({ status: "INACTIVE" });
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("1 inactive member"));

    await user.selectOptions(screen.getByTestId("filter-status"), "ALL");
    await waitFor(() => expect(lastStatus()).toBe("ALL"));
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("1 member"));
    expect(screen.getByTestId("result-line")).not.toHaveTextContent("inactive");

    await user.selectOptions(screen.getByTestId("filter-status"), "ACTIVE");
    await waitFor(() => expect(router.state.location.search.status).toBeUndefined());
    await waitFor(() => expect(lastStatus()).toBe("ACTIVE"));
  });

  it("typing in the search box pushes q to the URL after a pause and the result line says how many match", async () => {
    const user = userEvent.setup();
    const { router, fetchMock } = await renderApp("/members?page=2", list([member("1")]));
    await screen.findByTestId("members-table");
    await user.type(screen.getByTestId("member-search"), "sara");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: "sara", page: "1" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("q=sara"))).toBe(true));
    await waitFor(() => expect(screen.getByTestId("result-line")).toHaveTextContent("1 member matches “sara”"));
  });

  it("several matches read '2 members match “x”'", async () => {
    await renderApp("/members?q=x", list([member("1"), member("2")]));
    await screen.findByTestId("members-table");
    expect(screen.getByTestId("result-line")).toHaveTextContent("2 members match “x”");
  });

  it("emptying the search box removes q from the URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/members?q=sara", list([member("1")]));
    await screen.findByTestId("members-table");
    expect(screen.getByTestId("member-search")).toHaveValue("sara");
    await user.clear(screen.getByTestId("member-search"));
    await waitFor(() => expect(router.state.location.search.q).toBeUndefined());
  });

  it("Clear filters in the header resets text, status and URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/members?q=sara&status=INACTIVE", list([member("1")]));
    await screen.findByTestId("members-table");
    await user.click(screen.getByTestId("clear-filters"));
    await waitFor(() => expect(screen.getByTestId("member-search")).toHaveValue(""));
    expect(router.state.location.search.q).toBeUndefined();
    expect(router.state.location.search.status).toBeUndefined();
    expect(screen.getByTestId("filter-status")).toHaveValue("ACTIVE");
    await waitFor(() => expect(screen.queryByTestId("clear-filters")).not.toBeInTheDocument());
  });

  it("a search with no match: the empty state names the text and Clear filters brings the list back", async () => {
    const user = userEvent.setup();
    await renderApp("/members?q=zzz", ({ url }) =>
      url.pathname === "/api/members"
        ? { body: page(url.searchParams.get("q") === "zzz" ? [] : [member("1")]) }
        : undefined,
    );
    const empty = await screen.findByTestId("members-empty-filtered");
    expect(empty).toHaveTextContent("No members match “zzz”");
    expect(empty).toHaveTextContent("Check the spelling or clear the filters.");
    await user.click(within(empty).getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByTestId("members-table")).toBeInTheDocument();
  });

  it("a status filter with no member says 'No members match these filters'", async () => {
    await renderApp("/members?status=INACTIVE", list([]));
    expect(await screen.findByTestId("members-empty-filtered")).toHaveTextContent("No members match these filters");
  });
});

describe("MembersPage sorting, paging and rows", () => {
  it("each sortable header sorts ascending first; the default column (name) flips to descending", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/members", list([member("1")]));
    await screen.findByTestId("members-table");
    expect(screen.getByTestId("sort-fullName").closest("th")).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByTestId("sort-fullName"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "-fullName" }));
    await user.click(screen.getByTestId("sort-memberNumber"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "memberNumber" }));
    await user.click(screen.getByTestId("sort-registeredAt"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: "registeredAt" }));
  });

  it("Next and Previous change the page", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/members", ({ url }) => {
      if (url.pathname !== "/api/members") return undefined;
      const p = Number(url.searchParams.get("page") ?? 1);
      return { body: { items: [member(`p${p}`)], page: p, size: 20, total: 45 } };
    });
    await screen.findByTestId("members-table");
    await user.click(screen.getByTestId("page-next"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "2" }));
    await waitFor(() => expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 21–40 of 45"));
    await user.click(screen.getByTestId("page-prev"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "1" }));
  });

  it("clicking a row (not its link) opens the member; clicking the name link also navigates, once", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/members", ({ url }) => {
      if (url.pathname === "/api/members") return { body: page([member("1"), member("2")]) };
      if (url.pathname.startsWith("/api/members/")) return { body: member(url.pathname.split("/").pop()!) };
      return undefined;
    });
    const rows = await screen.findAllByTestId("member-row");
    await user.click(within(rows[0]!).getByTestId("member-number-cell"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/members/1"));
    await router.navigate({ to: "/members" });
    const again = await screen.findAllByTestId("member-row");
    await user.click(within(again[1]!).getByTestId("member-name"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/members/2"));
  });

  it("the row menu has Edit for a Librarian; Edit opens the modal with that member; Cancel closes it", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/members", list([member("1", { fullName: "Sara Haddad" })]));
    await user.click(await screen.findByTestId("row-actions"));
    await user.click(await screen.findByTestId("menu-edit"));
    const modal = await screen.findByTestId("member-modal");
    expect(within(modal).getByRole("heading", { name: "Edit member" })).toBeInTheDocument();
    expect(within(modal).getByTestId("field-fullName")).toHaveValue("Sara Haddad");
    // opening the menu did not navigate away
    expect(router.state.location.pathname).toBe("/members");
    await user.click(within(modal).getByTestId("cancel-member"));
    expect(screen.queryByTestId("member-modal")).not.toBeInTheDocument();
  });

  it("the row has no actions menu for a role without MEMBER_WRITE", async () => {
    await renderApp("/members", list([member("1")]), supervisor);
    await screen.findByTestId("members-table");
    expect(screen.queryByTestId("row-actions")).not.toBeInTheDocument();
  });

  it("adding a member refreshes the list", async () => {
    const user = userEvent.setup();
    let added = false;
    const { fetchMock } = await renderApp("/members", ({ method, url }) => {
      if (url.pathname === "/api/members" && method === "POST") {
        added = true;
        return { status: 201, body: member("9", { fullName: "New Person" }) };
      }
      if (url.pathname === "/api/members")
        return { body: page(added ? [member("1"), member("9", { fullName: "New Person" })] : [member("1")]) };
      return undefined;
    });
    await screen.findByTestId("members-table");
    await user.click(screen.getByTestId("add-member"));
    await user.type(await screen.findByTestId("field-fullName"), "New Person");
    await user.type(screen.getByTestId("field-email"), "new@example.org");
    await user.click(screen.getByTestId("save-member"));
    await waitFor(() => expect(screen.getAllByTestId("member-row")).toHaveLength(2));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
    expect(screen.queryByTestId("member-modal")).not.toBeInTheDocument();
  });
});
