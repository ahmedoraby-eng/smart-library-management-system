// @vitest-environment jsdom
import type { Me, StaffUserDto } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, renderApp } from "../circulation/testApp";
import { DEMO_PROTECTED, OWN_ROLE, OWN_STATUS } from "./StaffUsersPage";

afterEach(() => vi.unstubAllGlobals());

const ADMIN: Me = { id: "s-admin", email: "amira@x.org", fullName: "Amira Admin", role: "ADMIN", isDemo: false, permissions: [...ROLE_PERMISSIONS.ADMIN] };
const staff = (patch: Partial<StaffUserDto>): StaffUserDto => ({
  id: "s1", email: "nadia@x.org", fullName: "Nadia Karim", role: "SUPERVISOR", status: "ACTIVE", isDemo: false, createdAt: "2026-11-08T10:00:00.000Z", ...patch,
});
const NADIA = staff({});
const OMAR = staff({ id: "s2", fullName: "Omar Nasser", email: "omar@x.org", role: "LIBRARIAN" });
const ZAKI = staff({ id: "s3", fullName: "Zaki Disabled", email: "zaki@x.org", role: "LIBRARIAN", status: "DISABLED" });
const problem = (status: number, code: string, detail?: string) => ({ status, body: { type: "about:blank", title: code, status, code, ...(detail ? { detail } : {}) } });

interface Setup {
  users?: StaffUserDto[];
  providers?: { google: boolean; demo: boolean } | "fail";
  put?: (id: string, body: unknown) => { status?: number; body: unknown } | undefined;
  reset?: () => { status?: number; body: unknown };
  listStatus?: () => { status?: number; body: unknown } | undefined;
}
function api(opts: Setup = {}) {
  const puts: { id: string; body: unknown }[] = [];
  const handler = ({ method, url, body }: { method: string; url: URL; body: unknown }) => {
    const p = url.pathname;
    if (p === "/api/auth/providers") return opts.providers === "fail" ? problem(404, "NOT_FOUND") : { body: opts.providers ?? { google: true, demo: false } };
    if (p === "/api/staff-users" && method === "GET") return opts.listStatus?.() ?? { body: page(opts.users ?? [NADIA, OMAR]) };
    if (p.startsWith("/api/staff-users/") && method === "PUT") {
      const id = p.split("/").pop()!;
      puts.push({ id, body });
      const custom = opts.put?.(id, body);
      if (custom) return custom;
      const base = [NADIA, OMAR, ZAKI].find((u) => u.id === id)!;
      return { body: { ...base, ...(body as object) } };
    }
    if (p === "/api/admin/reset-demo" && method === "POST") return opts.reset?.() ?? { body: { result: "reset" } };
    return undefined;
  };
  return { handler, puts };
}
const rowOf = async (name: string) => (await screen.findAllByTestId("staff-row")).find((r) => within(r).queryByText(name))!;

