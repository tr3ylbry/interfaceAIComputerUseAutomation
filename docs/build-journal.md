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

## 2026-09-27 — Pre-request navigation policy

### Goal and implementation

Prevent disallowed document requests before they reach a server, rather than detect escape after
an approved click. Added a generic URL evaluator and runtime navigation-guard opening option,
Chromium request enforcement, typed policy-denial propagation and destination-counter tests.
The saved savings artifact now explicitly permits its account frame route. No artifact schema,
ReplayResult union, LLM dependency, operator UI or service was introduced.

### Findings, alternatives and tradeoffs

- `open(target)` had no way to receive policy before the first request. ADR-007 adds a small
  browser-independent callback and support flag; web replay rejects unsupported adapters before
  opening. Playwright/CDP objects remain entirely behind the adapter.
- Inspection of the installed Playwright Chromium implementation exposed automatic continuation
  of redirect hops without a user route callback. Context routing alone was therefore insufficient.
  We chose context routing plus Fetch Request-stage Document interception. Manual redirect fetching
  could distort browser semantics; a proxy would add unnecessary infrastructure; DOM interception
  misses indirect navigation. Redirect-chain counter tests prove the selected approach.
- Frames share the capability allowlist. Same-process frames use the parent protocol session;
  separate frame targets receive guards before continuing. Tests include initial and already
  cross-site frame redirects. Unsupported auxiliary pages are blocked and service workers disabled.
- Navigation documents differ from rendering resources. A cross-origin script counter test proves
  non-document resources still pass. This intentionally does not solve general data exfiltration.
- URL matching uses canonical origins/default ports, relative resolution, anchored existing `*`
  patterns and decoded paths; query/fragment values do not participate. Ambiguous encoding is
  rejected. Explicit relative navigation was aligned with the same resolution rule.
- An aborted navigation can also cause a generic browser error. A sticky generic denial takes
  precedence at operation boundaries and cleanup, producing a policy event and `policy_violation`.
  Diagnostic sink failure cannot hide it. Paths, queries and credentials are omitted from its URLs;
  existing opt-in raw evidence is not presented as redacted. Handoff never removes the guard.

### Validation

`npm run typecheck`, build, and all **89 tests** pass (43 prior tests plus 46 new cases): 20 browser
navigation cases, 22 URL/diagnostic cases and four coordinator-boundary cases. Forbidden destination
counters are zero for cross-origin links/forms/script navigation, forbidden same-origin paths,
frames, redirects (including frame redirects), explicit navigation and popups. Allowed links/forms,
frames, redirect chains, relative navigation and cross-origin scripts receive requests normally.
No timing sleeps are used in the new counter matrix.

All six CLI demo scenarios passed against live ephemeral proxies: success → 4321.09;
not-found → MEMBER_NOT_FOUND; slow → recovered on attempt 1; persistent busy → recovery_exhausted
after two attempts; permission-denied → permission_denied; intervention → same page, epochs 2→4.
The standalone proxy returned HTTP 200. Diff/ignore/tracked-file checks found no runtime evidence,
dependencies, generated build output or credential patterns staged for submission. Private
interview notes were updated locally and remain ignored. Public architecture/safety/error/handoff
docs, README, REPORT and ADR-006 were aligned with ADR-007.

### Deliberate limits and next step

Enforcement is Chromium-specific and single-page, not a comprehensive browser/network sandbox.
Non-document traffic, non-network document/history changes and speculative/browser-internal
traffic outside the tested Document boundary need separate threat analysis. No production
redaction, signed approval, automatic continuation or discovery integration was added.

Next: define the discovery input/output and approval contract, enumerate provider requirements,
and obtain an explicit provider choice before implementing a model-driven loop. Re-run these
counter tests after any browser upgrade or expansion of the supported surface.

## 2026-09-27 — Bounded discovery, provider seam and artifact compilation

### Goal and implementation

Implement real-provider-capable discovery without changing deterministic replay into an agent.
The caller explicitly selected OpenAI Responses / gpt-6-astra, strict direct function tools,
`store: false` and disabled parallel calls. Added `src/discovery/` contracts, model seam, Responses
client, coordinator, conservative policy classification, compiler and explicit evidence writer;
opt-in hybrid browser observations; caller-contract and integration CLI files; and focused tests.
No new dependency, service, native computer tool, script execution tool or operator UI was added.

