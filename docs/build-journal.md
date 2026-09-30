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

## 2026-09-28 — Genuine attempt #2 proves discovery-to-replay

### Baseline and execution discipline

At clean, synchronized main `02ff7f39827e6a2e2ce7715d062642430e5d896a`, confirmed the local key
without displaying it, then passed typecheck and all 127 tests. Verified unchanged Responses API,
gpt-6-astra, medium reasoning, `store: false`, strict direct function tools, no parallel calls and
one decision per observation cycle. Ran the canonical `npm run discover` exactly once. It started
the fake proxy and used the real provider, not the scripted model or example capability.

The earlier preflight-only stop made zero API calls and is not counted as an extra live attempt.
Attempt #1 (`92eb2d6e-cdba-47e9-9051-bb442492f466`) remains unchanged; hashes of all three original
files still match its existing review manifest. No retry, manual guidance, prompt tuning, provider
substitution, production change, artifact repair or additional replay was performed in this phase.

### Actual model behavior

Run `aafa19ac-42a4-4550-b25b-7d57b4589c66` started at `2026-09-28T17:47:44.980Z` and finished at
`17:48:06.114Z`: 21,134 ms for discovery. Five real Responses turns produced:

1. `ui_fill`: the unnamed textbox with row context `Member No.`, value `12345`.
2. `ui_click`: the named Search button.
3. `ui_click`: the Account Information link on the member detail page.
4. `ui_read`: the span in the Savings row within `iframe[name="accountPane"]`, text extraction
   into `savings_balance`.
5. `finish_discovery`: explicit finish, only after the read.

The fill was classified reversible_write; the two inquiry clicks and read were read_only. All four
actions received `allow` before execution. No incorrect/ambiguous proposal, block, refusal, risky
dialog or intervention was observed. The model did not select the Checking row or guess a balance.
The read returned `$4,321.09`, transformed to currency number `4321.09`. Finish re-resolved the
live source and matched its current text against the extracted source value. Success was not
accepted merely because the model called finish.

Five hybrid observations contained nine/nine/nine/seven/seven controls and real viewport PNGs.
The selected controls fit useful semantic evidence even where accessible names were missing.
The screenshot was supplied every turn, but the trace cannot prove how much visual reasoning
contributed; do not claim a visual-only automation demonstration.

### Compilation and untouched fresh replay

The existing CLI compiled, schema/reference-validated and saved the exact generated draft before
replaying its serialized bytes. Post-run inspection independently revalidated it. Capability
`discovered.member-savings@0.1.0` uses schema 1.1, approvalState draft, typed string member_id and
currency savings_balance. Four steps are fill → click → click → extract. Target chains are:

- Member No.: row-relative input, then verified named-input CSS.
- Search: accessible button/name, then verified structural CSS.
- Account Information: accessible link/name, exact text, then verified structural CSS.
- Savings: frame-scoped row-relative value, then verified structural CSS.

The fill uses `{ source: "input", name: "member_id" }`. The compiler removed the balance-dependent
text locator; it did not invent a new strategy. No concrete discovery input/output, ephemeral ref,
OpenAI response object or Playwright type appears in the artifact. Provenance identifies this
genuine run and compiler 0.2.0. Success requires the bound output and its visible source; intermediate
checkpoints require the next acted-on control to be visible. Unseen business/recovery branches remain
empty. The artifact is readable but long structural fallback locators remain a portability limit.

Fresh replay `f626f4cd-4827-4b72-aa15-bc3bc3781542` used the same generated artifact with member
`67890`, returned `success` and `8765.43`, and reported 484 ms. The model counter remained at five:
zero replay model calls. All eight target-resolution events (including checkpoint resolutions)
used strategy index 0; all four checkpoint events matched. There were no recovery events or locator/
replay failures. This proves the controlled different-input through-line, not all unseen inputs.

### Evidence review and limits

Ten original files remain ignored under `evidence/runtime/discovery/<run-id>/`: five screenshots,
raw structured run, raw replay, original CLI manifest, generated draft and sanitized tool trace.
All screenshots show only the fake proxy; raw values are accurately labelled unredacted. Checks
found no configured key, credential/header/cookie material in the originals. The original CLI
manifest contains an absolute artifact path, so it stays private.

