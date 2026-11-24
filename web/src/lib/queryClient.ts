import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./apiClient";

type ApiErrorHandler = (err: ApiError) => void;
let onApiError: ApiErrorHandler | undefined;

/** The router registers this (401 → /signin, 403 → /403) so lib/ doesn't import routes. */
export function setApiErrorHandler(fn: ApiErrorHandler | undefined): void {
  onApiError = fn;
}

const handle = (err: unknown) => {
  if (err instanceof ApiError) onApiError?.(err);
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handle }),
  mutationCache: new MutationCache({ onError: handle }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.problem.status < 500) && count < 2,
    },
  },
});
