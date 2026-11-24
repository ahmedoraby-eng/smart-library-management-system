import type { StaffIdentityService } from "../../staff/application/StaffIdentityService";

export interface DemoDataStore { replaceWithSeed(): Promise<void> }

/**
 * Restores the demo data (architecture §5.2a). One code path for the nightly Cron Trigger and
 * the Admin «Reset demo data» button: seed books, members and loans; keep staff; restore demo accounts.
 */
export class DemoDataService {
  constructor(private readonly store: DemoDataStore, private readonly staff: StaffIdentityService) {}

  async reset(): Promise<void> {
    await this.store.replaceWithSeed();
    await this.staff.ensureDemoAccounts();
  }
}
