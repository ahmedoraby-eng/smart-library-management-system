import { BookService } from "./catalog/application/BookService";
import { PgBookRepository } from "./catalog/infrastructure/PgBookRepository";
import { pgBookStockFor } from "./catalog/infrastructure/PgBookStock";
import { CirculationService } from "./circulation/application/CirculationService";
import { PgCirculationStore } from "./circulation/infrastructure/PgCirculationStore";
import { PgLoanReader } from "./circulation/infrastructure/PgLoanReader";
import { DemoDataService } from "./demo/application/DemoDataService";
import { PgDemoDataStore } from "./demo/infrastructure/PgDemoDataStore";
import type { Clock } from "./platform/clock";
import type { Config } from "./platform/config";
import type { Db } from "./platform/db";
import { StaffIdentityService } from "./staff/application/StaffIdentityService";
import { PgStaffUserRepository } from "./staff/infrastructure/PgStaffUserRepository";

/** Manual wiring: env bindings → repositories → services. One place, no DI framework. */
export function buildContainer(db: Db, config: Config, clock: Clock) {
  const staffRepo = new PgStaffUserRepository(db);
  const staffIdentity = new StaffIdentityService(staffRepo, config);
  return {
    db,
    config,
    clock,
    staffRepo,
    staffIdentity,
    demoData: new DemoDataService(new PgDemoDataStore(db), staffIdentity),
    books: new BookService(new PgBookRepository(db)),
    circulation: new CirculationService(new PgCirculationStore(db, pgBookStockFor), new PgLoanReader(db), config, clock),
  };
}
export type Container = ReturnType<typeof buildContainer>;
