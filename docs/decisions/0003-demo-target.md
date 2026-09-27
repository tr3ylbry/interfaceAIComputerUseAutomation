# ADR-003: Local legacy-style banking proxy

**Status:** Accepted

## Context

A public demo site would constrain our ability to exercise controlled business outcomes, runtime faults, delays, risky dialogs, and human intervention.

## Decision

Build a small local back-office banking proxy with intentionally imperfect/legacy markup and injectable runtime states.

## Rationale

The proxy allows a realistic flow such as member search → member detail → accounts → savings balance while safely using fake data and deterministic fault injection.

## Tradeoffs

Because we own the target, it could look artificially convenient. The implementation should avoid test IDs and deliberately include awkward traits such as tables, frames/iframes, inconsistent semantics, and runtime interstitials.

## Revisit if

Building the proxy starts consuming time that belongs in the automation system.
