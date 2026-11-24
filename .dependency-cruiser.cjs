/** Architecture rules (architecture.md §0.2, §2.1). CI fails on any violation. */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment: "Domain code imports no framework, driver or platform (Hono, Drizzle, pg, Cloudflare, jose).",
      severity: "error",
      from: { path: "^api/src/[^/]+/domain/" },
      to: { path: "node_modules/(hono|drizzle-orm|pg|jose|@cloudflare)" },
    },
    {
      name: "domain-depends-inward",
      comment: "Domain never reaches out to api, application or infrastructure layers.",
      severity: "error",
      from: { path: "^api/src/[^/]+/domain/" },
      to: { path: "^api/src/[^/]+/(api|application|infrastructure)/" },
    },
    {
      name: "application-knows-no-http-or-sql",
      severity: "error",
      from: { path: "^api/src/[^/]+/application/" },
      to: { path: "(^api/src/[^/]+/(api|infrastructure)/)|node_modules/(hono|drizzle-orm|pg)" },
    },
    {
      name: "no-foreign-tables",
      comment: "A module never reads another module's tables; it goes through that module's repository.",
      severity: "error",
      from: { path: "^api/src/([^/]+)/" },
      to: { path: "^api/src/([^/]+)/infrastructure/schema\\.ts$", pathNot: "^api/src/$1/" },
    },
    {
      name: "web-not-into-api",
      comment: "The SPA talks to the API over HTTP only; it may share contracts, nothing else.",
      severity: "error",
      from: { path: "^web/" },
      to: { path: "^api/" },
    },
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "api/tsconfig.json" },
    exclude: { path: "(^|/)(dist|\\.wrangler)/" },
  },
};
