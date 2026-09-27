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