### Findings and decisions

- Caller-declared typed inputs/outputs avoid asking the model to infer parameterization from
  arbitrary literals. Discovery values stay in the raw run; compilation substitutes exact input
  references. Ambiguous/embedded values fail closed. The emitted artifact is a draft.
- Existing replay observation refs could not act on observed controls or provide verified durable
  target evidence. ADR-008 adds optional screenshot observation and `describeTarget(ref)` to the
  generic surface contract, not browser/provider objects or an artifact schema revision.
- Each screenshot-backed turn proposes one strict action. Policy precedes every execute; unknown
  clicks require review or block, while configured inquiry permissions authorize known read-only
  controls. A model cannot assign its own risk class. Existing pre-request confinement stays active.
- Raw DOM snapshots were rejected as model input. A compact semantic inventory plus live PNG keeps
  precise refs and visual context, with current caps of eight frames and 120 visible elements.
- Exact element handles avoid retargeting stale indexes. Comparing outerHTML was too brittle under
  browser instrumentation; semantic/action-bearing fields now supply freshness checks. A concurrent
  full-suite run also exposed a one-millisecond final verification timeout; the bounded source read
  now has up to one second within the run deadline. These fixes do not retry UI actions.
- Handoff gained asynchronous handle cleanup. Review caught the ownership gap this could create;
  ownership now changes before that await, and action exclusion extends through ref disposal.
- The compiler accepts only verified executed actions, derives ordered targets from adapter
  evidence, filters value-dependent locators and creates output/source checkpoints. A successful
  happy path demonstrates no not-found/busy/denial branches, so none are invented or copied from
  the hand-authored artifact. Replay output ownership and event/result semantics stay unchanged.
- The proxy originally had only one valid member. Added a second fake member (67890, balance 8765.43)
  without changing its deliberately imperfect markup, making different-input replay observable.
- Node fetch isolates one Responses endpoint without adding an SDK. Tests assert request flags,
  strict schemas, screenshot input, one-call validation and safe provider error codes. Actual API
  acceptance and the model's ability to choose this workflow remain unverified without credentials.

### Validation and evidence

`npm run typecheck` and all **126 tests** pass: the existing 89 plus 37 discovery tests (26 coordinator/
compiler/evidence cases, eight mocked-provider cases, three real-browser/scripted-model cases).
The existing `npm run demo` also returned success with savings balance 4321.09 after the changes.
The scripted browser path is fill → Search → Account Information → read → explicit finish.
It compiles observed controls, serializes the artifact and replays it in a fresh browser for member
67890, returning 8765.43 with zero additional model calls. Same-session handoff and stale refs are
tested. Existing six replay scenarios and navigation zero-forbidden-hit tests remain green.

No OPENAI_API_KEY was available in the environment or local env files. `npm run discover` builds
then exits explicitly for missing credentials before any API/browser work. **No genuine model
discovery, live discovery sequence, saved live artifact or API success is claimed.** The integration
command is ready to perform one real attempt and preserve raw/sanitized evidence separately under
ignored `evidence/runtime/discovery/<run-id>/`. The example capability remains hand-authored.

README, REPORT, architecture, safety/error/handoff docs, evidence README, ADR-002/004 and new ADR-008
now distinguish implemented/offline-tested behavior from pending live evidence. Private interview
notes stay local and ignored. Model messages/hidden reasoning do not become executable artifacts;
the minimal sanitized trace is not a production screenshot/log redactor.
The Notion provider task is complete; discovery/compiler acceptance remains in progress with the
credential dependency recorded. Its journal, decision log and private defense guide are synchronized.

### Deliberate limits and next task

Semantic refs only; no coordinates, automatic human continuation, arbitrary interpolation, boolean
output transform, branch learning or signed approval. Success verifies typed reads and source
continuity, not universal semantic goal correctness. Caller inquiry rules assume a trusted configured
application, and the navigation boundary is not general data-loss prevention. Raw model processing
requires consent; `store: false` does not establish provider zero retention.

Next: supply OPENAI_API_KEY securely, run `npm run discover` once, inspect the model-chosen actions
and emitted draft, verify the fresh 67890 replay/model-call delta, then publish only reviewed safe
evidence and update these claims from that real run. Do not replace this proof with the scripted test.
