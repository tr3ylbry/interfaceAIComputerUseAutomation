# Computer-Use Automation System

Take-home project for interface.ai.

The system is designed around a simple product boundary:

> The model discovers. The artifact becomes the reusable capability. Deterministic replay is the production execution path.

## Current status

The core contracts, browser adapter, generic deterministic replay, bounded discovery coordinator,
OpenAI provider adapter and artifact compiler are implemented. **Genuine discovery → generated
artifact → different-input, model-free replay is demonstrated.** Attempt #2, run
`aafa19ac-42a4-4550-b25b-7d57b4589c66`, used gpt-6-astra/medium for five turns, read `4321.09` for
fake member `12345`, then replayed its unchanged artifact for `67890`, returning `8765.43` with
zero replay model calls. See the [reviewed evidence](evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/review-manifest.json).
The first attempt's HTTP 429 remains preserved under
`evidence/discovery/92eb2d6e-cdba-47e9-9051-bb442492f466/`. Offline tests pass 182/182.

Submission audit: the discovery/replay through-line is proven, but **handoff acceptance is incomplete**.
Manual human-action recording and a demonstrated manual-work → handback → automation completion
path are still required. See the [requirement matrix](docs/submission-readiness.md).

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

The hand-authored fixture at `examples/member-savings-balance.capability.json` exercises replay
branches. The separate [live-generated draft](evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/capability.json)
is the exact artifact used in attempt #2's different-input replay; it retains that run's ephemeral
proxy endpoint and is not automatically rebound after a restart.

Implemented browser slice:

- Playwright-backed `SurfaceAdapter` with ordered locator fallback reporting
- navigation, click, fill, select, and read/extract actions
- UI/location checkpoint evaluation and failure evidence capture
- same-page automation → human → automation ownership transfer
- controlled fake LegacyCore proxy with table markup and an account iframe
- canonical model-free lookup: member `12345` → savings balance `$4,321.09`
- deterministic not-found, host-busy, permission-denied, and intervention scenarios

Discovery uses OpenAI Responses with `gpt-6-astra`, medium reasoning, `store: false`, strict function
tools and parallel calls disabled (ADR-008). Each turn includes a live screenshot and compact
structured controls. The model proposes one action; independent validation and policy precede
SurfaceAdapter execution. The provider is not imported by replay.

Saved capabilities can now be invoked through `ReplayCoordinator.run(artifact, inputs)`. Replay
validates inputs, binds expressions in memory, enforces policy, executes declared steps, evaluates
business outcomes and checkpoints, extracts typed outputs, and returns a validated `ReplayResult`.
The replay path has no model/provider or bank-specific dependency; it uses contracts, Node modules
and local replay policy/value/validation modules. Schema 1.1 adds declarative runtime conditions;
existing 1.0 artifacts without those conditions remain supported. Draft fixtures require an explicit
`allowDraft` development option.

Browser document navigation is now checked before request egress, including links, forms, frames
and redirects. Forbidden requests return `policy_violation`; server-counter tests verify that
destinations receive zero requests. Ordinary cross-origin rendering resources remain allowed.
This is Chromium-specific navigation enforcement, not a general network sandbox (see ADR-007 and
`docs/safety-model.md`). A custom web adapter must support the runtime navigation guard.

## Setup

Requirements: Node.js 22 or newer, npm, and Chromium (installed below). Install development
dependencies too: Playwright and the TypeScript build tools are needed by the demo commands.

```bash
git clone https://github.com/tr3ylbry/interfaceAIComputerUseAutomation.git
cd interfaceAIComputerUseAutomation
npm ci
npx playwright install chromium
npm run typecheck
npm test
```

On Linux hosts missing browser system libraries, use `npx playwright install --with-deps chromium`
(system-package installation may require administrator permission). Initial dependency/browser
installation needs network access; tests and replay demos thereafter need no API key or live service.
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
If port 3000 is occupied, set `PORT` for the proxy command; replay demos use their own ephemeral port.

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
The [published exceptional replay](evidence/discovery/d7727060-ec70-4f74-b4a8-501825698825/replay.sanitized.json)
preserves a separate model-free `not-found` run, not a learned branch of the generated happy path.

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

## Run real discovery, compile, then replay

