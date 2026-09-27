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
concern because only replay owns the bound output map; the adapter reports that boundary instead
of acquiring replay state or changing the core contract.

## Session ownership

The adapter retains one browser context and page throughout handoff. Relinquish and reacquire
advance an ownership epoch through the existing transition states. Automation actions are
rejected while the human owns the session, and intervention identifiers must match on return.
Headful adapter mode exposes the same live browser window to an operator; headless mode is used
for deterministic CI tests of the ownership invariant.

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
