# ADR-002: Playwright is an adapter, not the architecture

**Status:** Accepted

## Context

The demo will be browser-based, but interface.ai's real environment includes legacy web and desktop software where a clean DOM cannot be assumed.

## Decision

Keep perception/action mechanics behind `SurfaceAdapter`. Implement Playwright first.

## Rationale

The artifact and replay engine should describe logical automation semantics rather than Playwright APIs. A later accessibility, screenshot-coordinate, or desktop adapter should be possible without redesigning the capability contract.

## Tradeoffs

An early abstraction can become overly generic. The interface must stay small and be driven by concrete needs from the vertical slice.

## Revisit if

The Playwright implementation repeatedly leaks browser-specific concepts into capability or replay contracts.

## Implementation evidence (2026-09-27)

The first adapter implemented navigation, observation, ordered target resolution, click/fill/select/read,
checkpoints, evidence, lifecycle, and same-session handoff without adding Playwright types to the core
contracts. Opaque runtime references were sufficient. The decision remains accepted.

Discovery later exposed a missing perception-to-action seam: the lightweight observation refs
were descriptive, not actionable, and did not carry screenshot bytes or verified durable control
evidence. ADR-008 adds opt-in hybrid observations and `describeTarget(ref)` without provider or
Playwright types. Replay keeps its lightweight path and ordered descriptor resolution unchanged.