describe("StaffUsersPage list states", () => {
  it("a failed load shows the error; Try again reloads", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const a = api({ listStatus: () => (++calls === 1 ? problem(500, "INTERNAL") : undefined) });
    await renderApp("/admin/users", a.handler, ADMIN);
    const alert = await screen.findByTestId("staff-error");
    expect(alert).toHaveTextContent("Couldn't load staff users. Check your connection and try again.");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("staff-table")).toBeInTheDocument();
  });

  it("no staff yet: the empty state explains how people appear", async () => {
    const a = api({ users: [] });
    await renderApp("/admin/users", a.handler, ADMIN);
    const empty = await screen.findByTestId("staff-empty");
    expect(empty).toHaveTextContent("No staff users yet");
    expect(empty).toHaveTextContent("People appear here after their first Google sign-in.");
  });

  it("paging: Next and Previous move the URL page and show the range", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/admin/users", ({ url }) => {
      if (url.pathname === "/api/auth/providers") return { body: { google: true, demo: false } };
      if (url.pathname !== "/api/staff-users") return undefined;
      const p = Number(url.searchParams.get("page") ?? 1);
      return { body: { items: [staff({ id: `p${p}`, fullName: `Person ${p}` })], page: p, size: 20, total: 45 } };
    }, ADMIN);
    await screen.findByTestId("staff-table");
    expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 1–20 of 45");
    await user.click(screen.getByTestId("page-next"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "2" }));
    await waitFor(() => expect(screen.getByTestId("pagination-summary")).toHaveTextContent("Showing 21–40 of 45"));
    await user.click(screen.getByTestId("page-prev"));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "1" }));
  });

  it("a disabled account shows the Disabled badge and an Enable button instead of Disable", async () => {
    const a = api({ users: [NADIA, ZAKI] });
    await renderApp("/admin/users", a.handler, ADMIN);
    const zaki = await rowOf("Zaki Disabled");
    expect(within(zaki).getByTestId("staff-status")).toHaveTextContent("Disabled");
    expect(within(zaki).getByTestId("staff-status")).toHaveAttribute("data-status", "DISABLED");
    expect(within(zaki).getByTestId("enable-user")).toBeEnabled();
    expect(within(zaki).queryByTestId("disable-user")).not.toBeInTheDocument();
  });

  it("own row shows '(you)' and explains why Disable is off", async () => {
    const a = api({ users: [staff({ id: "s-admin", fullName: "Amira Admin", email: "amira@x.org", role: "ADMIN" }), NADIA] });
    await renderApp("/admin/users", a.handler, ADMIN);
    const own = await rowOf("Amira Admin");
    expect(own).toHaveTextContent("(you)");
    expect(within(own).getByTestId("disable-user")).toBeDisabled();
    const tips = within(own).getAllByTestId("control-tip").map((t) => t.getAttribute("title"));
    expect(tips).toEqual([OWN_ROLE, OWN_STATUS]);
    expect(within(await rowOf("Nadia Karim")).queryByText("(you)")).not.toBeInTheDocument();
  });

  it("a disabled demo account: Enable is off with the demo explanation", async () => {
    const a = api({ users: [staff({ id: "d1", fullName: "Demo Person", email: "d@demo.test", isDemo: true, status: "DISABLED" })] });
    await renderApp("/admin/users", a.handler, ADMIN);
    const row = await rowOf("Demo Person");
    expect(within(row).getByTestId("enable-user")).toBeDisabled();
    expect(within(row).getAllByTestId("control-tip").every((t) => t.getAttribute("title") === DEMO_PROTECTED)).toBe(true);
  });
});

