# Error model

Runtime behavior is intentionally split into different semantic classes.

## Business outcome

A valid application result the caller needs to know about, such as `MEMBER_NOT_FOUND`. This is not an automation failure.

## Recoverable condition

A known transient/runtime condition with a bounded deterministic recovery policy, such as a slow load or known interstitial. Recoverable conditions are run events, not terminal replay results.

## Intervention required

Automation cannot safely continue but the same live session can be handed to a human operator.

## Hard failure

Execution stops with structured context including the failing step, expected state, observed state, and evidence references.
