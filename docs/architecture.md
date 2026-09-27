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
