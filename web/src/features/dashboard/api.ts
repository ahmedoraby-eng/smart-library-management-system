import type { DashboardSummary } from "@slm/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";

/** Circulation (borrow/return) and book mutations can invalidate this key so the numbers refresh. */
export const dashboardKey = ["dashboard"] as const;

export function useDashboard() {
  return useQuery({ queryKey: dashboardKey, queryFn: () => api<DashboardSummary>("/dashboard/summary") });
}
