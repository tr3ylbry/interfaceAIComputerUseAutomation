# Architecture

## Product boundary

The model discovers. The artifact becomes the reusable capability. Deterministic replay is the production path.

## Primary components

- **Discovery engine** — bounded observe → model proposal → policy → act loop, behind a DiscoveryModel seam.
- **Artifact compiler** — converts verified discovery evidence into a schema-1.1 draft artifact.
- **Replay engine** — binds invocation inputs and executes capability steps without an LLM decision loop.
- **Surface adapter** — isolates perception/action mechanics from the artifact and replay contracts.
- **Policy engine** — evaluates every proposed action before execution.
- **Evidence recorder** — writes structured events plus richer failure evidence.
- **Evidence publisher** — constructs allowlisted public projections and validates the complete bundle before persistence.
- **Intervention coordinator** — pauses automation and transfers the same live session to a human; automatic continuation is not implemented.

## Dependency direction

`discovery/replay -> core contracts -> surface adapter`

Playwright-specific types must not appear in the serialized capability schema.

## Typed discovery and provider boundary

`src/discovery/contracts.ts` defines DiscoveryRequest, DiscoveryModel and normalized DiscoveryRun.
The caller declares a goal, target, typed inputs with concrete discovery values, desired typed
outputs, limits and policy/approval context. The model discovers **how**, not which literals should
be parameters. `OpenAIDiscoveryModel` alone knows Responses HTTP objects. It sends stateless requests
with `gpt-6-astra` (configurable), medium reasoning, `store: false`, strict tools and no parallel calls.
Node fetch suffices for one endpoint; no SDK or runtime provider dependency was added to replay.

Every model turn receives a current viewport PNG plus at most 120 compact visible elements from
up to eight frames: ref, role/name/label, text, current non-password value, row context, visibility,
enabled state and bounds. The semantic projection is deliberately approximate, not a complete
accessibility tree. Large/raw DOM and browser objects are not sent. Ref lifetimes end on a new
observation, action or handoff. The adapter pins each ref to its exact node and checks semantic
freshness; a replacement node cannot inherit an index-based action by accident.

SurfaceAdapter gained optional opt-in image observation and `describeTarget(ref)` because replay
refs alone could neither identify observed controls for action nor prove durable locator evidence.
The adapter verifies candidate accessibility, label, relative-text, text and structural strategies
against the same control, with frame scope. No selectors or coordinates are model tools. ADR-008
records this implementation-driven extension; artifact/replay result schemas are unchanged.

The seven tools are `ui_click`, `ui_fill`, `ui_select`, `ui_navigate`, `ui_read`, `finish_discovery`
and `request_human`. The coordinator accepts exactly one schema-validated decision, independently
classifies risk, evaluates existing policy plus optional restrictive runtime policy, executes,
records and observes again. Time and decision budgets include finish; there are no action retries.
The existing navigation guard is installed before opening. Every actual execute call is approved.

The DiscoveryRun retains caller contract, model identity, ordered decisions/actions, semantic
control snapshots, verified targets, policy decisions, before/after observation IDs, typed output
candidates and finish checks. Provider transcripts/hidden reasoning are not executable records.
Explicit finish requires required typed outputs from real reads and live source equality checks.
This verifies extraction and source continuity, not arbitrary natural-language goal correctness;
draft review remains necessary if the model selected the wrong semantic source.

## Evidence-to-artifact compiler

`compileDiscovery` is deterministic and accepts only a successful, verified run. It preserves
executed action order, substitutes exact declared input values with input ValueExpressions,
filters value-dependent locators, and emits targets derived only from adapter-verified evidence.
The next acted-on control supplies a visible-state checkpoint. Final success checks require bound
outputs and their visible sources, not equality to a fixed discovery balance. Replay still owns
runtime output values and output checkpoints.

Artifacts omit ephemeral refs, concrete discovery values, screenshots, goal literals and model
transcripts; provenance retains the discovery run ID and compiler version. Ambiguous bindings,
embedded-value interpolation and missing value-independent strategies fail rather than guessing.
The conservative whole-artifact value scan can reject benign short/common values. Boolean output
extraction, general branching and conditional recovery compilation are deliberately unsupported.
Happy-path runs emit no business/recovery/runtime-condition declarations because none were
demonstrated; the existing manually authored example continues to test those replay semantics.

