# ADR-008: Typed discovery with strict direct model tools

**Status:** Accepted and implemented; genuine discovery and different-input replay demonstrated on attempt #2. First-attempt HTTP 429 evidence is preserved.

## Context

Replay is proven; discovery must learn a workflow without introducing model decisions into replay.
The caller explicitly selected OpenAI Responses, `gpt-6-astra`, `store: false`, strict function tools
and disabled parallel calls. The caller, not the model, defines typed inputs and desired outputs.
The current observation refs are descriptive only and screenshots are file-based evidence, so
they cannot yet support precise, screenshot-backed discovery actions.

## Options and decision

1. Native OpenAI computer tools: useful visual generality, but coordinate-first actions do not
   supply the semantic evidence needed by this artifact/compiler slice.
2. Model-generated Playwright/scripts: convenient, but bundles unreviewed execution and bypasses
   per-action policy, evidence and the surface boundary. Rejected.
3. Strict direct function tools over SurfaceAdapter: chosen. One proposal per turn is validated,
   independently classified, approved, executed and observed. No selectors, code or shell tools.

Add opt-in hybrid observation and target-description support to SurfaceAdapter: live screenshot
bytes, compact control evidence, short-lived refs bound to actual controls, and deterministic
locator candidates verified against those controls. These are surface concepts, not provider or
Playwright objects. Existing replay observations remain lightweight and replay semantics unchanged.
Keeping screenshots outside the adapter or asking the model to invent selectors were rejected.

The provider is a small stateless Responses HTTP client using Node fetch, with injectable transport
for tests; no SDK dependency is needed for one endpoint. Each request includes the latest image,
compact structured state and normalized history, not hidden reasoning or a provider transcript.
Use medium reasoning, strict schemas, `tool_choice: required`, and exactly one validated function
call. Refusal, malformed/multiple calls and incomplete responses stop, without retrying UI actions.

## Safety and compilation

Inputs have caller-declared concrete discovery values. Fills/selects must exactly match an
authorized value. Click risk is never supplied by the model: caller-approved semantic control
rules permit known inquiry controls; otherwise clicks require human review (or policy blocks).
Navigation/action allowlists still apply, including the existing pre-request guard. Unknown dialogs
pause. Approval rules are permissions, not an ordered workflow. Generated artifacts are drafts.

Discovery records executed actions, verified targets, before/after observations, extraction sources
and policy decisions. Explicit finish requires typed outputs backed by real reads and checks of
their current source controls. The compiler substitutes exact declared values with input references,
filters value-dependent locator candidates and preserves only verified strategies. It refuses
unsupported parameter interpolation or sensitive-value leakage rather than guessing a template.
Success becomes typed output/visible-control checkpoints, never equality to the discovery balance.
An unobserved business outcome or recovery condition is not invented from a happy-path run.

## Tradeoffs, evidence and revisit conditions

This bounded semantic slice does not support coordinates, arbitrary waits, code generation,
automatic approval, human continuation or general workflow branching. Locator stability is
demonstrated on a second fake member, not asserted for all tenants. A second fake member is required
because the original proxy has only one valid input.

Implementation references: `src/discovery/` (contract, provider, coordinator, compiler, policy,
evidence writer), `src/adapters/discovery-observation.ts`, the SurfaceAdapter extension, and
`src/vertical-slice/run-discovery.ts`. `tests/discovery.test.ts` tests bounds, policy, approval,
finish verification and normalization; provider tests inspect exact Responses payloads; browser
tests verify real screenshots/refs, generated artifact replay on member 67890 and handoff.
At implementation validation, no genuine API run occurred because no OPENAI_API_KEY was available.
Mocked payload conformance is not evidence of model access, live API acceptance or actual
model-chosen workflow success. The subsequent first attempt is recorded below.

