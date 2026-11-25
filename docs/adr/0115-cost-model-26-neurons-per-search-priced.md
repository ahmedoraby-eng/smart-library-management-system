# 0115. Cost model: ≤ 26 Neurons per search, priced from vendor pages; real-library estimate $25–40/month

- **Status:** Accepted
- **Date:** 2026-11-25
- **Area:** cost
- **Deciders:** Architecture

## Context

Reviewers will ask what AI search costs, now and at real scale.

## Options considered

| Option | For | Against |
|---|---|---|
| **Fixed token budget per search and a written scenario** | numbers can be checked | estimates, not invoices |

## Decision

- Input ≈ 1,700 tokens, output ≤ 600 → ≤ 26 Neurons per search (≈ 380 searches/day free at worst case); embeddings add ≤ 1 Neuron.
- Prices read from vendors' official pages on 25/11/2026, linked per row; anything else marked estimate.
- Scenario: 50 staff, 2,000 AI searches/day → Workers $5 + Workers AI $7–14 + Neon Launch ≈ $20 → about $25–40 a month.

## Consequences

- A price change means updating the page and the config rates.

## Sources

Confluence page 19464205
