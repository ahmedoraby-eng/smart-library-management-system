import type { Me, Permission } from "@slm/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";

export const meQueryKey = ["me"] as const;

/** The signed-in staff member (cookie session). 401 = not signed in; the router redirects. */
export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: () => api<Me>("/me"), retry: false, staleTime: 60_000 });
}

/** UI-side permission check. Only hides controls (U10); the API enforces every rule. */
export function useCan(): (permission: Permission) => boolean {
  const me = useMe();
  return (permission) => me.data?.permissions.includes(permission) ?? false;
}

/** Only same-origin paths are valid redirect targets (no open redirect). */
export function safeNext(next: string | undefined): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return undefined;
  if (/^\/signin(\?|#|\/|$)/.test(next)) return undefined;
  try {
    if (new URL(next, "http://same.origin").origin !== "http://same.origin") return undefined;
  } catch {
    return undefined;
  }
  return next;
}
