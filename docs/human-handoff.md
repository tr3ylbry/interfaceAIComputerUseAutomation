# Human handoff

Human intervention must operate on the same live surface session used by automation.

## Control states

`automation_running -> paused_for_intervention -> human_control -> resuming_automation -> automation_running`

Terminal states are `completed` and `failed`.

## Ownership invariant

At most one actor owns the session. Transitional paused/resuming states have no active owner. A monotonically increasing control `epoch` gives implementations a way to reject stale actions from a prior owner and avoid split-brain control.

## Evidence

The intervention request carries the current goal/capability, step, reason, state summary, and evidence. Human actions should be recorded in redacted form before control returns to automation.

## Implemented replay lifecycle

The coordinator creates an InterventionRequest for declared operator-review conditions, risky
actions, or configured recovery exhaustion. It emits requested/granted events, relinquishes the
same live session, and retains request, context and events under the intervention ID. A terminal
`intervention_required` result references this retained handoff; it does not close the browser.

Call `getHandoff(id)` to retrieve the snapshot and `releaseHandoff(id)` to dispose of its session.
The adapter supports matching-ID reacquisition. Old target references are invalid after handoff,
and ownership cannot be transferred while an action is in flight. Automated tests assert unchanged
page identity, owner transitions, epochs, and rejection of stale references.

The headless demo reacquires and releases solely to verify the lifecycle. Real human interaction
requires `headless: false`. No operator console, action recorder, human-approval bypass, or automatic
continuation is implemented. A subsequent continuation design must recheck location, policy and
checkpoints before acting; reacquiring ownership alone must not imply approval of a risky action.

The pre-request navigation guard remains attached to the same context/page throughout handoff.
Human ownership does not expand the capability's origin/path allowlist. If a human causes a denied
document navigation, the guard blocks and latches it; reacquisition fails rather than resuming in
an invalid session. Explicit handoff disposal still closes/releases that session. A previously
returned intervention result is not retroactively rewritten and no monitoring console is provided.
Automation-originated allowlist violations return `failure/policy_violation`, not intervention.