The reviewed public bundle under `evidence/discovery/<run-id>/` contains a byte-identical artifact
and tool trace, a value-free replay event projection, and an explicitly authored review manifest
with hashes of all originals. No screenshots, raw run/replay logs or original manifest are published.
Public evidence contains no absolute filesystem paths, secrets or unrelated data. The artifact's
loopback URL is intentionally preserved, not rewritten to imply portability across proxy restarts.

Five validated decisions establish completed successful Responses calls through the unchanged
provider code. Exact HTTP status, request IDs, response model echo and rate-limit headers were not
persisted and cannot be reconstructed. No raw provider body or hidden reasoning was retained.
The first attempt's HTTP 429 subtype remains unknown; later success does not retroactively prove
which cause applied. One successful run is neither a model reliability estimate nor authenticated
provider attestation. Production redaction/retention and signed approval remain unimplemented.

### Decisions, documentation and next step

Direct bounded tools, independent policy, verified target normalization, caller-declared parameters
and model-free replay all behaved as designed. No architecture or prompt change is justified by
this clean run. ADR-008 gains evidence, not a new decision. Updated README, REPORT, architecture,
ADR-008, evidence README/review bundle, this journal and ignored interview notes; synchronized the
Notion engineering record. Post-run `npm run typecheck` passed and `npm test` passed 127/127.
Final diff/secret review found only documentation and the four reviewed public evidence files;
no source/tests, credentials, ignored raw evidence or generated runtime junk are included.

Next: review and accept this generated draft/evidence package, then explicitly select the next
limited safety slice (production evidence redaction/retention or artifact approval). Do not run
another paid discovery attempt implicitly. Preserve both attempts and keep the generated happy
path distinct from the manually authored fixture's business/recovery branches.

## 2026-09-28 — Fail-closed evidence publication

### Goal and flow review

The accepted genuine bundle demonstrated the assignment through-line, but public publication still
depended on manually projecting/reviewing raw evidence after capture. The discovery writer produced
raw observations/screenshots plus an allowlisted tool summary in ignored runtime storage; the CLI
also wrote a raw replay result and manifest with an absolute artifact path. There was no automated
public replay projection or public writer. Binary publication had only a documented manual boundary.

### Changes and decisions

Added `src/evidence/` with raw/candidate/public types, explicit discovery/replay projections, pinned
nested publication schemas, content rejection, integrity checks, a validate-before-write publisher
and a read-only validation command. The existing raw discovery/adapter writers gained only a
destination guard: public evidence paths and symlink aliases are rejected before persistence.
Normal ignored raw capture, discovery/replay actions, core contracts and provider settings are unchanged.

ADR-009 records a material persistence trust boundary. Explicit allowlist construction was chosen
over recursive redaction: unknown fields must not propagate, and generated artifact bytes must not
be silently repaired. A private inventory supplies known inputs/outputs/credentials; exact scalar and
token-boundary comparisons preserve the earlier numeric-UUID false-positive lesson. Both formatted
and transformed outputs belong in that inventory. Field-name checks complement credential patterns.

Review caught two additional publication hazards: duplicate JSON keys can hide unsafe bytes behind
a safe parsed value, and mutable caller state can change a destination during asynchronous writes.
The gate therefore requires canonical JSON without duplicate/alternate encodings and snapshots the
publication request before awaits. It validates the whole bundle before creating the destination,
refuses overwrites/symlinks, and writes its manifest last. Source hashes remain review assertions,
not provider attestations. An interrupted I/O write may leave an incomplete but content-validated
directory; no destructive automatic cleanup or claim of transactional publication was added.

Public binaries/screenshots are prohibited, with no approval-flag bypass. A future binary path
requires explicit sanitization/manual review. This is deliberately not OCR, general PII discovery,
raw-data redaction/retention, provider retention control, or a filesystem/Git access-control system.
Artifact publication is limited to the demonstrated linear web profile; extending core runtime
contracts cannot silently expand the public schema. Existing historical success metadata has an
explicit compatibility schema rather than an arbitrary-object exemption.

### Validation and evidence

