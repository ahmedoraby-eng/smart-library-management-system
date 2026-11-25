# 0004. Modular monolith with layers enforced in CI

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** architecture
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

There are six feature areas (catalog, members, circulation, discovery, staff, dashboard), plus demo and platform. The design must show separation of concerns, and rules that are only written down drift.

## Options considered

| Option | For | Against |
|---|---|---|
| Microservices | independent deploys | distributed operations for a demo-sized app |
| Layered monolith without checks | simple | layers erode silently |
| **Modular monolith, `api → application → domain ← infrastructure`, checked by dependency-cruiser** | one deployable, clear seams, CI fails on a violation | a config file to maintain |

## Decision

One Worker. Each module is a folder with four layers.

`npm run lint:deps` fails on:
- domain importing Hono, Drizzle, `pg`, `jose` or Cloudflare;
- domain importing other layers;
- application importing api, infrastructure or drivers;
- a module reading another module's `schema.ts`;
- the web app importing `api/`;
- circular imports.

Interfaces exist only at the persistence and AI boundaries. Wiring is manual constructor injection in one `container.ts`.

## Consequences

- Each infrastructure service (Neon, Workers AI, Google) sits behind one of our interfaces and can be swapped without touching the domain.
- A module can be split out later along the same seams.

## Notes

Eight module folders under api/src: catalog, members, circulation, staff, discovery, dashboard, demo, platform. The brief also ruled out microservices and a multi-agent runtime inside the app. Time is an injected clock; about 15 objects are wired per request, so a DI framework would cost more than it saves.

## Sources

Confluence page 19365918; Confluence page 19333121; Jira SLM-6; owner conversation, 2026-11-24; smart-library-management-system/.dependency-cruiser.cjs; docs/architecture.md; decisions/architecture.md:16,151-156; master prompt; decisions/architecture.md:106,151; decisions/engineering-plan.md:56-59
