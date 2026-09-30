# Human handoff

Human intervention must operate on the same live surface session used by automation.

## Control states

`automation_running -> paused_for_intervention -> human_control -> resuming_automation -> automation_running`

Terminal states are `completed` and `failed`.

## Ownership invariant

At most one actor owns the session. Transitional paused/resuming states have no active owner. A monotonically increasing control `epoch` gives implementations a way to reject stale actions from a prior owner and avoid split-brain control.

## Evidence

The intervention request carries the current goal/capability, step, reason, state summary, and evidence. Human actions should be recorded in redacted form before control returns to automation.

The 2026-09-28 audit identified missing manual recording/completion as a submission blocker.
The recorder and explicit scoped completion are now implemented (ADR-010) and tested with simulated
browser input. **Genuine-human acceptance remains pending:** automated tests are not a person's
manual pass. Ownership history alone remains insufficient.

## Implemented replay lifecycle

The coordinator creates an InterventionRequest for declared operator-review conditions, risky
actions, or configured recovery exhaustion. It emits requested/granted events, relinquishes the
same live session, and retains request, context and events under the intervention ID. A terminal
`intervention_required` result references this retained handoff; it does not close the browser.

Call `getHandoff(id)` to retrieve the snapshot and `releaseHandoff(id)` to dispose of its session.
The adapter supports matching-ID reacquisition. Old target references are invalid after handoff,
and ownership cannot be transferred while an action is in flight. Automated tests assert unchanged
page identity, owner transitions, epochs, and rejection of stale references.

The original headless `demo -- intervention` remains a lifecycle smoke test. `demo:handoff` is the
separate headed acceptance path described below. Reacquisition never implies approval of a risky
action; no operator console or general automatic continuation is implemented.

The pre-request navigation guard remains attached to the same context/page throughout handoff.
Human ownership does not expand the capability's origin/path allowlist. If a human causes a denied
document navigation, the guard blocks and latches it; reacquisition fails rather than resuming in
an invalid session. Explicit handoff disposal still closes/releases that session. A previously
returned intervention result is not retroactively rewritten and no monitoring console is provided.
Automation-originated allowlist violations return `failure/policy_violation`, not intervention.

## Discovery handoff

Discovery uses the same adapter ownership model. `request_human`, an unexpected visible dialog,
or a policy decision of `require_human` creates an InterventionRequest and retains the live
session, handle and normalized run. `DiscoveryCoordinator.getHandoff(id)` returns a snapshot;
`releaseHandoff(id)` explicitly closes it. There is no automatic resumption or implied approval.

Ephemeral observation refs are cleared on transfer and cannot be reused after reacquisition.
Ownership is revoked before asynchronous handle disposal. Browser-backed tests verify the same
page identity, automation rejection under human ownership and epochs 2→4 on return. Raw run context
includes screenshots/input values and must be treated as sensitive. The library retains it; the
headless `npm run discover` smoke CLI has no operator UI and explicitly releases any handoff.

## Recorded ownership interval

Before granting human control, the adapter installs fixed click/input/change listeners in existing
frames and a page initialization script for future documents. A narrow binding accepts enum-valued
metadata only while Node observes human ownership and the matching epoch. Browser-native events
are captured whether a person uses the mouse/keyboard or an automated test simulates native input;
script-dispatched events are ignored. This is observation, not human identity attestation.

`getHumanRecording(session, interventionId)` returns a copy of HumanActionRecords in an intervention/
epoch envelope. The retained InterventionRequest ties the recording to its run. Recorded categories:
click; type/input (including contenteditable); select/change (including checkbox/radio changes);
main/child document navigation. Safe target summaries are fixed tags/categories, not UI-provided text.
No typed value, label, option text, HTML or DOM object is persisted. Private navigation summaries use
the existing origin-only URL diagnostic; public summaries omit destinations entirely.

On handback, the Node gate closes before human_control → resuming_automation → automation_running.
Epochs advance 2 → 3 → 4; old browser messages are ignored. Automation refs remain invalid, and the
same page/context/session survives. Recording is capped at 1,000 events; overflow fails acceptance.
Late messages after the cutoff are ignored rather than attributed to automation or a later operator.

## Personal acceptance instructions

1. From an interactive terminal on a graphical desktop, run `npm run demo:handoff`. No API key is needed.
2. Wait for the terminal to say automation is paused. In the existing Chromium window, personally
   click **Operator reviewed**. Do not click Account Information or navigate away.
3. Return to the terminal, type **return**, and press Enter. Anything else aborts; Ctrl-C cancels.
4. Automation verifies the same member/location and closed warning, policy-checks a click on Account
   Information, checks its URL, reads Savings in the iframe, validates currency and returns **4321.09**.
   It performs real post-handback work; it does not close immediately or repeat the original search.
5. Review the displayed value-free candidate. Type **publish** and Enter to publish through the
   existing gate, or just Enter to keep it private. Publication does not commit anything.
6. Report the run ID and your personal result. Only then can genuine-human acceptance be reviewed
   and marked proven. Neither the script nor this implementation claims independent human verification.

The private `evidence/runtime/handoff/<run-id>/handoff.raw.json` retains the intervention result,
ownership snapshots, records and completion events/output, labelled unredacted. A successful run
also writes a validated `handoff.sanitized.json` candidate there. Explicit publication produces
`evidence/discovery/<run-id>/handoff.sanitized.json` plus `publication-manifest.json`, with raw-source
hash/bytes and no values, destinations, browser objects, screenshots or local paths. The directory
name is shared with the existing publisher; these are handoff records, not new discovery runs.

## Deliberate limits

Completion is a small controlled-bank procedure outside generic replay. It only accepts the known
search-member/operator-warning context, uses the original policy and checks the manual resolution.
The original intervention result is preserved; completion is a separate explicit operation. This is
not arbitrary artifact continuation, learning human actions into artifacts, or bypassing approvals.
No crash recovery, multi-page recorder, native browser UI/file chooser, closed-shadow-root or desktop
capture is claimed. Page initialization/unload/bridge boundaries can lose events; `incomplete` flags
the known overflow case, not a guarantee of lossless input auditing. Frame navigation may be initiated
by the application during human ownership. Fixed categories intentionally omit richer private labels.
