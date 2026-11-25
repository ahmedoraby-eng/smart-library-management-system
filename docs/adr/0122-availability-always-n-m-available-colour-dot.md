# 0122. Availability is always 'N of M available' with a colour and a dot, never colour alone

- **Status:** Accepted
- **Date:** 2026-11-24
- **Area:** ux
- **Deciders:** UX

## Context

Colour alone fails accessibility and hides the numbers.

## Options considered

| Option | For | Against |
|---|---|---|
| **Count + colour + dot** | readable by everyone | takes space |

## Decision

Badges show the count ('3 of 5 available'), a colour and a dot; tight lists drop the word 'available'.

## Consequences

- Unavailable books show 'Next copy due back <date>' from the earliest due date.

## Sources

decisions/ux.md:18,131
