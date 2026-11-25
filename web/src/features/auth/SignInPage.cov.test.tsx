// @vitest-environment jsdom
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToastProvider } from "../../components/ui";
import { SignInPage } from "./SignInPage";
import { meQueryKey } from "./session";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const problem = (status: number, code: string) => ({ type: "about:blank", title: code, status, code });
const me = { id: "u1", email: "ada@library.test", fullName: "Ada L", role: "LIBRARIAN", permissions: ROLE_PERMISSIONS.LIBRARIAN, isDemo: true };

interface Stub {
  providers?: { google: boolean; demo: boolean } | "error";
  signedIn?: boolean;
  login?: (body: unknown) => Response | Promise<Response>;
}
function stubApi({ providers = { google: false, demo: true }, signedIn = false, login }: Stub = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/providers") return providers === "error" ? json(problem(500, "INTERNAL"), 500) : json(providers);
    if (url === "/api/me") return signedIn ? json(me) : json(problem(401, "UNAUTHENTICATED"), 401);
    if (url === "/api/auth/demo-login") return login ? login(JSON.parse(String(init?.body))) : json(me);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const loginCalls = (fn: ReturnType<typeof stubApi>) => fn.mock.calls.filter((c) => c[0] === "/api/auth/demo-login");

async function renderSignIn(path = "/signin") {
  const rootRoute = createRootRoute({ component: Outlet });
  const signIn = createRoute({
    getParentRoute: () => rootRoute,
    path: "/signin",
    validateSearch: z.object({ next: z.string().optional(), error: z.string().optional(), expired: z.string().optional() }),
    component: SignInPage,
  });
  const dash = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: () => <p>dashboard page</p> });
  const books = createRoute({ getParentRoute: () => rootRoute, path: "/books", component: () => <p>books page</p> });
  const router = createRouter({ routeTree: rootRoute.addChildren([signIn, dash, books]), history: createMemoryHistory({ initialEntries: [path] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await router.load();
  return { router, queryClient };
}

async function fill(email: string, password: string) {
  if (email) await userEvent.type(await screen.findByTestId("signin-email"), email);
  if (password) await userEvent.type(screen.getByTestId("signin-password"), password);
}

afterEach(() => vi.unstubAllGlobals());

describe("sign-in form validation", () => {
  it("an empty form shows the email error, focuses Email and sends nothing", async () => {
    const fn = stubApi();
    await renderSignIn();
    await userEvent.click(await screen.findByTestId("signin-submit"));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(screen.getByTestId("signin-email")).toHaveFocus();
    expect(screen.getByTestId("signin-email")).toHaveAttribute("aria-invalid", "true");
    expect(loginCalls(fn)).toHaveLength(0);
  });

  it("an email with no password focuses Password and sends nothing", async () => {
    const fn = stubApi();
    await renderSignIn();
    await fill("ada@library.test", "");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByText("Enter your password.")).toBeInTheDocument();
    expect(screen.queryByText("Enter your email.")).not.toBeInTheDocument();
    expect(screen.getByTestId("signin-password")).toHaveFocus();
    expect(loginCalls(fn)).toHaveLength(0);
  });

  it("an all-spaces email counts as empty", async () => {
    const fn = stubApi();
    await renderSignIn();
    await fill("   ", "secret");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByText("Enter your email.")).toBeInTheDocument();
    expect(loginCalls(fn)).toHaveLength(0);
  });

  it("Show/Hide toggles the password between masked and readable", async () => {
    stubApi();
    await renderSignIn();
    await fill("", "hunter2");
    const input = screen.getByTestId("signin-password");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("demo sign-in", () => {
  it("sends the trimmed, lower-cased email, caches the user and goes to the dashboard", async () => {
    const fn = stubApi();
    const { router, queryClient } = await renderSignIn();
    await fill("  Ada@Library.TEST ", "secret-pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(JSON.parse(String(loginCalls(fn)[0]![1]!.body))).toEqual({ email: "ada@library.test", password: "secret-pw" });
    expect(loginCalls(fn)[0]![1]).toMatchObject({ method: "POST" });
    expect(queryClient.getQueryData(meQueryKey)).toMatchObject({ email: "ada@library.test" });
  });

  it("returns to the page the visitor came from (safe next)", async () => {
    stubApi();
    const { router } = await renderSignIn("/signin?next=%2Fbooks");
    await fill("a@b.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
  });

  it("ignores a next that would leave the app", async () => {
    stubApi();
    const { router } = await renderSignIn("/signin?next=https%3A%2F%2Fevil.example");
    await fill("a@b.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("wrong credentials (401): generic message, password cleared, email kept, stays on the page", async () => {
    stubApi({ login: () => json(problem(401, "INVALID_CREDENTIALS"), 401) });
    const { router } = await renderSignIn();
    await fill("ada@library.test", "wrong");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByTestId("signin-error")).toHaveTextContent("Email or password is incorrect.");
    expect(screen.getByTestId("signin-password")).toHaveValue("");
    expect(screen.getByTestId("signin-email")).toHaveValue("ada@library.test");
    expect(router.state.location.pathname).toBe("/signin");
  });

  it("a disabled account (403 USER_DISABLED) is told so", async () => {
    stubApi({ login: () => json(problem(403, "USER_DISABLED"), 403) });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByTestId("signin-error")).toHaveTextContent("This account is disabled. Ask a library Admin to reactivate it.");
  });

  it("a server or network failure shows the connection message", async () => {
    stubApi({ login: () => json(problem(500, "INTERNAL"), 500) });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByTestId("signin-error")).toHaveTextContent("Couldn't sign in. Check your connection and try again.");
  });

  it("a lost connection shows the same message", async () => {
    stubApi({ login: () => { throw new TypeError("Failed to fetch"); } });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByTestId("signin-error")).toHaveTextContent("Couldn't sign in");
  });

  it("a new attempt clears the old message before the answer comes", async () => {
    let n = 0;
    stubApi({ login: () => (++n === 1 ? json(problem(401, "INVALID_CREDENTIALS"), 401) : json(me)) });
    const { router } = await renderSignIn();
    await fill("ada@library.test", "bad");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await screen.findByTestId("signin-error");
    await userEvent.type(screen.getByTestId("signin-password"), "good");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("rate limited (429): says so with the server's wait, blocks submits, then lets the visitor try again", async () => {
    const fn = stubApi({ login: () => json(problem(429, "RATE_LIMITED"), 429, { "retry-after": "1" }) });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    const err = await screen.findByTestId("signin-error");
    expect(err).toHaveTextContent("Too many sign-in attempts. Wait a minute and try again.");
    expect(err).toHaveTextContent("(0:01)");
    expect(screen.getByTestId("signin-submit")).toBeDisabled();
    await userEvent.type(screen.getByTestId("signin-password"), "again{Enter}"); // Enter inside the form must not send either
    expect(loginCalls(fn)).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId("signin-submit")).toBeEnabled(), { timeout: 2500 });
    expect(screen.getByTestId("signin-error")).not.toHaveTextContent("(0:");
  });

  it("rate limited without Retry-After: waits a minute, shown as 1:00", async () => {
    stubApi({ login: () => json(problem(429, "RATE_LIMITED"), 429) });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByTestId("signin-error")).toHaveTextContent("(1:00)");
  });

  it("404 means demo sign-in is switched off: the form goes away and says so", async () => {
    stubApi({ login: () => json(problem(404, "NOT_FOUND"), 404) });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    expect(await screen.findByTestId("demo-off")).toHaveTextContent("Sign-in is not available right now.");
    expect(screen.queryByTestId("signin-email")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signin-error")).not.toBeInTheDocument();
  });

  it("disables the button and shows it busy while the request runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fn = stubApi({ login: async () => { await gate; return json(me); } });
    const { router } = await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await waitFor(() => expect(screen.getByTestId("signin-submit")).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByTestId("signin-submit")).toBeDisabled();
    await userEvent.type(screen.getByTestId("signin-password"), "{Enter}");
    expect(loginCalls(fn)).toHaveLength(1);
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });
});

describe("provider-driven layout", () => {
  it("without Google the Email field gets focus once the providers are known", async () => {
    stubApi({ providers: { google: false, demo: true } });
    await renderSignIn();
    await waitFor(() => expect(screen.getByTestId("signin-email")).toHaveFocus());
  });

  it("with Google, focus starts on the Google button instead", async () => {
    stubApi({ providers: { google: true, demo: true } });
    await renderSignIn();
    const google = await screen.findByTestId("google-signin");
    await waitFor(() => expect(google).toHaveFocus());
    expect(screen.getByTestId("signin-email")).not.toHaveFocus();
  });

  it("Google button: shows busy and blocks the demo form after the redirect starts", async () => {
    const fn = stubApi({ providers: { google: true, demo: true } });
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
    await renderSignIn();
    await userEvent.click(await screen.findByTestId("google-signin"));
    expect(screen.getByTestId("google-signin")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("signin-submit")).toBeDisabled();
    await fill("ada@library.test", "pw");
    await userEvent.type(screen.getByTestId("signin-password"), "{Enter}");
    expect(loginCalls(fn)).toHaveLength(0);
  });

  it("while a demo sign-in runs, the Google button is disabled", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    stubApi({ providers: { google: true, demo: true }, login: async () => { await gate; return json(me); } });
    await renderSignIn();
    await fill("ada@library.test", "pw");
    await userEvent.click(screen.getByTestId("signin-submit"));
    await waitFor(() => expect(screen.getByTestId("google-signin")).toBeDisabled());
    release();
  });

  it("demo off and Google on: points to Google and shows no form", async () => {
    stubApi({ providers: { google: true, demo: false } });
    await renderSignIn();
    expect(await screen.findByTestId("demo-off")).toHaveTextContent("Demo accounts are turned off. Sign in with Google.");
    expect(screen.getByTestId("google-signin")).toBeInTheDocument();
    expect(screen.queryByTestId("signin-email")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signin-divider")).not.toBeInTheDocument();
  });

  it("nothing configured: says sign-in is unavailable", async () => {
    stubApi({ providers: { google: false, demo: false } });
    await renderSignIn();
    expect(await screen.findByTestId("demo-off")).toHaveTextContent("Sign-in is not available right now.");
    expect(screen.queryByTestId("google-signin")).not.toBeInTheDocument();
  });

  it("if the providers call fails, the demo form is still offered (and Google is not)", async () => {
    stubApi({ providers: "error" });
    await renderSignIn();
    expect(await screen.findByTestId("signin-email")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/providers", expect.anything()));
    expect(screen.queryByTestId("google-signin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("demo-off")).not.toBeInTheDocument();
  });
});

describe("notices from the URL", () => {
  it("expired explains why the visitor is back", async () => {
    stubApi();
    await renderSignIn("/signin?expired=yes");
    expect(await screen.findByTestId("signin-expired")).toHaveTextContent("Your session ended. Sign in again to continue.");
    expect(screen.queryByTestId("signin-google-error")).not.toBeInTheDocument();
  });

  it("no notices by default", async () => {
    stubApi();
    await renderSignIn();
    await screen.findByTestId("signin-card");
    expect(screen.queryByTestId("signin-expired")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signin-google-error")).not.toBeInTheDocument();
  });

  it.each([
    ["google", "Google sign-in didn't complete. Try again."],
    ["google_unverified", "Your Google email isn't verified."],
    ["disabled", "Your staff account is disabled."],
    ["google_busy", "Too many sign-in attempts. Wait a minute"],
    ["something_new", "Google sign-in didn't complete. Try again."],
  ])("error=%s shows the matching message", async (code, text) => {
    stubApi({ providers: { google: true, demo: true } });
    await renderSignIn(`/signin?error=${code}`);
    expect(await screen.findByTestId("signin-google-error")).toHaveTextContent(text);
  });
});

describe("already signed in", () => {
  it("leaves the sign-in page for the dashboard", async () => {
    stubApi({ signedIn: true });
    const { router } = await renderSignIn();
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("goes to the safe next when there is one", async () => {
    stubApi({ signedIn: true });
    const { router } = await renderSignIn("/signin?next=%2Fbooks");
    await waitFor(() => expect(router.state.location.pathname).toBe("/books"));
  });
});

describe("page chrome", () => {
  it("keeps 'Smart Library' as the one h1 and offers the theme toggle", async () => {
    stubApi();
    await renderSignIn();
    expect(await screen.findByRole("heading", { level: 1, name: "Smart Library" })).toBeInTheDocument();
    expect(screen.getByTestId("signin-plate")).toHaveTextContent("Every book its reader");
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByText("Demo credentials are in the submission email.")).toBeInTheDocument();
  });
});
