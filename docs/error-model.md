# Error model

Runtime behavior is intentionally split into different semantic classes.

## Business outcome

A valid application result the caller needs to know about, such as `MEMBER_NOT_FOUND`. This is not an automation failure.

The proxy returns this outcome when the result page explicitly displays `Member not found`; target
resolution itself succeeding or failing is not used to infer the business result.

## Recoverable condition

A known transient/runtime condition with a bounded deterministic recovery policy, such as a slow load or known interstitial. Recoverable conditions are run events, not terminal replay results.

The artifact declares the host-busy checkpoint and a `transient_load` disposition. Its step policy
allows two recovery attempts beyond the original action, using the explicit `Retry inquiry` target.
Detection emits `recovered: false`; verified recovery emits `recovered: true` for the same attempt.
An unsuccessful attempt remains false. A recovery event describes execution history; it cannot
replace the terminal success, business outcome, failure, or intervention result.

Timeout-only recovery rechecks the checkpoint after bounded backoff. It does not repeat a click
that might already have taken effect. Uncertain action failures stop rather than retry. Exhaustion
defaults to `failure/recovery_exhausted`; the caller may choose `recoveryExhaustion: "intervention"`.
The `busy-always` proxy scenario verifies the limit deterministically.

## Intervention required

Automation cannot safely continue but the same live session can be handed to a human operator.

The unexpected account-warning dialog transfers ownership before account navigation. Automation
actions are blocked until the matching intervention returns control.

## Hard failure

Execution stops with structured context including the failing step, expected state, observed state, and evidence references.

The controlled permission-denied state maps to `permission_denied` and captures screenshot plus DOM
evidence. Those raw artifacts are marked unredacted and are not committed.

Generic failures include step ID when a step has started, a stable failure code, value-free
expected/observed diagnostics where available, recovery history, and evidence references. Capture
failure is recorded without replacing the original failure. Cleanup failures turn an otherwise
successful run into `surface_error`; they append context to an existing failure. Invalid artifacts
or inputs fail before opening, using `unexpected_state` from the existing result vocabulary.

Declared hard/intervention guards take precedence over recoverable guards and business outcomes.
Business outcomes are checked before the step checkpoint and before subsequent extraction. Missing
business-message targets mean no matching outcome, not MEMBER_NOT_FOUND. Ordinary missing action
targets fail with `target_not_found`.
