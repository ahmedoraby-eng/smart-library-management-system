import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./apiClient";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.problem.status < 500) && count < 2,
    },
  },
});
