# ADR-006: Artifact-driven replay and declared runtime conditions

**Status:** Accepted

## Context

The first banking runner hard-coded text checks for host busy, permission denial, and an
unexpected dialog. RecoveryPolicy declares a budget and optional dismiss target, but cannot
identify the screen that activates it. A generic interpreter cannot infer these semantics.

## Alternatives

1. Inject application callbacks: no schema change, but a saved artifact is insufficient to
   reproduce its behavior and callbacks can hide arbitrary application logic.
2. Classify business/application screens in the adapter: couples a reusable surface to a domain.
3. Add optional checkpoint-based runtime conditions to the artifact: small additive schema
   change, with explicit, reviewable conditions and dispositions.

## Decision

Choose option 3. Optional `runtimeConditions` declare a checkpoint plus failure, intervention,
or recoverable classification. Existing artifacts default to no conditions. Existing surface,
event, result, and value-expression contracts remain intact. Version 1.0 artifacts without runtime
conditions remain readable. Conditions require version 1.1, so an older 1.0 reader rejects the
artifact instead of silently stripping safety declarations.

Policy approval precedes open and every execute call, including recovery clicks. Web policy
checks exact origins, anchored path globs, allowed actions, and declared risk. Runtime policy
may further restrict approval. Opening checks location independently of the step action list.
Implicit click/form navigation is checked on the observed location afterward; this is not a
network sandbox, and browser-level egress enforcement remains future work.

Runtime conditions are checked before business outcomes, before actions, and after actions.
Business outcomes are checked before step checkpoints/extraction and terminate normally.
Surface checkpoints resolve logical targets; output checkpoints run locally against a separate
invocation context. No caller values are written into the artifact.

Recovery budgets count recovery attempts, excluding the original action. A known condition
may execute its policy's explicit dismiss target as a conservatively reversible-write click,
then recheck state/checkpoints. Timeout-only recovery waits and rechecks. It never repeats the
original action after an uncertain side effect. Exhaustion defaults to failure; callers may
choose intervention. Detection and recovery completion are distinct events using the existing
`recovered` flag. Recovery does not create another terminal result.

Interventions retain the same session in a coordinator-owned in-memory handoff record with
the request, context, and events. The caller must explicitly release it. Reacquisition is
available through the adapter; automatic mid-run continuation is deferred.

## Tradeoffs and safety

Declarative conditions add a small schema surface, but avoid domain code in replay. Conditions
are sampled in declared order; hard/intervention guards take precedence over business outcomes.
Timeout waits are bounded and injectable for deterministic tests. Recovery risk is conservative
because the original recovery contract has no risk field. Draft artifacts require explicit
development opt-in. Raw evidence is opt-in and remains marked unredacted; event diagnostics
contain IDs and status rather than input values or raw browser error text.

## Evidence and revisit conditions

Implementation: `src/replay/`; saved demo: `examples/member-savings-balance.capability.json`.
Tests exercise four result categories, policy denial, output binding, recovery exhaustion,
cleanup, and live-session handoff. Revisit for safe continuation, actual desktop integration,
browser egress controls, richer recovery actions, or artifact version negotiation.
