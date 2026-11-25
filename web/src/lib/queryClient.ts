import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./apiClient";

/** `queryKey`: the failing query's key, absent for a mutation. */
type ApiErrorHandler = (err: ApiError, queryKey?: readonly unknown[]) => void;
let onApiError: ApiErrorHandler | undefined;

/** The router registers this (401 → /signin, 403 → /403) so lib/ doesn't import routes. */
export function setApiErrorHandler(fn: ApiErrorHandler | undefined): void {
  onApiError = fn;
}

const handle = (err: unknown, queryKey?: readonly unknown[]) => {
  if (err instanceof ApiError) onApiError?.(err, queryKey);
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (err, query) => handle(err, query.queryKey) }),
  mutationCache: new MutationCache({ onError: (err) => handle(err) }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.problem.status < 500) && count < 2,
    },
  },
});
