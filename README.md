# Computer-Use Automation System

Take-home project for interface.ai.

The system is designed around a simple product boundary:

> The model discovers. The artifact becomes the reusable capability. Deterministic replay is the production execution path.

## Current status

Architecture contracts are finalized first so implementation stays constrained by explicit, reviewable interfaces.

Implemented contract layer:

- `CapabilityArtifact`
- `CapabilityStep`
- `TargetDescriptor`
- `LocatorStrategy`
- `Checkpoint`
- `ParameterDefinition`
- `OutputDefinition`
- `SurfaceAdapter`
- `SurfaceAction`
- `ReplayResult`
- `InterventionRequest`
- same-session automation/human control-state model

See `docs/decisions/0005-targeting-and-core-contracts.md` for rationale and invariants.

A non-evidence serialized fixture lives at `examples/member-savings-balance.capability.json` to make the artifact contract easy to inspect before the real discovery run exists.

## Planned vertical slice

1. Accept a natural-language goal and target.
2. Run a real LLM-driven observe → decide → act discovery loop.
3. Normalize the successful run into a typed/versioned capability artifact.
4. Replay that artifact with new inputs and no LLM decisions.
5. Detect business outcomes, bounded recoverable conditions, hard failures, and intervention requirements.
6. Enforce policy before every action.
7. Preserve structured evidence.
8. Pause and transfer control of the same live session to a human when required.

## Repository status

Implementation scaffolding beyond the contract layer is intentionally deferred until the contracts are stable.
