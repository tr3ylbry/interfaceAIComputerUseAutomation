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

## 2026-09-27 — First genuine OpenAI attempt: HTTP 429 before any decision

### Baseline and attempt discipline

Baseline commit: `7c2eae562b282aa4c8a55b7546de4578b61d89f3`. Git was clean; a local key was present
(value never printed); `npm run typecheck` and all 126 tests passed. Ran `npm run discover` exactly
once. No implementation, configuration, prompt, tool schema or generated artifact was changed
before or after the attempt. The command started the controlled fake-data proxy itself.

### Actual result

- Run ID: `92eb2d6e-cdba-47e9-9051-bb442492f466`.
- Requested provider/model: OpenAI Responses / gpt-6-astra, medium reasoning, `store: false`, strict
  direct tools, parallel calls disabled; configuration verified in unchanged source.
- Run interval: `2026-09-27T23:53:25.898Z` → `2026-09-27T23:53:27.996Z`: 2,098 ms, including browser
  opening/observation/cleanup but excluding the CLI build.
- Initial hybrid observation: one viewport PNG and nine structured elements on Member Inquiry.
  The member textbox was empty, with imperfect naming but useful Member No. row context; Search
  had a button name. These were observed controls, not controls selected by the model.
- First actual provider request returned HTTP 429; terminal code `provider_http_429`.
- Attempted model turns: one, inferred from failure at the first decide call and the no-retry code
  path. Returned model decisions: zero. Exact tool/action sequence: empty.
- Opening passed policy (inferred from reaching observation); no per-action policy decision,
  blocked/rejected proposal or human intervention occurred because no proposal existed.
- No output was extracted; finish verification was not reached. No capability was generated or
  validated. Replay for member 67890 was not attempted, so there is no ReplayResult/balance,
  locator/checkpoint evidence or cross-input success claim. Replay model calls: zero because no
  replay occurred, not because a successful replay was demonstrated.

### First-run review and limitations

The application reached the Responses endpoint and preserved its failure rather than silently
retrying. No model workflow choice, semantic-vs-visual strategy, ambiguous proposal, actual-control
target derivation, input parameterization, output typing, artifact reviewability or artifact
generalization can be evaluated from this run. Existing scripted tests are not a substitute.

The adapter intentionally cancels non-success bodies and records only HTTP status. This kept raw
provider content out of evidence, but discarded error subtype, request ID and Retry-After. OpenAI
documents both temporary rate limits and credit/spend/quota causes for HTTP 429; the observed
status alone does not identify which happened. No model refusal was recorded; there was no model
output to inspect. This is a provider failure, not evidence of a prompt or UI-policy defect.

The provider/model choice remains unvalidated for successful discovery, not rejected. No prompt or
tool changes are justified yet. A narrowly allowlisted provider-error metadata record would improve
future diagnosis, but was only recommended, not implemented during this evidence review.

### Evidence and documentation

The untouched ignored run directory contains `discovery-run.raw.json` (6,525 bytes),
`observation-0.png` (17,132 bytes) and `tool-trace.sanitized.json` (209 bytes, empty turns/actions).
The screenshot was visually inspected: blank fake member-search UI, no unrelated app content.
Checks against the configured key plus credential/header/path patterns found no secret or absolute
local path in these files. Raw records still contain declared sensitive fake inputs and stay ignored.

Added a reviewed metadata-only `evidence/discovery/<run-id>/review-manifest.json`, recording exact
original hashes, request-count inference, failure and skipped stages. It contains no input values,
control refs/text, response bodies, application URLs or machine-specific paths. It is a post-run
review, not the CLI's generated success manifest or a provider transcript. Original evidence was
not repaired or overwritten; nothing was force-added to Git.

Updated README/current status, REPORT, architecture's evidence status, ADR-008, this journal,
evidence README and ignored local interview notes. Historical implementation entries remain intact.
No source/tests/dependencies changed. Documentation and reviewed public evidence are left uncommitted
for first-run review; this phase did not request a commit or push.

### Next step

Inspect the configured project's API billing/limits to distinguish transient rate limiting from
quota/credit/spend restrictions. Review the proposed safe diagnostic metadata improvement before
changing code. Only after the cause is addressed and another attempt is explicitly authorized,
repeat the unchanged canonical request and keep this failed first run alongside subsequent evidence.

## 2026-09-28 — Harden the tests that blocked attempt #2

Attempt #2 stopped at preflight: typecheck passed but 124/126 tests passed. No live provider call
occurred and no second discovery run exists. This session fixes only the two failing tests;
production code, prompts, provider configuration, runtime deadlines and architecture are unchanged.

### Sanitized evidence assertion

The writer already projects an explicit allowlist of trace fields. The old test searched the entire
serialized trace for short numeric substrings, so an unrelated random run UUID containing `4321`
triggered a false positive. This was an assertion defect, not an observed sanitization leak.

The test now parses the persisted trace and checks its complete nested shape with `toStrictEqual`.
Extra fields, changed values, tool arguments, outputs, control evidence, goals, URLs or images
therefore fail the assertion. A distinctive authorized input sentinel is filled and confirmed in
raw evidence but absent from the sanitized trace; raw and numeric output values are also verified
in the raw record. A second case fixes the run UUID to contain both `4321` and `12345`, proving
unrelated metadata does not cause a false alarm. Raw labeling and file-permission checks remain.

### Browser timing investigation

The unchanged scripted discovery/compile/fresh-replay test passed alone in 2,106 ms. Temporary
adapter-stage instrumentation measured 2,123 ms alone versus 5,771 ms under the full suite's
parallel browser load. Five screenshot/semantic observations took 789 ms in total alone versus
2,525 ms under load; the two browser opens took 705 ms versus 986 ms. Finish verification,
locator resolution, replay checkpoints and both browser closes completed. The full-suite test
deadline expired while replay was still progressing, not while waiting on one stuck control.

Inspection found no arbitrary sleep or simulated busy-state backoff on this happy path. Server
startup is awaited in `beforeAll`; page navigation/action readiness and checkpoints are already
explicitly awaited. The evidence points to cumulative browser/protocol work under contention,
not a missing readiness condition. Initial temporary timing spies accidentally wrapped themselves;
they were corrected before collecting these measurements and all instrumentation was then removed.

Only this two-browser integration test now has a 15-second test-runner budget, allowing headroom
for parallel load while retaining a finite failure deadline. The 5-second per-action runtime
timeouts and all existing assertions remain unchanged. Global timeout inflation, arbitrary waits
and production timing changes were rejected because they would not address the measured cause.
No ADR is needed: this is test-budget calibration, not a system-boundary change.

### Validation and next step

- `npm run typecheck`: passed.
- Sanitization test individually: both generated-ID and fixed-ID cases passed.
- Scripted browser test: five consecutive isolated runs passed (2,244 / 1,892 / 1,800 / 2,023 /
  2,010 ms).
- Three consecutive `npm test` runs: 127/127 passed each. The same integration test took 6,195 /
  5,525 / 6,309 ms under normal parallel load, confirming that five seconds was too tight even
  without diagnostic instrumentation.
- Diff review: only the two test files and this journal changed; no raw evidence, credentials,
  generated artifacts, dependencies or production files are included.

No OpenAI API request or `npm run discover` was run. Existing first-attempt 429 evidence remains
unchanged. The test blockers are resolved; the next step is explicit authorization for exactly one
live discovery attempt, with the usual clean-branch/typecheck/test preflight. Passing scripted
tests still does not prove that genuine discovery or different-input replay will succeed.
