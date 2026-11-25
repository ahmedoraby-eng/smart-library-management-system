# 0126. Skeletons, not spinners; no decorative motion; tabular figures

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

A calm ops tool shouldn't flash or jump.

## Options considered

| Option | For | Against |
|---|---|---|
| **Skeleton of the real layout** | no layout shift | a skeleton per screen |

## Decision

Loading shows skeletons (1.2 s pulse, off under prefers-reduced-motion); the only animation is a 150 ms row fade on return; no full-page spinners; every number uses tabular figures.

## Consequences

- New screens need their own skeleton.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:23,144,152,264; Confluence page 19169290
