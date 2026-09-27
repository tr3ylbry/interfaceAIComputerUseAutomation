# Architecture

## Product boundary

The model discovers. The artifact becomes the reusable capability. Deterministic replay is the production path.

## Primary components

- **Discovery engine** — LLM-driven observe → decide → act loop.
- **Artifact compiler** — converts successful discovery evidence into a normalized capability artifact.
- **Replay engine** — binds invocation inputs and executes capability steps without an LLM decision loop.
- **Surface adapter** — isolates perception/action mechanics from the artifact and replay contracts.
- **Policy engine** — evaluates every proposed action before execution.
- **Evidence recorder** — writes structured events plus richer failure evidence.
- **Intervention coordinator** — pauses automation, transfers the same live session to a human, and safely resumes.

## Dependency direction

`discovery/replay -> core contracts -> surface adapter`

Playwright-specific types must not appear in the serialized capability schema.

## Implemented vertical slice

`PlaywrightSurfaceAdapter` is the first concrete web adapter. It owns browser/context/page
objects, translates contract locator strategies into Playwright locators, and stores those
objects behind opaque runtime references. Resolution always walks the artifact strategies in
array order and reports the successful zero-based strategy index.

The controlled LegacyCore proxy exercises the boundary with an incorrect semantic label that
requires CSS fallback, table layout, an account iframe, a known host-busy interstitial, a
permission failure, and a risky dialog. The canonical model-free slice reads the fake savings
balance for member `12345`.

Surface checkpoints evaluate visible UI and location state. Output checkpoints remain a replay
concern because only replay owns the bound output map. The coordinator now implements that boundary,
including nested all/any conditions containing both UI and output checks.

## Generic deterministic replay

`src/replay/coordinator.ts` interprets a validated saved artifact. `values.ts` validates invocation
types/constraints, resolves expressions, and performs strict extraction transforms. `policy.ts`
checks origins, anchored path globs, actions and risk; an injected evaluator can further restrict
approval. `validation.ts` verifies cross-references before any browser opens. Runtime state is
separate from the parsed artifact and invocation values never mutate the caller's artifact.

Execution order is: validate → approve/open → inspect declared runtime conditions and business
outcomes → approve action → resolve target → execute → inspect outcomes → verify checkpoint.
Each step emits start/completion events; target resolution records its strategy index. Checkpoints,
policy decisions, recovery attempts and control transfers are observable. Results are validated
against the existing four-way ReplayResult union, including failure during validation or cleanup.

Schema 1.1 adds optional `runtimeConditions` because 1.0 could not express the proxy's permission,
busy, and operator-review screens. Each condition uses a normal checkpoint and a declared
disposition. Version 1.0 without these conditions remains supported. ADR-006 records alternatives,
versioning rationale, recovery semantics, and policy limitations.

The coordinator processes one step at a time. UI checkpoints use bounded condition polling with
injectable clock/sleep dependencies; output checks are immediate because replay is their only
writer. Runtime condition probes are immediate and do not each consume their full timeout. A
compound UI checkpoint uses its largest leaf timeout as the overall polling budget.

Recovery counts explicit attempts beyond the original action. It may click a declared dismiss
target, then recheck the interrupted checkpoint; it never blindly reissues the original click.
An action error whose effects are uncertain stops with a failure. Runtime conditions and business
outcomes are evaluated after recovery as well as ordinary actions.

## Session ownership

The adapter retains one browser context and page throughout handoff. Relinquish and reacquire
advance an ownership epoch through the existing transition states. Automation actions are
rejected while the human owns the session, and intervention identifiers must match on return.
Headful adapter mode exposes the same live browser window to an operator; headless mode is used
for deterministic CI tests of the ownership invariant.

The coordinator retains InterventionRequest, session, event history and runtime context in an
in-memory handoff map. `getHandoff` returns a snapshot; `releaseHandoff` closes the retained session.
Normal terminal results close their sessions. A failed handoff also closes the session. Automatic
continuation is deliberately absent. Adapter handoff rejects in-flight actions and invalidates
old target references; target resolution detects ownership changes across awaits.

## Core invariants

1. Every executable replay step is explicit in the artifact.
2. Replay never asks an LLM what to do next.
3. Every UI action is policy-checked before execution.
4. Logical targets resolve via a deterministic ordered strategy list.
5. Checkpoints verify state transitions instead of assuming clicks succeeded.
6. Legitimate business outcomes are not flattened into automation failures.
7. Recoverable conditions use bounded policies and remain observable in the run log.
8. Only one actor owns the live session at a time.
9. Artifacts and logs must not persist secrets or raw sensitive data.

Raw adapter evidence is accurately marked `redacted: false`. The demo uses fake data, stores
runtime evidence under an ignored directory, and does not claim redaction that has not occurred.
Generic replay requires explicit opt-in to capture it. Logs omit raw input/output values and
browser exception text; callers remain responsible for protecting returned outputs and handoffs.