`run-discovery.ts` uses no saved capability as input. On real completion it saves a draft and invokes
the existing generic replay on a fresh session with another fake member. Offline browser tests
prove this pipeline with a scripted model (12345 → 4321.09, then 67890 → 8765.43, zero replay model
calls). The first genuine provider request returned HTTP 429 before a decision (run
`92eb2d6e-cdba-47e9-9051-bb442492f466`); no generated artifact or live-discovery replay resulted.
That first failure confirms stopping/evidence capture, not the model's workflow capability.
Attempt #2 (`aafa19ac-42a4-4550-b25b-7d57b4589c66`) then demonstrated real model-selected
fill → Search → Account Information → read Savings → finish in five turns, without changing
production code or prompts. Live source verification passed for `4321.09`; the exact compiled
schema-1.1 draft replayed on member `67890` in a fresh browser and returned `8765.43`, with zero
model calls, index-0 locator resolutions and four matched checkpoint events. The public evidence
bundle preserves the unedited draft and value-free traces; raw screenshots/logs remain ignored.
This confirms the chosen boundaries for this happy path, not arbitrary branch discovery or general
visual reasoning. The relative Savings locator was retained while the discovery-balance text
locator was removed. No schema, provider, surface or replay architecture changed for this proof.

## Implemented vertical slice

`PlaywrightSurfaceAdapter` is the first concrete web adapter. It owns browser/context/page
objects, translates contract locator strategies into Playwright locators, and stores those
objects behind opaque runtime references. Resolution always walks the artifact strategies in
array order and reports the successful zero-based strategy index.

The controlled LegacyCore proxy exercises the boundary with an incorrect semantic label that
requires CSS fallback, table layout, an account iframe, a known host-busy interstitial, a
permission failure, and a risky dialog. The canonical model-free slice reads the fake savings
balance for member `12345`.

Surface checkpoints evaluate visible UI and location state. Output checkpoints remain a replay
concern because only replay owns the bound output map. The coordinator now implements that boundary,
including nested all/any conditions containing both UI and output checks.

## Generic deterministic replay

`src/replay/coordinator.ts` interprets a validated saved artifact. `values.ts` validates invocation
types/constraints, resolves expressions, and performs strict extraction transforms. `policy.ts`
checks origins, anchored path globs, actions and risk; an injected evaluator can further restrict
approval. `validation.ts` verifies cross-references before any browser opens. Runtime state is
separate from the parsed artifact and invocation values never mutate the caller's artifact.

Execution order is: validate → approve/open → inspect declared runtime conditions and business
outcomes → approve action → resolve target → execute → inspect outcomes → verify checkpoint.
Each step emits start/completion events; target resolution records its strategy index. Checkpoints,
policy decisions, recovery attempts and control transfers are observable. Results are validated
against the existing four-way ReplayResult union, including failure during validation or cleanup.

Schema 1.1 adds optional `runtimeConditions` because 1.0 could not express the proxy's permission,
busy, and operator-review screens. Each condition uses a normal checkpoint and a declared
disposition. Version 1.0 without these conditions remains supported. ADR-006 records alternatives,
versioning rationale and recovery semantics. ADR-007 supersedes its post-navigation-only limitation.

The coordinator processes one step at a time. UI checkpoints use bounded condition polling with
injectable clock/sleep dependencies; output checks are immediate because replay is their only
writer. Runtime condition probes are immediate and do not each consume their full timeout. A
compound UI checkpoint uses its largest leaf timeout as the overall polling budget.

Recovery counts explicit attempts beyond the original action. It may click a declared dismiss
target, then recheck the interrupted checkpoint; it never blindly reissues the original click.
An action error whose effects are uncertain stops with a failure. Runtime conditions and business
outcomes are evaluated after recovery as well as ordinary actions.

## Pre-request navigation boundary

Replay passes a surface-independent navigation evaluator in `SurfaceOpenOptions` before opening.
Web adapters must advertise guard support or replay fails closed. The evaluator uses the artifact's
origin/path allowlist; no Playwright request, route, frame or protocol type appears in core contracts.
Artifacts and ReplayResult schemas are unchanged. The small runtime seam is recorded in ADR-007.

The Chromium adapter installs context routing before page creation and a Fetch Request-stage
Document guard before initial navigation. Routing gates initial documents and installs separate
frame-session guards; Fetch gates redirects (ordinary Playwright routing skips redirected hops).
Links, forms, click-triggered script navigation, explicit navigation and frames share the allowlist.
Service workers are disabled; auxiliary pages are blocked. Non-document resources pass unchanged.

