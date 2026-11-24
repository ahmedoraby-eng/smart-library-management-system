import type { DashboardSummary } from "@slm/contracts";

/** Read-only port: the dashboard has no domain rules of its own (architecture §2.1). */
export interface DashboardReadModel {
  summary(): Promise<DashboardSummary>;
}
