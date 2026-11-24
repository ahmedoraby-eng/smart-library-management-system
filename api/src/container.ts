import { BookService } from "./catalog/application/BookService";
import { PgBookRepository } from "./catalog/infrastructure/PgBookRepository";
import { pgBookStockFor } from "./catalog/infrastructure/PgBookStock";
import { CirculationService } from "./circulation/application/CirculationService";
import { PgCirculationStore } from "./circulation/infrastructure/PgCirculationStore";
import { PgLoanReader } from "./circulation/infrastructure/PgLoanReader";
import { DashboardService } from "./dashboard/application/DashboardService";
import { PgDashboardReadModel } from "./dashboard/infrastructure/PgDashboardReadModel";
import { BookDiscoveryService } from "./discovery/application/BookDiscoveryService";
import { PgCatalogRetrieval } from "./discovery/infrastructure/PgCatalogRetrieval";
import { selectAiProvider } from "./discovery/infrastructure/selectProvider";
import type { AiBinding } from "./discovery/infrastructure/WorkersAiProvider";
import { MemberService } from "./members/application/MemberService";
import { PgMemberRepository } from "./members/infrastructure/PgMemberRepository";
import { DemoDataService } from "./demo/application/DemoDataService";
import { PgDemoDataStore } from "./demo/infrastructure/PgDemoDataStore";
import type { Clock } from "./platform/clock";
import type { Config } from "./platform/config";
import type { Db } from "./platform/db";
import { GoogleSignIn } from "./staff/application/GoogleSignIn";
import { StaffAdminService } from "./staff/application/StaffAdminService";
import { StaffIdentityService } from "./staff/application/StaffIdentityService";
import type { OidcProvider } from "./staff/domain/OidcProvider";
import { GoogleOidcProvider } from "./staff/infrastructure/GoogleOidcProvider";
import { PgStaffUserRepository } from "./staff/infrastructure/PgStaffUserRepository";

/** Manual wiring: env bindings → repositories → services. One place, no DI framework. */
export function buildContainer(db: Db, config: Config, clock: Clock, ai?: AiBinding, overrides: { oidc?: OidcProvider } = {}) {
  const staffRepo = new PgStaffUserRepository(db);
  const staffIdentity = new StaffIdentityService(staffRepo, config);
  return {
    db,
    config,
    clock,
    staffRepo,
    staffIdentity,
    // Google sign-in exists only when its client is configured; tests pass a fake provider.
    googleSignIn: config.google ? new GoogleSignIn(overrides.oidc ?? new GoogleOidcProvider(config.google), staffIdentity) : null,
    staffAdmin: new StaffAdminService(staffRepo),
    demoData: new DemoDataService(new PgDemoDataStore(db), staffIdentity),
    books: new BookService(new PgBookRepository(db)),
    circulation: new CirculationService(new PgCirculationStore(db, pgBookStockFor), new PgLoanReader(db), config, clock),
    discovery: new BookDiscoveryService(new PgCatalogRetrieval(db), selectAiProvider(config, ai), (e) => console.info(JSON.stringify({ level: "info", event: "ai_discovery", ...e }))),
    dashboard: new DashboardService(new PgDashboardReadModel(db, clock)),
    members: new MemberService(new PgMemberRepository(db)),
  };
}
export type Container = ReturnType<typeof buildContainer>;
