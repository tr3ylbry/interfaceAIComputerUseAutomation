# Computer-Use Automation System

Take-home project for interface.ai.

The system is designed around a simple product boundary:

> The model discovers. The artifact becomes the reusable capability. Deterministic replay is the production execution path.

## Current status

The core contracts, browser adapter, and generic deterministic replay coordinator are implemented.

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

Saved capabilities can now be invoked through `ReplayCoordinator.run(artifact, inputs)`. Replay
validates inputs, binds expressions in memory, enforces policy, executes declared steps, evaluates
business outcomes and checkpoints, extracts typed outputs, and returns a validated `ReplayResult`.
The coordinator imports only contracts and standard Node modules; it contains no bank-specific or
model logic. Schema 1.1 adds declarative runtime conditions; existing 1.0 artifacts without those
conditions remain supported. Draft fixtures require an explicit `allowDraft` development option.

Browser document navigation is now checked before request egress, including links, forms, frames
and redirects. Forbidden requests return `policy_violation`; server-counter tests verify that
destinations receive zero requests. Ordinary cross-origin rendering resources remain allowed.
This is Chromium-specific navigation enforcement, not a general network sandbox (see ADR-007 and
`docs/safety-model.md`). A custom web adapter must support the runtime navigation guard.

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
- `busy-always` (recovery exhaustion)
- `permission-denied`
- `intervention`

For example: `http://127.0.0.1:3000/member-search?scenario=slow`.

Run the saved artifact through generic headless replay with:

```bash
npm run demo
npm run demo -- not-found
npm run demo -- slow
npm run demo -- busy-always
npm run demo -- permission-denied
npm run demo -- intervention
```

Each demo starts an ephemeral local proxy and executes the same saved JSON capability with only
endpoint/scenario configuration changed. Success returns `outputs.savings_balance: 4321.09`.
The intervention smoke run verifies same-page reacquisition and explicitly releases the session;
it does not simulate human approval or continue the interrupted run.

For programmatic use, import `ReplayCoordinator` from `src/replay/index.ts`, construct it with a
`SurfaceAdapter`, and call `run(savedArtifact, { member_id: "12345" })`. On intervention, retrieve
the `InterventionRequest`, live session, and runtime context with `getHandoff(interventionId)`.
The caller owns disposal through `releaseHandoff(interventionId)`. Use a headful adapter for a
human browser window. `onEvent` receives value-free structured events; no database is required.

Raw evidence capture is disabled by default in replay. The fake-data demo opts in with
`captureRawEvidence: true`. Screenshots and DOM snapshots go under ignored `evidence/runtime/`;
they are marked unredacted and must not be committed. Returned outputs and in-memory handoff
context can contain caller data and must not be persisted indiscriminately.

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
4. Add production evidence redaction and retention to the proven generic replay path.
5. Add explicit, checkpoint-verified continuation after human review if the submission needs it.

The earlier `member-savings.ts` runner remains as the original adapter regression fixture; `npm run
demo` uses the saved artifact and generic coordinator. Recovery never repeats an uncertain original
action. Its explicit recovery clicks are policy checked; exhaustion defaults to failure and can be
configured to request intervention. Location policy checks explicit destinations before execution
and browser document requests before egress. Frames share the capability allowlist; unsupported
auxiliary pages and service workers are disabled/blocked. The same guard stays active during human
control. No additional setup is required; `npm test` includes the navigation hit-counter matrix.
