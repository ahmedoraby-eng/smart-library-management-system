# 0020. «Reading Room» visual identity, with a «Plain» theme toggle

- **Status:** Accepted (supersedes [0148](0148-first-look-inter-indigo-brand-colour-cool.md))
- **Date:** 2026-11-25
- **Area:** visual
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

## Notes

Fonts: Newsreader (titles), Public Sans (UI 14/20), IBM Plex Mono (member numbers, ISBN). Tokens: canvas #F3EDE2, library green #1F5640, brass #B08433, spine #17352A; radii 2–4 px; no card shadows. Signature pieces: a dark-green spine sidebar with a brass active-tab marker, one ledger strip for the KPIs, book-spine covers, stamp badges, an index-card sign-in and AI discovery as a 'reference desk' with no sparkles. The toggle is a 24 px half-moon at 50 % opacity in a corner (also on sign-in), stored in localStorage and applied before first paint. Must not change: test ids, ARIA, copy, routes, RBAC hiding, layout widths. It was asked for to avoid the generic AI-template look; the acceptance smoke checks fonts load from our own origin at 1280/1440/1920.

> Ahmed Oraby: «موافق على الاتجاه بتاع الريدنج روم ... بس ممكن نخلي فيه توجل... الديفولت يكون فاتح على الريدنج روم، والتوجل ده محطوط في مكان في زاويه مش باين قوي»

## Sources

Public: commit 67723b1; PR #18

Also from the owner's working notes and conversations (not published): Confluence page 19169290; owner conversation, 2026-11-24; owner conversation, 2026-11-25; decisions/visual-identity/spec.md:1-28; decisions/visual-identity/spec.md:30-38; decisions/visual-identity/spec.md:40-117; decisions/visual-identity/spec.md:158-165; decisions/visual-identity/spec.md:174
