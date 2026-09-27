# Human handoff

Human intervention must operate on the same live surface session used by automation.

## Control states

`automation_running -> paused_for_intervention -> human_control -> resuming_automation -> automation_running`

Terminal states are `completed` and `failed`.

## Ownership invariant

At most one actor owns the session. Transitional paused/resuming states have no active owner. A monotonically increasing control `epoch` gives implementations a way to reject stale actions from a prior owner and avoid split-brain control.

## Evidence

The intervention request carries the current goal/capability, step, reason, state summary, and evidence. Human actions should be recorded in redacted form before control returns to automation.
