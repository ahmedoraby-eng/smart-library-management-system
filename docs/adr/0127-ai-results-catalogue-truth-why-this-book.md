# 0127. AI results: catalogue truth, a 'Why this book' note, a mode badge and a live-availability line

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Users must see what came from the catalogue and what came from the model.

## Options considered

| Option | For | Against |
|---|---|---|
| **Reference-desk framing; AI supplies only the reason text** | no trust in model-made facts | less 'magic' |

## Decision

- Form: 3–500-character request, optional 'For member', 'Available only', example chips; max 5 results.
- Only items with a catalogue bookId render; title, author and availability come from the catalogue DTO.
- Each result has a plain-text 'Why this book' (≤ 300 chars, 3 lines), a badge 'AI-ranked' or 'Keyword match', and the line 'Availability is live from the catalog, not from the AI.'
- Unavailable results show '0 of N available' and no Borrow. Fallback shows a warning notice; 429 disables the button for Retry-After; loading says 'Searching your catalog…' with skeleton rows.

## Consequences

- The copy avoids 'AI is thinking' theatre.

## Sources

decisions/ux.md:24,274; owner conversation, 2026-11-24; Confluence page 19169290; decisions/ux.md:276-279; decisions/ux.md:281-287; decisions/ux.md:272-274
