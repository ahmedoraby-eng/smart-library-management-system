import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";

/** Public `GET /api/auth/providers`: which sign-in doors are open (Google, demo accounts). */
export interface AuthProviders { google: boolean; demo: boolean }

export const authProvidersKey = ["auth", "providers"] as const;

export function useAuthProviders() {
  return useQuery({
    queryKey: authProvidersKey,
    queryFn: () => api<AuthProviders>("/auth/providers"),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
