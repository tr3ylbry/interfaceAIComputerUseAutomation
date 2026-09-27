# Build journal

## 2026-09-27 — Core contract finalization

### Goal

Finalize the smallest defensible architecture contracts before implementation-heavy work.

### Changes

- Added runtime-validated capability, locator, checkpoint, replay, surface, and intervention contracts.
- Defined deterministic terminal replay results.
- Modeled recoverable conditions as structured runtime events rather than terminal outcomes.
- Added explicit same-session control ownership states and transition rules.
- Mirrored the initial architecture decisions into repository ADRs.

### Next step

Choose the LLM provider/integration shape and scaffold the Playwright adapter plus controlled legacy-bank target.

## 2026-09-27 — Playwright surface vertical slice

### Goal

Prove the surface abstraction against a controlled legacy-style web target without adding an LLM
or a general replay engine.

### Changes

- Added the Playwright web adapter with opaque resolved targets, ordered fallbacks, contract actions,
  UI checkpoints, failure evidence, and explicit same-session ownership transitions.
- Added the fake LegacyCore proxy and deterministic success, business-outcome, recoverable,
  permission-failure, and intervention scenarios.
- Added a narrow model-free member-savings runner to validate the canonical flow and bounded recovery.
- Added focused integration tests for locator order, failure, checkpoints, ownership, and outcome taxonomy.
- Added Playwright setup/run scripts and updated the serialized capability fixture for the real iframe flow.

### Findings

- Existing contracts were sufficient; Playwright types did not leak into serialized artifacts.
- Output checkpoints cannot be evaluated by the surface alone because outputs belong to replay. The
  adapter makes this explicit and leaves evaluation to the future replay layer.
- Evidence capture is raw at this stage and therefore marked unredacted. Only fake demo data is used.
- The two moderate npm findings are one development-only Vitest advisory; see
  `docs/dependency-audit.md`.

### Next step

Implement the smallest generic deterministic replay coordinator that binds values, evaluates
business outcomes before extraction, applies declared bounded recovery policies, and records the
existing event/result contracts. Do not introduce LLM discovery yet.

## 2026-09-27 — Generic deterministic replay

### Goal and changes

Invoke a saved capability through a generic coordinator with no application-specific execution
code or model decisions. Added `src/replay/` for orchestration, policy, binding and reference
validation. The demo now uses the JSON artifact. Added `busy-always` for deterministic exhaustion;
the previous adapter runner remains a regression fixture.

### Problems, alternatives and decisions

- Contracts described recovery budgets but not the screens that trigger them. Application callbacks
  would make the artifact insufficient; adapter classification would mix domain semantics into
  mechanics. ADR-006 chooses checkpoint-based runtime conditions in schema 1.1. Earlier 1.0 artifacts
  remain valid without conditions; old readers reject the new version.
- Replay owns output values, so mixed UI/output checkpoints are evaluated recursively at replay
  level. Only bound surface conditions are delegated. Caller values never mutate the artifact.
- Blind retries can duplicate side effects. Recovery uses explicit policy-checked controls or rechecks
  state. Attempts are events because a recovered run can still succeed. Exhaustion defaults to failure
  and optionally transfers control.
- Review exposed stale references and action/handoff overlap in the adapter. Handoff now rejects
  in-flight actions and clears references; resolution checks its ownership epoch.
- A browser run caught a one-millisecond visibility wait expiring on the legitimate not-found screen.
  Probes now read immediate state; replay retains the bounded condition wait.
- Raw capture is opt-in. Diagnostics preserve codes, step IDs, expected/observed status and recovery
  history without persisting raw browser errors or invocation values.

### Validation and limits

Typecheck passes and all 43 tests pass. Unit tests use a fake SurfaceAdapter and injectable clock/sleep.
Browser tests invoke the saved artifact across success, business outcome, busy recovery/exhaustion,
denial and intervention. Policy ordering, output reuse, checkpoints, ownership, stale-reference
rejection, and absence of model/application imports are explicitly checked.

All six command-line scenarios also passed: success returned 4321.09; not-found returned
MEMBER_NOT_FOUND; slow recovered on attempt 1; persistent busy stopped after attempts 1 and 2;
permission denial returned permission_denied; intervention preserved the page through epochs 2→4.
The standalone proxy returned HTTP 200. Generated failure evidence remains under ignored
`evidence/runtime/` and is not submission evidence of discovery.

Location policy blocks explicit destinations before execution and checks implicit navigation afterward.
It does not prevent an approved click from sending a request elsewhere. Human ownership transfer is
proven; human approval and automatic continuation are not. Evidence stays ignored and unredacted;
private interview notes are updated locally and remain untracked.

### Next step

Add browser-level navigation enforcement for allowed origins/routes, with link, form, iframe and
redirect escape tests, so requests are constrained before leaving the allowed surface. Then define
discovery integration without selecting a model provider implicitly.