The first denial is sticky. Adapter boundaries propagate a generic NavigationPolicyError rather
than a misleading browser network exception. Replay records a blocked policy event and returns
`failure/policy_violation`, including safe origin-only diagnostics and current step where available.
Cleanup also checks for late denials. The guard stays active during human ownership; categorical
allowlist denials do not become requests for human approval. See the safety model for URL rules,
non-network navigation and browser-internal traffic limitations.

## Session ownership

The adapter retains one browser context and page throughout handoff. Relinquish and reacquire
advance an ownership epoch through the existing transition states. Automation actions are
rejected while the human owns the session, and intervention identifiers must match on return.
Headful adapter mode exposes the same live browser window to an operator; headless mode is used
for deterministic CI tests of the ownership invariant.

The coordinator retains InterventionRequest, session, event history and runtime context in an
in-memory handoff map. `getHandoff` returns a snapshot; `releaseHandoff` closes the retained session.
Normal terminal results close their sessions. A failed handoff also closes the session. Automatic
continuation is deliberately absent. Adapter handoff rejects in-flight actions and invalidates
old target references; target resolution detects ownership changes across awaits.

ADR-010 closes the implementation gap identified by the submission audit: a browser event recorder
uses HumanActionRecord under a matching human ownership epoch. A separate `demo:handoff` runner
waits for explicit terminal return, verifies the resolved warning/context, and completes the bank
inquiry through policy-checked SurfaceAdapter actions on the same page. Generic replay still returns
one intervention result; no automatic mid-artifact resume engine or approval bypass was added.
Simulations test the mechanism; genuine run `67e7318d-2874-4a8f-8917-89c4bd19a2fe` separately proves
one personally confirmed manual click, explicit handback and verified completion on the same session.
Its value-free evidence records epochs 0→1→2→3→4 and zero model calls; see `human-handoff.md`.
This confirms the existing design without extending it into general continuation or authenticated identity.

## Core invariants

1. Every executable replay step is explicit in the artifact.
2. Replay never asks an LLM what to do next.
3. Every UI action is policy-checked before execution.
4. Logical targets resolve via a deterministic ordered strategy list.
5. Checkpoints verify state transitions instead of assuming clicks succeeded.
6. Legitimate business outcomes are not flattened into automation failures.
7. Recoverable conditions use bounded policies and remain observable in the run log.
8. Only one actor owns the live session at a time.
9. Executable artifacts exclude concrete discovery values; raw runtime records require an explicit protected evidence boundary.
10. Managed HTTP(S) document navigation is policy-gated before request egress, including redirects.

Raw adapter evidence is accurately marked `redacted: false`. The demo uses fake data, stores
runtime evidence under an ignored directory, and does not claim redaction that has not occurred.
Generic replay requires explicit opt-in to capture it. Logs omit raw input/output values and
browser exception text; callers remain responsible for protecting returned outputs and handoffs.
Discovery is intentionally different: its in-memory observations/run contain raw declared data.
Explicit model-processing consent is required. Only the fake-data integration CLI persists these
records, under ignored `evidence/runtime/discovery/`, marked `redacted: false`; it also produces a
value-free tool summary. This is not a general redactor or a claim of provider zero retention.

## Separate evidence publication boundary

`src/evidence/publication.ts` defines raw/candidate/public evidence types, explicit discovery/replay
projections and content rejection. `schemas.ts` pins the public fields, including a deliberately
narrow web-artifact profile and compatibility schema for the accepted reviewed success manifest.
Core capability/replay contracts do not change or acquire publication/provider types.

`bundle.ts` checks schema, references, content and integrity before writing any public file. The
public writer preserves validated JSON bytes, rejects unknown files/binaries and refuses existing
run directories. A new publication manifest records public hashes/byte counts, reviewed/generated
timestamps and withheld-source metadata. Historical evidence is validated without rewriting it.
`validate-cli.ts` provides a read-only command with private inventory on stdin, no model/browser work.
The discovery/adapter raw writers gain only a public-destination persistence guard; execution,
provider configuration and normal ignored evidence output remain unchanged. ADR-009 records this
material trust boundary separately from runtime navigation/action policy.

Handoff adds a pinned `handoff.sanitized.json` profile: intervention/run association, ownership
phases/epochs, fixed action categories, explicit handback, completion checkpoints and value-free
result. The same content/integrity checks apply. The runner stores raw context privately and asks
for a separate publication confirmation; screenshots are never copied. Public records distinguish
automated simulation from operator-reported manual work and do not assert authenticated identity.
