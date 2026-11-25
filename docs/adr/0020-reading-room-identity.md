# 0020. «Reading Room» visual identity, with a «Plain» theme toggle

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

The first build used the default look of many generated UIs: Inter, indigo, a grey canvas, equal KPI cards and a sparkle icon. Nothing said *library*.

## Options considered

| Option | For | Against |
|---|---|---|
| Keep the default look | no work | looks generic |
| Replace it outright | one theme | no way back if a reviewer prefers the calm default |
| **Reading Room as the default, with the previous look kept as «Plain» behind a discreet toggle** | a distinct identity; flows, copy, ARIA and test ids unchanged | two sets of theme variables |

## Decision

- **Colours:** paper-toned surfaces, ink text, a library-green navigation spine and brass accents.
- **Type:** a book serif for titles, a clear sans for the interface, and a typewriter mono for identifiers.
- **Shapes:** near-square corners, with rules instead of shadows.
- **Signature elements:** book-spine covers and an index-card sign-in.
- **How it's built:** a visual layer only. `@theme` holds Reading Room, and `[data-theme="plain"]` overrides the same variables.
- Fonts are free (OFL) and self-hosted.

## Consequences

- The theme doesn't change flows, routes or tests.
- Every new component must look right in both themes.