describe("StaffUsersPage role and status changes", () => {
  it("promoting to Admin toasts 'is now an Admin.' (the right article)", async () => {
    const user = userEvent.setup();
    const a = api();
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.selectOptions(within(await rowOf("Nadia Karim")).getByTestId("role-select"), "ADMIN");
    expect(await screen.findByText("Nadia Karim is now an Admin.")).toBeInTheDocument();
    expect(a.puts).toEqual([{ id: "s1", body: { role: "ADMIN", status: "ACTIVE" } }]);
  });

  it("while the role change is saving the select shows the new role at once", async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const a = api();
    const { fetchMock } = await renderApp("/admin/users", a.handler, ADMIN);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === "PUT") await gate;
      return original(input, init);
    });
    const select = within(await rowOf("Nadia Karim")).getByTestId("role-select");
    await user.selectOptions(select, "LIBRARIAN");
    expect(select).toHaveValue("LIBRARIAN");
    expect(select).toBeDisabled();
    release();
    expect(await screen.findByText("Nadia Karim is now a Librarian.")).toBeInTheDocument();
  });

  it("a 409 with a server detail toasts that detail and the select reverts", async () => {
    const user = userEvent.setup();
    const a = api({ put: () => problem(409, "LAST_ADMIN", "At least one admin must remain.") });
    await renderApp("/admin/users", a.handler, ADMIN);
    const select = within(await rowOf("Nadia Karim")).getByTestId("role-select");
    await user.selectOptions(select, "LIBRARIAN");
    expect(await screen.findByTestId("toast")).toHaveTextContent("At least one admin must remain.");
    await waitFor(() => expect(select).toHaveValue("SUPERVISOR"));
  });

  it("any other failure toasts the generic message", async () => {
    const user = userEvent.setup();
    const a = api({ put: () => problem(500, "INTERNAL") });
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.selectOptions(within(await rowOf("Nadia Karim")).getByTestId("role-select"), "LIBRARIAN");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't save the change. Try again.");
  });

  it("a 409 without a detail also falls back to the generic message", async () => {
    const user = userEvent.setup();
    const a = api({ put: () => problem(409, "CONFLICT") });
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.selectOptions(within(await rowOf("Nadia Karim")).getByTestId("role-select"), "LIBRARIAN");
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't save the change. Try again.");
  });

  it("Enable sends status ACTIVE with the unchanged role and toasts 'is enabled.'", async () => {
    const user = userEvent.setup();
    const a = api({ users: [NADIA, ZAKI] });
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(within(await rowOf("Zaki Disabled")).getByTestId("enable-user"));
    expect(await screen.findByText("Zaki Disabled is enabled.")).toBeInTheDocument();
    expect(a.puts).toEqual([{ id: "s3", body: { role: "LIBRARIAN", status: "ACTIVE" } }]);
  });

  it("Enable that fails toasts the error", async () => {
    const user = userEvent.setup();
    const a = api({ users: [NADIA, ZAKI], put: () => problem(409, "PROTECTED_DEMO_ACCOUNT") });
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(within(await rowOf("Zaki Disabled")).getByTestId("enable-user"));
    expect(await screen.findByTestId("toast")).toHaveTextContent(DEMO_PROTECTED);
  });

  it("Disable: confirming sends DISABLED and toasts 'is disabled.'; the dialog closes", async () => {
    const user = userEvent.setup();
    const a = api();
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(within(await rowOf("Omar Nasser")).getByTestId("disable-user"));
    await user.click(within(await screen.findByTestId("disable-dialog")).getByTestId("dialog-confirm"));
    expect(await screen.findByText("Omar Nasser is disabled.")).toBeInTheDocument();
    expect(a.puts).toEqual([{ id: "s2", body: { role: "LIBRARIAN", status: "DISABLED" } }]);
    await waitFor(() => expect(screen.queryByTestId("disable-dialog")).not.toBeInTheDocument());
  });

  it("Disable: Cancel closes the dialog and sends nothing", async () => {
    const user = userEvent.setup();
    const a = api();
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(within(await rowOf("Omar Nasser")).getByTestId("disable-user"));
    await user.click(within(await screen.findByTestId("disable-dialog")).getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("disable-dialog")).not.toBeInTheDocument();
    expect(a.puts).toHaveLength(0);
  });

  it("Disable that the server refuses toasts the error and still closes the dialog", async () => {
    const user = userEvent.setup();
    const a = api({ put: () => problem(409, "LAST_ADMIN", "You can't disable the last admin.") });
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(within(await rowOf("Omar Nasser")).getByTestId("disable-user"));
    await user.click(within(await screen.findByTestId("disable-dialog")).getByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("You can't disable the last admin.");
    await waitFor(() => expect(screen.queryByTestId("disable-dialog")).not.toBeInTheDocument());
  });
});

describe("StaffUsersPage demo data reset", () => {
  it("is offered to an admin when demo sign-in is on; Cancel closes the dialog without posting", async () => {
    const user = userEvent.setup();
    const a = api({ providers: { google: true, demo: true } });
    const { fetchMock } = await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(await screen.findByTestId("reset-demo"));
    const dialog = await screen.findByTestId("reset-dialog");
    expect(dialog).toHaveTextContent("This also runs every night at 02:00 (Cairo).");
    await user.click(within(dialog).getByTestId("dialog-cancel"));
    expect(screen.queryByTestId("reset-dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("reset-demo"))).toBe(false);
  });

  it("a failed reset toasts the error and leaves the dialog open for another try", async () => {
    const user = userEvent.setup();
    const a = api({ providers: { google: true, demo: true }, reset: () => problem(500, "INTERNAL") });
    await renderApp("/admin/users", a.handler, ADMIN);
    await user.click(await screen.findByTestId("reset-demo"));
    await user.click(within(await screen.findByTestId("reset-dialog")).getByTestId("dialog-confirm"));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Couldn't reset demo data. Try again.");
    expect(screen.getByTestId("reset-dialog")).toBeInTheDocument();
  });

  it("a signed-in demo admin proves demo mode even when the providers endpoint is missing", async () => {
    const demoAdmin: Me = { ...ADMIN, isDemo: true };
    const a = api({ providers: "fail" });
    await renderApp("/admin/users", a.handler, demoAdmin);
    expect(await screen.findByTestId("reset-demo")).toBeInTheDocument();
  });

  it("is hidden when demo sign-in is off", async () => {
    const a = api({ providers: { google: true, demo: false } });
    await renderApp("/admin/users", a.handler, ADMIN);
    await screen.findByTestId("staff-table");
    expect(screen.queryByTestId("reset-demo")).not.toBeInTheDocument();
  });
});
