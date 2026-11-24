// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToastProvider } from "../../components/ui";
import { SignInPage } from "./SignInPage";

function stubApi(providers: { google: boolean; demo: boolean }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url === "/api/auth/providers") return json(providers);
    if (url === "/api/me") return json({ type: "about:blank", title: "x", status: 401, code: "UNAUTHENTICATED" }, 401);
    return json({}, 404);
  }));
}

async function renderSignIn(path = "/signin") {
  const rootRoute = createRootRoute({ component: Outlet });
  const signIn = createRoute({
    getParentRoute: () => rootRoute,
    path: "/signin",
    validateSearch: z.object({ next: z.string().optional(), error: z.string().optional(), expired: z.string().optional() }),
    component: SignInPage,
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([signIn]), history: createMemoryHistory({ initialEntries: [path] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await router.load();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SLM-8 sign-in page providers (ux.md §1.1)", () => {
  it("hides the Google button and the divider when Google is not configured", async () => {
    stubApi({ google: false, demo: true });
    await renderSignIn();
    expect(await screen.findByTestId("signin-email")).toBeInTheDocument();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/providers", expect.anything()));
    // Let the providers query settle before asserting the button stays hidden.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("google-signin")).not.toBeInTheDocument();
    expect(screen.queryByText("or use a demo account")).not.toBeInTheDocument();
    expect(screen.getByTestId("signin-submit")).toBeInTheDocument();
  });

  it("shows Google + divider when configured; the button goes to /start with the safe next", async () => {
    stubApi({ google: true, demo: true });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await renderSignIn("/signin?next=%2Fbooks%3Fq%3Ddune");
    const button = await screen.findByTestId("google-signin");
    expect(screen.getByTestId("signin-divider")).toHaveTextContent("or use a demo account");
    await userEvent.click(button);
    expect(assign).toHaveBeenCalledWith("/api/auth/google/start?next=%2Fbooks%3Fq%3Ddune");
  });

  it("an unsafe next never reaches /start", async () => {
    stubApi({ google: true, demo: true });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await renderSignIn("/signin?next=%2F%2Fevil.example");
    await userEvent.click(await screen.findByTestId("google-signin"));
    expect(assign).toHaveBeenCalledWith("/api/auth/google/start?next=%2Fdashboard");
  });

  it("shows the disabled notice for error=disabled", async () => {
    stubApi({ google: true, demo: true });
    await renderSignIn("/signin?error=disabled");
    expect(await screen.findByTestId("signin-google-error")).toHaveTextContent("Your staff account is disabled.");
  });
});
