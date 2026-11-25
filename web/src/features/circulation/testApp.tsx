import type { Me } from "@slm/contracts";
import { ROLE_PERMISSIONS } from "@slm/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { ToastProvider } from "../../components/ui";
import { router as appRouter } from "../../routes/router";

type Handler = (req: { method: string; url: URL; body: unknown }) => { status?: number; body: unknown } | undefined;

export const librarian: Me = {
  id: "s1",
  email: "layla@library.test",
  fullName: "Layla Librarian",
  role: "LIBRARIAN",
  permissions: [...ROLE_PERMISSIONS.LIBRARIAN],
  isDemo: false,
};

/**
 * Renders the real route tree at `url` (shell included) with fetch answered by `handler`.
 * /api/me answers as `me` unless the handler does. Returns the fetch mock to assert calls.
 */
export async function renderApp(url: string, handler: Handler, me: Me = librarian) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const u = new URL(input, "http://localhost");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const hit = handler({ method, url: u, body }) ?? (u.pathname === "/api/me" ? { body: me } : undefined);
    if (!hit)
      return new Response(JSON.stringify({ type: "about:blank", title: "nf", status: 404, code: "NOT_FOUND" }), {
        status: 404,
      });
    return new Response(JSON.stringify(hit.body), {
      status: hit.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const router = createRouter({ ...appRouter.options, history: createMemoryHistory({ initialEntries: [url] }) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await router.load();
  return { ...result, router, fetchMock };
}

export const page = <T,>(items: T[]) => ({ items, page: 1, size: 20, total: items.length });
