# 0014. Workers AI as the model provider, behind an `AiProvider` interface

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ai
- **Deciders:** Ahmed Oraby (owner), architecture review

## Context

The app runs from a public repository at $0. A paid key next to a public repository needs a spend cap and secret handling.

## Options considered

| Option | For | Against |
|---|---|---|
| Claude Haiku via an API key | stronger ranking and reasons | paid; a secret to protect |
| **Cloudflare Workers AI through the Worker's `AI` binding** | $0 within the free 10,000 Neurons a day; no key anywhere | small models; quality varies |

## Decision

- `WorkersAiProvider` uses `AI_MODEL = @cf/meta/llama-3.2-3b-instruct` (a model on the Free plan) for ranking, and `@cf/baai/bge-base-en-v1.5` for embeddings.
- Beyond the free allocation, the call fails and the fallback answers. There is no bill.
- A deterministic `FakeAiProvider` serves tests and local runs, and it is refused in production.

## Consequences

- Switching to another provider is one class plus config, with no change to the domain.
- Revisit if the ranking quality isn't good enough in real use.

## Notes

llama-3.2-3b-instruct was picked as the cheapest capable model (about 27 Neurons a call at first estimate); llama-3.1-8b-instruct and then Claude Haiku were the fallbacks. Haiku needs the owner's approval and a capped key, and only if ranking fails the live quality check. Embeddings: bge-base-en-v1.5, 768 dims, normalised, batches of up to 50 texts; loadConfig refuses a non-768 model; bge-m3 (cheaper, multilingual) noted for later. AI_FAKE is honoured only when ENVIRONMENT is local or test, and AI is never called in CI.

## Sources

Public: docs/ai.md; wrangler.toml

Also from the owner's working notes and conversations (not published): decisions/architecture.md:19,322-324,402; owner conversation, 2026-11-24; handover notes; design notes; Confluence page 19398657; Confluence page 19169328; Confluence page 19464205; owner conversation, 2026-11-25
