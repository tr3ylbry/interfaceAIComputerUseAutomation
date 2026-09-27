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
