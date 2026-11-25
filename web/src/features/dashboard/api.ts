import type { AiUsageToday, DashboardSummary } from "@slm/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient";

/** Circulation (borrow/return) and book mutations can invalidate this key so the numbers refresh. */
export const dashboardKey = ["dashboard"] as const;

export function useDashboard() {
  return useQuery({ queryKey: dashboardKey, queryFn: () => api<DashboardSummary>("/dashboard/summary") });
}

/** SLM-16: today's AI spend against the daily cap (Admin only; the endpoint needs STAFF_MANAGE). */
export function useAiUsageToday(enabled: boolean) {
  return useQuery({
    queryKey: ["ai-usage-today"],
    queryFn: () => api<AiUsageToday>("/admin/discovery/usage"),
    enabled,
    staleTime: 60_000,
  });
}

/** POST /api/admin/discovery/reindex answer: one batch of the discovery index (SLM-16). */
export interface ReindexBatch {
  result: "done" | "partial" | "disabled";
  embeddedBooks: number;
  reusedBooks: number;
  upToDate: number;
  remaining: number;
  /** Live books; done = total − remaining. */
  total: number;
}

export const reindexBatch = () => api<ReindexBatch>("/admin/discovery/reindex", { method: "POST", body: {} });
