import type { DashboardSummary } from "@slm/contracts";
import type { DashboardReadModel } from "../domain/Dashboard";

/** SLM-12: the library at a glance. Authorization (REPORT_READ) is checked by the route guard. */
export class DashboardService {
  constructor(private readonly readModel: DashboardReadModel) {}

  summary(): Promise<DashboardSummary> {
    return this.readModel.summary();
  }
}
