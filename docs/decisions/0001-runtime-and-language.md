# ADR-001: TypeScript / Node.js runtime

**Status:** Accepted

## Context

The assignment emphasizes system design, typed contracts, integration judgment, and explainability rather than language novelty.

## Decision

Use TypeScript on Node.js unless a required computer-use capability proves materially more stable in another runtime.

## Rationale

- Strong discriminated unions for artifact/result contracts.
- Low implementation overhead for a focused take-home.
- Natural fit with Playwright.
- Easy JSON serialization and schema validation.

## Tradeoffs

Python has broader examples in some agent/computer-use libraries. Native desktop automation options may also differ by runtime.

## Revisit if

A required discovery or surface library is meaningfully more capable or reliable outside Node.js.