Provide `OPENAI_API_KEY` through your environment or an ignored `.env.local` file; never paste it into
logs or commit it. Copy `.env.example` to `.env.local`, uncomment the key entry and replace its placeholder locally,
or use your shell's secure environment configuration. `OPENAI_MODEL` is optional and defaults to
`gpt-6-astra`. Only the discovery command loads local env files. Then run:

```bash
npm run discover
```

This is an explicit paid API integration run, not part of `npm test`. It starts the fake bank,
supplies the natural-language goal plus declared `member_id` input and `savings_balance` output,
and makes one bounded discovery attempt. It does **not** read the hand-authored example capability.
On verified completion it compiles/saves a schema-1.1 draft, opens a fresh replay session using
member `67890`, expects `8765.43`, and asserts no additional model calls. Without credentials it
exits before starting the browser/API and creates no discovery evidence.

The caller request is in `src/vertical-slice/discovery-request.ts`. Its unordered inquiry-control
permissions authorize Search and Account Information; they are not saved steps or locators. Unknown
clicks require human review or are blocked by policy. Fills/selects may only use declared values.
Generated drafts need review; this demo explicitly allows draft replay.

Evidence goes to ignored `evidence/runtime/discovery/<run-id>/`: raw structured run, screenshots,
value-free tool trace, `capability.json`, raw replay result and proof manifest. Raw observations can
contain declared sensitive values; only the minimal tool trace is sanitized. See `evidence/README.md`.
The artifact targets that run's proxy endpoint; endpoint rebinding across restarts is not automated.
The CLI releases any intervention because it has no operator UI; library callers can retain the
same live session through `DiscoveryCoordinator.getHandoff` and explicitly `releaseHandoff`.

The browser-backed **scripted-model** test proves fill → Search → Account Information → read → finish,
compilation and different-input model-free replay. It is not proof that a real model chose those actions.
Normal tests need no API key/network access beyond the local browser fixtures.
For just that offline pipeline: `npm test -- tests/discovery-browser.test.ts`.
To inspect/validate the existing public bundles without an API call, use the copyable fake-fixture
validation command in [evidence/README.md](evidence/README.md#validate-the-committed-fixture-bundles).

The first live attempt used this command unchanged, with a present key and the requested model.
It made one API request and did not retry. The provider adapter records only the HTTP status on
failure, so `provider_http_429` alone cannot distinguish rate limiting from quota/billing limits.
Its evidence remains unchanged. After credits were added and the unrelated preflight tests were
hardened, a separately authorized second attempt succeeded without prompt or production changes.
The real model selected fill → Search → Account Information → read Savings → finish. All four UI
actions passed policy; live-source finish verification passed. Discovery took 21.134 seconds and
fresh replay took 484 ms. Every replay target resolved at strategy index 0; all four checkpoint
events matched. No retries, rejected proposals, human intervention or artifact repair occurred.

This validates one controlled happy path and a second fake input, not general UI robustness or
tenant portability. Both image and semantic observations were sent; this trace cannot isolate
the contribution of visual reasoning. Raw screenshots/logs remain ignored and unredacted.

## Remaining acceptance work and deliberate cuts

The next required task is minimal, safely recorded manual work in the same session, followed by
explicit handback and demonstrated automation completion. Control-transfer events alone do not
satisfy that requirement. No operator console or automatic continuation is required for this fix.

Authenticated artifact approval is stretch work, not a submission prerequisite. Desktop execution,
tenant binding implementation, learned failure branches, production raw-data redaction/retention,
and automatic continuation remain outside this slice. Happy-path compilation does not invent
MEMBER_NOT_FOUND or host-busy declarations from the hand-authored fixture. Further paid discovery
requires separate authorization; the accepted genuine bundle remains unchanged.

The earlier `member-savings.ts` runner remains as the original adapter regression fixture; `npm run
demo` uses the saved artifact and generic coordinator. Recovery never repeats an uncertain original
action. Its explicit recovery clicks are policy checked; exhaustion defaults to failure and can be
configured to request intervention. Location policy checks explicit destinations before execution
and browser document requests before egress. Frames share the capability allowlist; unsupported
auxiliary pages and service workers are disabled/blocked. The same guard stays active during human
control. No additional setup is required; `npm test` includes the navigation hit-counter matrix.
