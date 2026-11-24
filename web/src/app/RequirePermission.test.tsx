// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type Role } from "@slm/contracts";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { RequirePermission } from "./RequirePermission";

function stubMe(role: Role) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url === "/api/me") return json({ id: "u1", email: "x@y.test", fullName: "Test User", role, permissions: ROLE_PERMISSIONS[role], isDemo: false });
    return json({}, 404);
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("SLM-7 S7: /admin/users guard (STAFF_MANAGE)", () => {
  it("an Admin sees the page", async () => {
    stubMe("ADMIN");
    await renderWithProviders(<RequirePermission permission="STAFF_MANAGE"><p>staff page</p></RequirePermission>);
    expect(await screen.findByText("staff page")).toBeInTheDocument();
  });
  it("a Librarian who deep-links is sent to /403", async () => {
    stubMe("LIBRARIAN");
    const { router } = await renderWithProviders(<RequirePermission permission="STAFF_MANAGE"><p>staff page</p></RequirePermission>);
    await waitFor(() => expect(router.state.location.pathname).toBe("/403"));
    expect(screen.queryByText("staff page")).not.toBeInTheDocument();
  });
});
