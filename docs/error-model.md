# Error model

Runtime behavior is intentionally split into different semantic classes.

## Business outcome

A valid application result the caller needs to know about, such as `MEMBER_NOT_FOUND`. This is not an automation failure.

The proxy returns this outcome when the result page explicitly displays `Member not found`; target
resolution itself succeeding or failing is not used to infer the business result.

## Recoverable condition

A known transient/runtime condition with a bounded deterministic recovery policy, such as a slow load or known interstitial. Recoverable conditions are run events, not terminal replay results.

The demo's host-busy interstitial has one explicit `Retry inquiry` action and a maximum of two
attempts. Recovery is logged as a `recoverable_condition`; no model chooses the recovery.

## Intervention required

Automation cannot safely continue but the same live session can be handed to a human operator.

The unexpected account-warning dialog transfers ownership before account navigation. Automation
actions are blocked until the matching intervention returns control.

## Hard failure

Execution stops with structured context including the failing step, expected state, observed state, and evidence references.

The controlled permission-denied state maps to `permission_denied` and captures screenshot plus DOM
evidence. Those raw artifacts are marked unredacted and are not committed.