- Typecheck passes. Added 55 focused publication tests; all 182 tests pass with local browser/server
  permissions. The first sandboxed full run could not listen on loopback (`EPERM`), so browser hooks
  failed; the unchanged suite passed when rerun with the required permission. No timeout inflation.
- Tests cover sensitive input/output and secrets, Authorization/Bearer/cookie/session fields, local
  paths, normal URLs, unknown fields, binaries, UUID metadata, no-write-on-rejection, duplicate keys,
  integrity mismatches, no-overwrite, symlink destinations, raw-path guards and unchanged accepted bytes.
- The read-only publication command validates all four accepted genuine files for run
  `aafa19ac-42a4-4550-b25b-7d57b4589c66` with the known fake input/output inventory. No accepted
  evidence was rewritten, including the generated artifact. Both historical attempts remain intact.
- No live OpenAI call or discovery command occurred. Existing scripted discovery and deterministic
  replay/browser scenarios pass. No raw files, screenshots, credentials or generated outputs are added.

Updated README import wording and REPORT's semantic-targeting/hybrid-observation wording. Updated
safety, architecture, evidence guidance, this journal, private ignored defense notes and ADR-009.
The Notion project record is synchronized with this safety slice; public technical reasoning remains
self-contained in the repository.

### Remaining limits and next step

The caller must provide a complete inventory. Unknown/encoded secrets, arbitrary PII, manual
force-add/copy, malicious concurrent local filesystem changes, authenticated review, raw retention
and model-input privacy are not solved. The historical failed-attempt manifest remains preserved,
not migrated into the new success-manifest schema. No provider or broader execution redesign.

Next: bind authenticated artifact approval to the exact reviewed capability bytes and policy before
non-development replay. No further live discovery attempt is authorized by this work.

## 2026-09-28 — Submission-readiness audit

### Scope and findings

Audited baseline `a35c1e4fce33beae0b51c1491f3274bc6cc6439d` from clean setup through contracts,
discovery/replay, public evidence, error states, policy, dependencies and handoff. No OpenAI call,
discovery command, source/test change, prompt tuning, provider change or new architecture occurred.

The working requirements checklist and completed safety task disagreed about handoff acceptance.
The author clarified that **actual human-action recording is required**, along with same-session
manual work, explicit handback and automation resuming/completing. Inspection found only an unused
HumanActionRecord schema and ownership history. Tests reject stale automation and return ownership;
the demo then releases the page. Neither records manual clicks/typing nor proves completion after
manual work. This is an open submission blocker, not an operator-console or automatic-continuation cut.
The previous authenticated-approval next-step recommendation is superseded for submission purposes.

A second packaging gap was fixable without product changes: tests covered exceptional replay but
no corresponding public log existed. Ran the existing `not-found` demo and used the unchanged
allowlisted publisher to preserve replay-only run `d7727060-ec70-4f74-b4a8-501825698825`. It returned
MEMBER_NOT_FOUND as business_outcome in 2,152 ms. The public projection intentionally omits domain
code/value/free-text fields; the fixture and test corroborate the observed code. Its generated
manifest binds public bytes and records the withheld raw-result hash. This is not learned branching
or a new discovery attempt. Raw audit results/screenshots and the audit harness remain ignored.

### Small corrections and tradeoffs

Added a public technical acceptance matrix, exact locked-install/setup guidance and fake-fixture
evidence-validation commands that do not require a missing private inventory. REPORT now has the
seven literal headings and concise function-tool/desktop/tenant tradeoffs grounded in existing
ADRs. Current architecture/handoff/README/REPORT and private defense notes identify the blocker;
ADR-004 receives a subsequent-proof note without rewriting the credential-era history. No new ADR
is warranted: this is acceptance clarification, not an implemented architectural decision.

The audit does not disguise the missing recorder/return-completion path as a documentation fix.
Implementing it requires a small, explicitly reviewed lifecycle slice and acceptance evidence;
automatic continuation, authenticated approval and a polished UI remain outside this work.

### Validation and evidence

- Fresh temporary clone: lockfile install, Chromium installation, typecheck and **182/182 tests**
  passed. npm noted local install-script approval policy; it did not prevent build/tests. Browser
  installation used the available local cache. Linux system packages were not tested on macOS.
