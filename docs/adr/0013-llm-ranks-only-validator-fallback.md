# 0013. AI discovery: the model only ranks real candidates, behind a validator and a deterministic fallback

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ai
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

AI book discovery must never invent books, must show live availability, and must not break the core library flows when the model is missing, slow or wrong.

## Options considered

| Option | For | Against |
|---|---|---|
| The model generates recommendations freely | richer answers | hallucinated books; availability from the model |
| RAG pipeline with a vector-store service | semantic recall | an extra service; ids still need checking |
| **Retrieve real books → one model call ranks and explains by id → validator → DB re-read → fallback** | the catalogue is the source of truth; the core never depends on AI | reasons can be generic with a small model |

## Decision

1. Retrieval returns at most 20 real candidates.
2. One model call ranks them: JSON schema, temperature 0.2, `max_tokens` 600, 8 s timeout. It returns `recommendations[]` of `{bookId, reason, fit}`.
3. `RecommendationValidator` keeps only candidate ids, removes duplicates, caps the list at 5, and cleans and cuts each reason to 300 characters.
4. Book data and availability are re-read from the database after the model answers.
5. `FallbackRanker` answers with `mode: "FALLBACK"` and template reasons when there is no provider, a timeout, an error, an invalid or empty answer, a single candidate, or a quota or budget limit.

- **Privacy:** only the titles of a member's last 5 loans are sent, with no personal data. The request text is never logged.

## Consequences

- The rest of the app never imports the discovery module.
- Prompt injection is reduced, not eliminated. The tests prove that an injected request still returns only real books.

## Notes

Fallback reasons: NO_PROVIDER, TIMEOUT, PROVIDER_ERROR, INVALID_OUTPUT, NO_VALID_ITEMS; the UI shows a 'Keyword match' badge. Request length 3–500 characters. With 0 candidates the model isn't called and the answer is 'No matching books in the catalog.' Candidates carry public metadata with descriptions cut to 200 characters; fit is 1–5. No member cache is used when a member is selected.

## Sources

Public: docs/ai.md; PR #4

Also from the owner's working notes and conversations (not published): decisions/architecture.md:19,311-330; decisions/scope.md:50,59; owner conversation, 2026-11-24; decisions/architecture.md:327; Confluence page 19398657; Jira SLM-9; Confluence page 19169328; master prompt