Two failed approaches informed validation: whole-outerHTML freshness checks changed under browser
instrumentation, so freshness compares semantic/action-bearing fields instead; a one-millisecond
finish check was flaky under concurrent browser load, so source verification now uses a bounded
read timeout within the overall deadline. These are not hidden action retries. Handoff cleanup
must revoke ownership before awaiting handle disposal; action exclusion lasts through cleanup.

Screenshots and structured runs can contain declared sensitive values. They stay raw in ignored
`evidence/runtime/discovery/`, accurately labelled unredacted; no production redactor is claimed.
`store: false` is not a promise of zero provider retention. Explicit caller consent is required to
send observations to the model. Tests use scripted models and mocked transport, not live API calls.

References: [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling),
[image inputs](https://developers.openai.com/api/docs/guides/images-vision),
[Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[data controls](https://developers.openai.com/api/docs/guides/your-data).
Revisit for poorer surfaces, adversarial UI content, richer parameterization, conditional discovery,
production redaction, multi-tenant approval or another provider/surface implementation.

## First genuine attempt — 2026-09-27

Run `92eb2d6e-cdba-47e9-9051-bb442492f466` used unchanged code/prompts at commit
`7c2eae562b282aa4c8a55b7546de4578b61d89f3`, after clean status, a positive key-presence check and
126 passing tests. The initial screenshot/semantic snapshot was captured and the first Responses
request returned HTTP 429. There were no returned decisions, UI actions, outputs, finish checks,
compiled artifact or replay. No retry or provider/model substitution occurred.

The provider choice is neither validated nor disproved as a workflow model by this result. The
failure stop and raw/sanitized evidence separation worked. A diagnostic tradeoff is now concrete:
discarding all error bodies avoids leaking provider content but also loses the safe subtype needed
to distinguish a temporary rate limit from credit/spend/quota issues. Request ID and Retry-After
were not retained either. These facts cannot be reconstructed from the saved evidence.

Recommended follow-up, not implemented: inspect account/project limits and review a small allowlist
of safe error codes/request metadata for future diagnostics, without persisting raw bodies or
headers. No model prompt/tool changes are supported by this attempt because no proposal was returned.
The existing one-attempt policy remains. See the reviewed metadata-only failure manifest under
`evidence/discovery/92eb2d6e-cdba-47e9-9051-bb442492f466/`. OpenAI documents multiple
[HTTP 429 causes](https://developers.openai.com/api/docs/guides/error-codes); status alone is insufficient.

## Second genuine attempt — 2026-09-28

Run `aafa19ac-42a4-4550-b25b-7d57b4589c66` used clean, synchronized baseline
`02ff7f39827e6a2e2ce7715d062642430e5d896a` with 127/127 passing tests. No production, prompt,
model, reasoning or tool changes preceded the single authorized run. Five real Responses turns
selected fill → Search → Account Information → read Savings → finish. Four independently approved
UI actions executed through SurfaceAdapter; no blocked proposal, refusal or handoff occurred.
Discovery took 21.134 seconds, read `4321.09`, and passed live-source finish verification.

The generated draft parameterized member_id, retained only verified value-independent locators,
and contained no ephemeral refs or provider/Playwright objects. The unchanged artifact then
replayed for another fake member in a fresh browser, returning `8765.43` with zero model calls.
All targets resolved at index 0 and all four checkpoint events matched. The original Savings-text
locator depended on the discovered balance and was correctly excluded; the row-relative strategy
generalized to the second member. No manual repair, retry or hand-authored replacement was used.

The decision is confirmed for this narrow controlled path; no design revision is justified by the
run. There was no visual-only control, so hybrid inputs do not prove vision was necessary. This
does not establish tenant-wide stability, authenticated provenance or automatic draft approval.
Provider success HTTP status/headers/model echo were not persisted, and the existing first-run
diagnostic limitation remains. Reviewed public evidence is under
`evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/`; raw records remain ignored. Both attempts
remain in the history. Review the draft/evidence before any separately authorized next phase.
