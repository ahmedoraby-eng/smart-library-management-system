// @vitest-environment jsdom
import { ROLE_PERMISSIONS, type Role } from "@slm/contracts";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render";
import { ComingSoonPage, ForbiddenPage, NotFoundPage } from "./pages";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubMe(role: Role | null) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/me") {
      return role
        ? json({ id: "u1", email: "x@y.test", fullName: "Test User", role, permissions: ROLE_PERMISSIONS[role], isDemo: false })
        : json({ type: "about:blank", title: "x", status: 401, code: "UNAUTHENTICATED" }, 401);
    }
    return json({}, 404);
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("ComingSoonPage", () => {
  it("shows the section title as the page heading and a placeholder card", async () => {
    await renderWithProviders(<ComingSoonPage title="Reports" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coming soon" })).toBeInTheDocument();
    expect(screen.getByText("This section is built in a later story.")).toBeInTheDocument();
  });
});

describe("ForbiddenPage (/403)", () => {
  it("tells a Supervisor their role is read-only, and links back to the dashboard", async () => {
    stubMe("SUPERVISOR");
    await renderWithProviders(<ForbiddenPage />);
    const box = await screen.findByTestId("forbidden");
    expect(box).toHaveTextContent("You don't have access to this page");
    await vi.waitFor(() => expect(box).toHaveTextContent("Your role (Supervisor) is read-only."));
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("gives any other role the generic reason", async () => {
    stubMe("LIBRARIAN");
    await renderWithProviders(<ForbiddenPage />);
    expect(await screen.findByText("Your role doesn't include this page.")).toBeInTheDocument();
    expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
  });

  it("uses the generic reason while the session is unknown (not signed in)", async () => {
    stubMe(null);
    await renderWithProviders(<ForbiddenPage />);
    expect(await screen.findByText("Your role doesn't include this page.")).toBeInTheDocument();
  });
});

describe("NotFoundPage (/404)", () => {
  it("says the page is missing and offers the way back", async () => {
    await renderWithProviders(<NotFoundPage />);
    const box = await screen.findByTestId("not-found");
    expect(box).toHaveTextContent("Page not found");
    expect(box).toHaveTextContent("This page doesn't exist or was moved.");
    expect(screen.getByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});
