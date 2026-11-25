# 0107. Prompt-injection defences: no tools, rules only in the system message, data as JSON

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ai
- **Deciders:** Architecture

## Context

The request text is user input and may try to steer the model.

## Options considered

| Option | For | Against |
|---|---|---|
| **Treat request, candidates and history as untrusted data; validate the output** | injection can't add books or reach data | odd reason text is still possible |

## Decision

- The model has no tools and no database access; it sees only up to 20 public catalogue rows (descriptions cut to 200 characters) as JSON data.
- Rules live only in the system message; search words are stripped to letters and digits (no tsquery operators).
- Output ids are checked against the candidate set; reasons are capped at 300 characters and rendered as text.
- The request text is never logged; embeddings come from public catalogue text only.

## Consequences

- Residual risk is odd wording in a reason, never a fake book.

## Sources

Public: docs/ai.md Privacy; PR #4; PR #11

Also from the owner's working notes and conversations (not published): owner conversation, 2026-11-24; decisions/architecture.md:326
