# Computer-Use Automation System

Take-home project for interface.ai.

The system is designed around a simple product boundary:

> The model discovers. The artifact becomes the reusable capability. Deterministic replay is the production execution path.

## Current status

The core contracts and first concrete browser vertical slice are implemented.

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

Implemented browser slice:

- Playwright-backed `SurfaceAdapter` with ordered locator fallback reporting
- navigation, click, fill, select, and read/extract actions
- UI/location checkpoint evaluation and failure evidence capture
- same-page automation → human → automation ownership transfer
- controlled fake LegacyCore proxy with table markup and an account iframe
- canonical model-free lookup: member `12345` → savings balance `$4,321.09`
- deterministic not-found, host-busy, permission-denied, and intervention scenarios

No LLM discovery loop or provider has been selected.

## Setup

Requirements: Node.js 22 or newer.

```bash
npm install
npx playwright install chromium
npm run typecheck
npm test
```

The browser integration tests start the proxy on an ephemeral loopback port. In restricted
environments, local port and browser-process permission may be required.

## Run the controlled proxy

```bash
npm run proxy
```

Open `http://127.0.0.1:3000/member-search`. Choose a state with the `scenario` query parameter:

- `success`
- `not-found`
- `slow`
- `permission-denied`
- `intervention`

For example: `http://127.0.0.1:3000/member-search?scenario=slow`.

Run the canonical headless adapter exercise with:

```bash
npm run demo
```

Runtime screenshots, DOM snapshots, and traces go under ignored `evidence/runtime/`. They are raw,
marked unredacted, and must not be committed.

## Dependency audit

The remaining two moderate audit entries are the direct development dependency `vitest@3.2.7`
and its transitive `@vitest/mocker@3.2.7`, both representing the same redirect-mock path traversal
advisory. Production-only audit is clean, the affected mock feature is unused, and npm offers only a
SemVer-major automatic remediation. The finding is intentionally unresolved rather than applying
`npm audit fix --force`; details are in `docs/dependency-audit.md`.

## Remaining roadmap

1. Accept a natural-language goal and target.
2. Run a real LLM-driven observe → decide → act discovery loop.
3. Normalize the successful run into a typed/versioned capability artifact.
4. Replay that artifact with new inputs and no LLM decisions. A narrow model-free validation runner
   exists, but the generic replay coordinator is not implemented yet.
5. Detect business outcomes, bounded recoverable conditions, hard failures, and intervention requirements.
6. Enforce policy before every action.
7. Preserve structured evidence.
8. Pause and transfer control of the same live session to a human when required.
