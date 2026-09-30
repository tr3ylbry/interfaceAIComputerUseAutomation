# ADR-010: Recorded human ownership and explicit scoped completion

**Status:** Implemented and automatically tested; genuine-human acceptance pending.

## Context

The submission audit confirmed that ownership transitions alone do not satisfy the assignment.
Actual manual interactions must be recorded, and explicit return must lead to verified automation
work on the same session. A console and general automatic continuation are not required.

## Options and decision

- Browser traces alone preserve too much raw data and do not give a safe action-level record.
- A custom operator UI could route every input, but adds unnecessary infrastructure and another
  interaction surface. It is not needed for a locally headed browser.
- Fixed page instrumentation plus a bounded Node binding observes real browser-native events.
  Choose this, installed before granting human ownership, with a Node ownership/epoch gate.
- General mid-artifact resume would need durable execution state, side-effect reconciliation and
  broader continuation policy. Instead, implement a separately named controlled-bank completion
  procedure after explicit terminal handback. The original replay result remains intervention_required.

Reuse HumanActionRecord and add a browser-independent HumanActionRecording envelope with intervention
ID, epoch, actions and overflow status. The retained intervention associates it with the run.
Browser instrumentation stays in adapters; artifact schemas, provider settings and generic replay
execution are unchanged. The adapter exposes a snapshot for the operator runner.

## Mechanics and safety

Capture trusted click/input/change events in the managed page and child documents. Initialization
scripts reinstall listeners after navigation. Fixed classifications replace arbitrary control names,
labels, HTML and values. Typing never reads or records the value; selection omits options. Navigation
events use existing origin-only diagnostics privately; public projection omits even those origins.
Script-dispatched DOM events are ignored. Playwright's native input simulations can be trusted events
too: this is NOT proof that a person, rather than a test driver, performed the input.

The Node gate accepts only the current human epoch. It closes synchronously before resuming_automation;
late old-epoch messages cannot enter the next ownership interval. Automation refs remain invalidated,
and navigation confinement remains installed throughout. Overflow at 1,000 records marks evidence
incomplete and blocks the acceptance runner's completion/publication claim.

The terminal requires `return`; a browser click never hands control back automatically. The scoped
completion validates intervention identity/context, checks the warning is hidden, then independently
policy-checks account navigation and savings extraction. It checks location, currency format and typed
output on the same session. This is controlled fixture code outside generic replay, not a blanket
approval, artifact rewrite or second terminal result for the original invocation.

Publication adds one strict value-free handoff profile to ADR-009's existing gate, not a redaction
exception. It verifies the ownership sequence/epochs and completion checkpoints; fields remain
allowlisted and sensitive-content rejection remains unchanged. The operator separately reviews the
candidate and types `publish`. Raw result/context stay private; no screenshot/trace is exported.

## Evidence, tradeoffs and revisit conditions

`tests/human-handoff.test.ts` uses explicitly labelled browser simulations for interaction categories,
frames/navigation, stale events, exclusivity, overflow, same Page/BrowserContext, blocked navigation
with zero forbidden hits, unresolved-state rejection, completion and public validation.
`npm run demo:handoff` is reserved for the author's personal acceptance run. No such run was performed
by the implementation agent; submission acceptance remains partial until the author reports it.

Fixed roles sacrifice detailed semantic descriptions to prevent UI text/value leakage. Records are
receipt-scoped, not lossless OS input auditing: unloaded documents/bridge failures can lose events;
new-document instrumentation has a bootstrap interval. No popup, native browser-chrome, file chooser,
closed-shadow-root or desktop action recorder is claimed. Navigation can include application-triggered
frame loads during human ownership; it does not prove a human initiated every network transition.
The trusted configured demo is not an adversarial page or authenticated operator environment.
Revisit for arbitrary continuation, hostile content, lossless auditing, multi-page/native surfaces,
crash recovery, persistent ownership or richer safe target descriptions.
