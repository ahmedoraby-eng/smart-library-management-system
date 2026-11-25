# 0139. Book form fields and validation

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Data quality starts at the form.

## Options considered

| Option | For | Against |
|---|---|---|
| **Validate on blur and submit; copies rules in the form** | clean data | more rules to keep in sync with the API |

## Decision

Title and author required (≤ 200); optional ISBN-10/13 with checksum, unique; category combobox; publisher; year 1450–current; https cover URL; description ≤ 2000; total copies ≥ 1 (on edit ≥ on loan). Available copies is never an input.

## Consequences

- The API enforces the same rules.

## Sources

Public: web/src/

Also from the owner's working notes and conversations (not published): decisions/ux.md:172-190
