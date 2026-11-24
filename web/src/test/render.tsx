import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "../components/ui";

/**
 * Renders `ui` at "/" inside a real (memory) router, query client and toast provider, so
 * components that use <Link>, useNavigate or useToast work as in the app.
 */
export async function renderWithProviders(ui: ReactElement) {
  const rootRoute = createRootRoute({ component: Outlet });
  const index = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => ui });
  const bookDetail = createRoute({ getParentRoute: () => rootRoute, path: "/books/$bookId", component: () => <p>detail</p> });
  const books = createRoute({ getParentRoute: () => rootRoute, path: "/books", component: () => <p>books</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([index, bookDetail, books]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  // The router loads asynchronously: callers wait with findBy*; `ready` waits for the router to mount the page.
  await router.load();
  return { ...result, router, queryClient };
}
