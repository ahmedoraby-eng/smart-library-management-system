# 0185. QA tests on the pull request before merge; merge only after QA passes

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** process
- **Deciders:** Ahmed Oraby (owner)

## Context

The board flow ([0051](0051-board-flow-refinement-development-testing-released-review.md)) puts QA in In Testing, but in practice QA ran on merged `main`, after [0023](0023-close-on-merge-after-deploy.md) had already moved the issue to Released on merge. A story could be Released before QA, and a QA failure landed on a Released issue. The owner chose the order his other platform uses.

> Ahmed Oraby, 2026-11-25 (roles in brackets): «[المهندس] يفتح PR والتيكت يروح للتيست ان تيستنج، وبعدين [QA] تختبر على الPR، وبعدين لو نجح نعمل ميرج»

## Options considered

| Option | For | Against |
|---|---|---|
| **QA on the PR, before merge: the engineer opens the PR, the issue moves to In Testing, QA tests the PR's build, then the merge** | Released means tested and live; a failure goes back before anything ships | the merge waits for QA |
| QA after merge, as post-release verification | faster merges | Released before tested; failures land on released work |

## Decision

1. The engineer opens the PR; the issue moves to **In Testing** automatically when the PR is ready (a `jira-ready-for-testing` workflow, as on the other platform).
2. QA tests the PR (its CI, the E2E run from [0184](0184-e2e-smoke-runs-github-ci-traces-kept.md), and a manual check on a local or preview build).
3. **QA passed** is recorded as the status **Ready for Release** (one more board status, as on the other platform; visible on the board, unlike a label). A failure moves the issue back to In Development with a comment.
4. A `jira-status` check on the PR is green only when its issue is in Ready for Release; a `protect-main` ruleset makes that check required, so the merge can't happen before QA.
5. On merge, [0023](0023-close-on-merge-after-deploy.md) moves the issue from Ready for Release to Released after the deploy check succeeds.

## Consequences

- This replaces the earlier description of QA as post-release verification (wiki page 5 is to be updated).
- The board gains one status, Ready for Release, between In Testing and Released.
- Automation and the ruleset are DevOps work (ported from the other platform); until they land, the order is followed by hand.

## Sources

Public: .github/workflows/jira-close.yml

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-25
