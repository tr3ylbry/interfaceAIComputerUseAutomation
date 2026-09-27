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
