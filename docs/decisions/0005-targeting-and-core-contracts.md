# ADR-005: Core artifact, surface, replay, and control contracts

**Status:** Accepted

## Context

The assignment's central architectural seam is the conversion of a probabilistic discovery run into a typed, reviewable capability that can execute deterministically without a model in the decision loop. The contract layer therefore needs to make the production invariants explicit before implementation grows around Playwright or a specific LLM SDK.

## Decision

### Capability artifact

A capability is a versioned JSON-serializable contract containing:

- typed invocation inputs,
- typed outputs,
- reusable logical target descriptors,
- ordered deterministic steps,
- business-outcome declarations,
- bounded recovery policies,
- a final success condition,
- safety policy metadata,
- provenance linking the artifact to its discovery run.

Raw LLM transcripts are evidence, not automation artifacts.

### Targets and locators

Steps reference logical targets by ID. Targets hold an ordered locator strategy list. Replay tries strategies in fixed order; no model chooses a locator at runtime.

Preferred strategies are semantic/accessibility-oriented. CSS/XPath and coordinates remain explicit fallbacks rather than the default abstraction.

### Surface boundary

`SurfaceAdapter` owns surface-specific mechanics: opening a session, observing state, resolving logical targets, executing bounded actions, evaluating checkpoints, capturing evidence, and transferring/reacquiring the same live session for human control.

Playwright will be the first adapter, but the artifact and replay contracts do not depend on Playwright types.

### Replay result model

Terminal results are:

- `success`,
- `business_outcome`,
- `intervention_required`,
- `failure`.

Recoverable runtime conditions are deliberately **not** terminal replay results. They are structured replay events with bounded recovery attempts. If recovery succeeds, replay continues; if it exhausts its policy, replay transitions to intervention or failure.

This avoids reporting a transient condition as the outcome of an otherwise successful run.

### Human control model

Control is represented as an explicit state machine with a single owner at any moment:

`automation_running → paused_for_intervention → human_control → resuming_automation → automation_running`

Terminal transitions can end in `completed` or `failed`.

An integer `epoch` changes whenever control ownership changes. Implementations should reject stale actions from an earlier epoch, preventing split-brain automation/human control.

## Rationale

- Separates stable product contracts from browser-specific implementation details.
- Makes artifacts human-reviewable and agent-invocable.
- Preserves deterministic replay while still permitting ordered locator fallbacks.
- Separates legitimate business outcomes from automation failures.
- Treats retries as execution history rather than final results.
- Makes same-session human takeover explicit and testable.
- Provides credible seams for legacy web, accessibility-based, screenshot/coordinate, and desktop adapters.

## Tradeoffs / risks

- The surface abstraction can become over-general if it grows ahead of real use cases. Keep it driven by the first vertical slice.
- Multiple locator strategies can accidentally mask UI drift. Checkpoints and evidence must make fallback use observable.
- Coordinate fallback is supported but should be constrained by viewport/window expectations and used only when higher-level strategies are unavailable.
- Tenant-specific target overrides are intentionally not embedded into the first artifact schema. A separate binding-profile/override layer is the preferred scaling seam once the first concrete tenant variation is demonstrated.

## Revisit if

- The Playwright implementation repeatedly needs capabilities the adapter cannot express cleanly.
- A desktop proof forces artifact semantics to depend on surface-specific concepts.
- Cross-tenant reuse demonstrates that target overrides must be part of the artifact rather than an external binding profile.
- Recovery semantics require a richer policy language than bounded named strategies.
