# ADR-004: LLM discovery, model-free replay

**Status:** Accepted / assignment constraint

## Context

The assignment's core product model is discover once, save a reusable capability, then execute it deterministically in production.

## Decision

Use the LLM only during discovery. Replay executes the saved artifact, deterministic policies, and target-resolution strategies without asking a model what action to take next.

## Rationale

This keeps normal invocation reliable, reviewable, inexpensive, and debuggable while preserving the model's value for learning unfamiliar UI workflows.

## Tradeoffs

Replay cannot improvise freely when it encounters a novel state. Known recoveries, business outcomes, failures, and human escalation must be explicit.

## Revisit if

Only after the required core is complete, for an explicitly bounded and policy-checked single-step recovery experiment.

## Implementation evidence (2026-09-27)

ADR-008 implements the discovery/model/compiler boundary. Scripted-model browser tests compile
actual observed controls, substitute caller-declared inputs and replay the resulting artifact on a
fresh session for a different fake member, without calling the model. The provider is isolated in
discovery, and static dependency tests keep generic replay free of model/application imports.
This confirms the boundary, not the assignment's genuine live-LLM proof, which awaits credentials.

## Subsequent evidence (2026-09-28)

The credential-era limitation above is historical. ADR-008 records genuine run
`aafa19ac-42a4-4550-b25b-7d57b4589c66`, generated-artifact replay with a different input, and zero
replay model calls. Its accepted public bundle remains unchanged. No decision revision was needed.
