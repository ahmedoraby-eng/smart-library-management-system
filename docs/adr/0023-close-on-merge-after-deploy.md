# 0023. Close the issue on merge, moving it to Released only after the deploy check

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** process
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

Issues stayed open after their work shipped. And "merged" isn't "live" while the deploy can still fail.

## Options considered

| Option | For | Against |
|---|---|---|
| Close by hand | no automation | forgotten issues |
| Close on merge | automatic | marks Released before the deploy succeeds |
| **Close on merge, gated on the deploy check** | Released means live | waits up to 12 minutes after a merge |

## Decision

- A merged PR whose description says `Closes SLM-<n>` moves that issue to Released, with the PR links in a comment.
- The move happens only after `Workers Builds: smart-library` succeeds on the merge commit (or a later one).
- A failed or missing build leaves the issue where it is, with a comment.
- `Refs SLM-<n>` moves nothing.
- The workflow runs on `pull_request_target` from `main`, and never checks out the PR's code.

## Consequences

- The PR template carries the `Refs` / `Closes` line.
- The workflow needs one repository secret, for the issue tracker.

## Notes

The shared close tool was fixed so --deploy-check waits for every project, not only guarded ones, and its comment names the target status. Released is SLM's done status. Pickup automation stays off for SLM.

> Ahmed Oraby: «خلينا نعمل اول حاجه الاوتوميشن الخفيفه»

## Sources

.github/workflows/jira-close.yml; design notes; owner conversation, 2026-11-25
