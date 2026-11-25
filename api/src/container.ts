import { BookService } from "./catalog/application/BookService";
import { PgBookRepository } from "./catalog/infrastructure/PgBookRepository";
import type { IsbnLookup } from "./catalog/domain/IsbnLookup";
import { OpenLibraryIsbnLookup } from "./catalog/infrastructure/OpenLibraryIsbnLookup";
import { pgBookStockFor } from "./catalog/infrastructure/PgBookStock";
import { CirculationService } from "./circulation/application/CirculationService";
import { PgCirculationStore } from "./circulation/infrastructure/PgCirculationStore";
import { PgLoanReader } from "./circulation/infrastructure/PgLoanReader";
import { DashboardService } from "./dashboard/application/DashboardService";
import { PgDashboardReadModel } from "./dashboard/infrastructure/PgDashboardReadModel";
import { BookDiscoveryService } from "./discovery/application/BookDiscoveryService";
import { BookIndexSync } from "./discovery/application/BookIndexSync";
import { HybridCatalogRetrieval } from "./discovery/application/HybridCatalogRetrieval";
import { PgAiBudget, PgAiCache } from "./discovery/infrastructure/PgAiCost";
import { PgChunkStore } from "./discovery/infrastructure/PgChunkStore";
import { PgCatalogRetrieval } from "./discovery/infrastructure/PgCatalogRetrieval";
import { selectAiProvider, selectEmbedder } from "./discovery/infrastructure/selectProvider";
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
export function buildContainer(
  db: Db,
  config: Config,
  clock: Clock,
  ai?: AiBinding,
  overrides: { oidc?: OidcProvider; isbnLookup?: IsbnLookup } = {},
) {
  const staffRepo = new PgStaffUserRepository(db);
  const staffIdentity = new StaffIdentityService(staffRepo, config);
  // SLM-16 hybrid retrieval: one embedder and one chunk store for indexing and search.
  const embedder = selectEmbedder(config, ai);
  const chunkStore = new PgChunkStore(db, embedder?.dimensions);
  // SLM-16 cost controls: daily budget (global Neuron cap + per-user quota) and a TTL cache, in Postgres.
  const aiBudget = new PgAiBudget(db, clock, config.aiDailyNeuronCap, config.aiUserDailySearches);
  const aiCache = new PgAiCache(db, clock);
  const logJson = (e: Record<string, unknown>) => console.info(JSON.stringify({ level: "info", ...e }));
  return {
    db,
    config,
    clock,
    staffRepo,
    staffIdentity,
    // Google sign-in exists only when its client is configured; tests pass a fake provider.
    googleSignIn: config.google
      ? new GoogleSignIn(overrides.oidc ?? new GoogleOidcProvider(config.google), staffIdentity)
      : null,
    staffAdmin: new StaffAdminService(staffRepo),
    demoData: new DemoDataService(new PgDemoDataStore(db), staffIdentity),
    isbnLookup: overrides.isbnLookup ?? new OpenLibraryIsbnLookup(),
    books: new BookService(new PgBookRepository(db)),
    circulation: new CirculationService(
      new PgCirculationStore(db, pgBookStockFor),
      new PgLoanReader(db),
      config,
      clock,
    ),
    discovery: new BookDiscoveryService(
      new HybridCatalogRetrieval(
        new PgCatalogRetrieval(db),
        chunkStore,
        embedder,
        (e) => logJson({ event: "ai_retrieval", ...e }),
        undefined,
        { cache: aiCache, budget: aiBudget },
      ),
      selectAiProvider(config, ai),
      (e) => logJson({ event: "ai_discovery", ...e }),
      undefined,
      { cache: aiCache, budget: aiBudget, userQuota: config.aiUserDailySearches },
    ),
    bookIndex: new BookIndexSync(chunkStore, embedder, (e) => logJson(e), aiBudget),
    aiBudget,
    aiCache,
    dashboard: new DashboardService(new PgDashboardReadModel(db, clock)),
    members: new MemberService(new PgMemberRepository(db)),
  };
}
export type Container = ReturnType<typeof buildContainer>;
