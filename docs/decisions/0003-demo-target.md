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

## Implementation evidence (2026-09-27)

The minimal proxy now supports member search, member detail, account information, and a savings
balance using fake data. Deterministic query scenarios cover success, member-not-found, a recoverable
host-busy interstitial, permission denial, and a risky intervention dialog. Its table layout,
imperfect member label, missing test IDs, and account iframe exercise the adapter without expanding
the proxy into a product UI. The decision remains accepted.
