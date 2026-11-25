# 0069. A neutral GitHub App identity for agent commits

- **Status:** Rejected (2026-11-25, by Ahmed Oraby)
- **Date:** 2026-11-24
- **Area:** repo
- **Deciders:** Ahmed Oraby (owner), on a DevOps proposal

## Context

Agent commit identities show the employer's name in a public repo.

## Options considered

| Option | For | Against |
|---|---|---|
| **One new neutral App installed on this repo only** | hides the name in commit authors | one more identity to manage |
| Owner pushes everything | no new identity | owner becomes a bottleneck |

## Decision

**Rejected.** No neutral GitHub App. The existing per-agent Apps stay.

> Ahmed Oraby, 2026-11-25: «موافق على فكرة رفض القرار بتاع الابلكيشن المحايد بتاع الجيت هاب ده. ملوش لازمة»

Reason: the owner's decision of 2026-11-25 to keep the repository public as it is, leave its history unchanged, and make it private after the assessment. A new identity would add setup and change nothing visible in the existing history.

## Consequences

- The existing App identities stay in use; their avatars must not show the employer's logo.
- The repository becomes private after the assessment.

## Sources

handover notes; decisions/infra.md:87-88
