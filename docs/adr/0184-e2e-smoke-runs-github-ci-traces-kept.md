# 0184. E2E smoke runs in GitHub CI, with traces kept on failure

- **Status:** Accepted (supersedes [0176](0176-playwright-e2e-smoke-three-flows-run-locally.md))
- **Date:** 2026-11-25
- **Area:** testing
- **Deciders:** Ahmed Oraby (owner), on QA and architecture's recommendation

## Context

[0176](0176-playwright-e2e-smoke-three-flows-run-locally.md) kept the Playwright smoke out of CI because of the 3-day time box and CI time. The time box has passed, and the repository is public, so GitHub-hosted Actions minutes cost nothing.

> Ahmed Oraby, 2026-11-25: «لو الترشيح ان احنا ننقله على الجيت هاب، خلينا نعمل كده على طول»

## Options considered

| Option | For | Against |
|---|---|---|
| **Run `npm run e2e` in GitHub Actions on every PR (`e2e.yml`), keep Playwright traces on failure** | the three journeys guard every change; free on a public repo; a failure comes with a trace | a few more minutes per PR |
| Keep it local only ([0176](0176-playwright-e2e-smoke-three-flows-run-locally.md)) | no CI time | a broken journey can merge unseen |

## Decision

- The same three flows as 0176 (Librarian add → borrow → return → history; Supervisor read-only with a direct `POST` → 403; Admin demo reset), on the same throwaway stack (embedded PostgreSQL 16 + `wrangler dev`), now in CI on every pull request.
- Playwright keeps a trace and a screenshot on failure, uploaded as a workflow artifact (PR #33, merged).
- The workflow file (`e2e.yml`) is added by the owner's script `enable-e2e-ci.sh`, because the agents' Apps can't push workflow files.

## Consequences

- No auth bypass is added for CI: the run signs in with its own throwaway secrets, as locally.
- Revisit if E2E time grows past a few minutes, or if the repository goes private (Actions minutes are then billed).

## Notes

**In force since 2026-11-25:** PR #35 (`e2e.yml`) merged as 1a88d14; `e2e` is a required check of the `protect-main` ruleset.

## Sources

Public: PR #35; PR #33; PR #17

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-25