- Working checkout: typecheck and **182/182 tests** passed, including all navigation-counter and
  publication cases. No global timeout change or test weakening.
- Six exact demo commands passed: success; member-not-found; slow recovery on attempt 1; persistent
  busy exhaustion after two attempts; permission denial; intervention with unchanged page/epochs 2→4.
  Failure/intervention screenshot/DOM evidence stays unredacted and ignored. Standalone proxy HTTP 200.
- Accepted genuine bundle validates read-only with all four files unchanged. New replay-only bundle
  validates after publication. First HTTP-429 evidence remains unchanged and manually reviewed;
  its historical format is intentionally outside the strict success-manifest validation profile.
- GitHub's public API confirmed a public main repository; fetched baseline was synchronized.
  Tracked-file/key/path scan found only an intentionally fake credential-pattern test fixture, no
  configured key, real credential or machine-local path. No raw/runtime/binary evidence is staged.
- Dependency registry audit remains zero production / two moderate dev-only entries for the same
  Vitest redirect-mock advisory. Disposition unchanged; no force fix or dependency change.

### Verdict and next task

**NOT READY** pending minimal recorded same-session human handoff and explicit post-handback
automation completion. See `docs/submission-readiness.md`: 26 proven, four partial, one missing
requirement. No more live discovery is needed. Preserve green baseline and existing accepted
evidence; fix that single required lifecycle slice before submitting.

## 2026-09-30 — Recorded human ownership and explicit completion

The confirmed must-have was manual browser-action recording plus actual work after handback, not
only ownership transitions. Added a fixed browser-event bridge in the adapter, reused HumanActionRecord
with an intervention/epoch envelope, and added the separate `demo:handoff` terminal acceptance path.
No model call, prompt/provider change, generated-artifact repair or generic replay redesign occurred.

The recorder activates behind the current human epoch, captures native click/input/change and frame
navigation, and stops before automation restoration. It omits typed values, labels, option text and
DOM; only fixed categories survive. Private navigation origins follow existing diagnostic rules and
are omitted publicly. Overflow fails acceptance. The guard remains installed during human ownership.

Explicit `return` leads to a narrow controlled-bank completion: verify original member/location and
closed warning, policy-check account navigation/extraction, check the account URL/currency, return the
balance. The original intervention remains terminal; this separate operation does not introduce a
general resume engine. `publish` is a second, explicit review step using the existing fail-closed
boundary and one new strict handoff profile. No raw screenshot or typed input is published.

ADR-010 compares traces, an operator UI, event instrumentation and generic continuation. Fixed
categories intentionally sacrifice descriptive richness to avoid arbitrary-text leakage. Evidence is
receipt-scoped, not lossless or authenticated: document bootstrap/unload/bridge boundaries and native
UI are limitations. Tests distinguish automated native input from an actual person's work.

Validation: 13 added tests cover ownership gating, native click/type/select, iframe interaction,
navigation/reinstallation, stale epochs, explicit handback, overflow, same Page/BrowserContext,
unresolved-warning rejection, real post-handback completion and safe publication. Forbidden navigation
during human control receives zero destination hits. A test initially used selectOption, whose
synthetic change events are correctly ignored; native popup keyboard behavior varied on this host.
A visible native option click provides deterministic simulation without weakening the trusted-event
gate. A DOM element typing error in that test was fixed; no production timing changes were needed.

Final validation: typecheck and **195/195** passed; the handoff suite also passed repeated isolated
runs. All six existing deterministic demos passed, and both supported accepted bundles validated
unchanged. Tracked-file checks found no raw evidence/binaries, secrets or new local paths; matches
were only existing synthetic rejection fixtures. Notion journal, requirement checklist, decision
log, defense guide and handoff task were synchronized; the task remains in progress awaiting the
author. Private preparation notes and public architecture/safety/
handoff/readiness/evidence/README/REPORT documentation now distinguish implementation from acceptance.

**Actual human acceptance remains pending.** The implementation agent did not run the headed manual
runner or simulate a final pass and call it human. Exact next action: the author personally runs
`npm run demo:handoff`, clicks Operator reviewed, explicitly returns control, reviews/publishes the
safe result and reports the run ID. Only then may the requirement be marked proven.
