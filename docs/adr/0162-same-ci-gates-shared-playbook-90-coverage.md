# 0162. Same CI gates as the shared playbook: 90 % coverage, lint, format, audit and AI guard

- **Status:** Accepted, not yet in force (supersedes [0168](0168-coverage-gate-coverage-report-informational.md), [0169](0169-security-scanning-limited-secret-scan.md))
- **Date:** 2026-11-25
- **Area:** cicd
- **Deciders:** Ahmed Oraby (owner)

## Context

The owner wanted SLM's CI to work like his other platform's: AI-assisted flag, tests linked to code, high coverage.

> Ahmed Oraby: «انا عايز اتاكد ان السي اي شغال بنفس الاليه»

## Options considered

| Option | For | Against |
|---|---|---|
| **Reusable playbook workflows on GitHub-hosted runners** | proven gates; public repo works | coverage work before the deadline |
| Self-hosted runner | faster | not for a public repo on a personal account |

## Decision

- Node CI: typecheck, ESLint (recommended + React hooks), Prettier check (printWidth 120), build, dependency audit, and coverage gates of 90 % lines/statements/functions (branches 85 % API, 80 % web).
- ai-guard with `.ai-guard.toml` (protected globs `.github/workflows/*`, `migrations/*`) and an 'AI assistance' checkbox in the PR template.
- SLM's own hygiene job and Postgres service stay; web tests now run in CI.
- Backfill: tests added for past PRs #1–#24 (API 96.8 → 98.9 %, web 79.6 → 99.6 % lines) and the box ticked on bot-opened PRs.

## Consequences

- Earlier 'no coverage gate' and 'secret scan only' choices are replaced.

## Notes

**In force when:** (1) PR #26 merges (tests, coverage thresholds, ESLint and Prettier configs, `scripts/ci-test.sh`); approved, waiting for the owner's merge. (2) The owner's gates PR (opened by `enable-ci-gates.sh`) merges: it makes CI run `npm run check`, `npm run test:coverage` and the audit, and adds `ai-guard`, `.ai-guard.toml` and the AI checkbox in the PR template. Until both land, CI on `main` runs plain `npm test`, with no coverage gate, lint, audit or ai-guard.

## Sources

Public: PR #26

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-25; design notes
