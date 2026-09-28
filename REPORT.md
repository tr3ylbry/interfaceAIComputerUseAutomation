# 1. Architecture

Generic deterministic replay in `src/replay/` reads a saved capability, validates inputs and
references, opens a SurfaceAdapter session, binds values, executes ordered steps and returns a
validated ReplayResult. Playwright stays inside its adapter. The demo's saved artifact reads fake
member 12345's savings balance as 4321.09. Bounded discovery and compilation now exist in
`src/discovery/`, with an isolated OpenAI Responses adapter configured for gpt-6-astra. Each turn
combines a live screenshot and compact semantic snapshot and proposes one strict tool action.
The first genuine API attempt (run `92eb2d6e-cdba-47e9-9051-bb442492f466`) returned HTTP 429 before
any model decision: one request, zero UI actions, 2.098 seconds, no artifact or replay. Its reviewed
failure manifest remains under `evidence/discovery/`. A separately authorized genuine attempt #2
(`aafa19ac-42a4-4550-b25b-7d57b4589c66`) succeeded in 21.134 seconds and five Responses turns:
fill member `12345`, click Search, click Account Information, read the Savings value, then finish.
Discovery returned `4321.09` and verified the live source. The compiler produced a schema-1.1 draft;
the unchanged artifact replayed in a fresh browser for member `67890`, returning `8765.43` in
484 ms with zero model calls. All targets used strategy index 0 and all four checkpoint events
matched. The [reviewed bundle](evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/review-manifest.json)
contains the exact artifact plus value-free tool/replay traces. This demonstrates the central
through-line with real model choices, distinct from the separate scripted-model tests.

# 2. Artifact schema

The JSON artifact declares inputs, outputs, ordered steps, logical targets with ordered locators,
checkpoints, business outcomes, recovery budgets, and safety policy. Schema 1.1 adds checkpoint-based
runtime conditions for failures, recoverable states, and intervention. Version 1.0 artifacts without
conditions still validate. The example fixture remains manually authored; the separate attempt #2
artifact was genuinely generated and was neither replaced nor hand-edited before replay.
The compiler instead consumes normalized, verified DiscoveryRun evidence, derives targets from
adapter-verified controls, replaces caller-declared discovery values with input references, and
emits a draft with provenance and output/source checkpoints. Ephemeral refs and raw transcripts do
not enter the artifact. Undemonstrated business/recovery conditions are not invented.

# 3. Determinism & error handling

Replay has no model dependency. Values live in an invocation context; output checkpoints execute
there, while UI checks resolve through the adapter. Business outcomes precede subsequent extraction,
so MEMBER_NOT_FOUND terminates normally. Recovery emits attempt events and uses declared recovery
actions or bounded checkpoint rechecks. Uncertain original actions are never blindly repeated.
Exhaustion defaults to failure or can request intervention. Tests cover all terminal categories,
policy denial, value binding, checkpoints, strict transforms, evidence failure and cleanup.

# 4. Heterogeneity & multi-tenant

The proxy uses imperfect labels, tables and an account iframe. Tests demonstrate semantic locator
fallback and record the strategy index. Playwright types stay behind the surface boundary. Desktop
support and tenant binding profiles are seams only; no desktop or multi-tenant portability claim
has been demonstrated.

# 5. Escalation & handoff

Intervention creates an InterventionRequest and retains the same live session plus context/events.
Browser tests verify unchanged page identity, exclusive ownership, increasing epochs, rejected
automation under human control, and stale-reference invalidation. Callers explicitly release the
session. A headful browser permits manual interaction; the automated demo verifies transfer and
reacquisition only. Human action recording and automatic continuation are unimplemented.

# 6. Safety

Policy precedes opening and every execute call, including recovery. It constrains exact origins,
anchored path patterns, action kinds and risk; irreversible actions block or require review. Runtime
policy may further restrict action approval. Explicit navigation is checked before execution;
Chromium document requests from links, forms, scripts, frames and redirect chains are intercepted
before egress. Instrumented tests verify zero requests at forbidden destinations, including
same-origin forbidden paths and cross-site frame redirects. Ordinary subresources are not blocked.
This is navigation enforcement, not a general outbound-data sandbox. Raw evidence
is disabled by default in replay and enabled for the fake-data demo. It is unredacted and ignored
by Git. Events omit invocation values and raw browser errors; returned outputs and handoff context
remain sensitive caller-owned data.
Discovery reuses these boundaries. Unknown clicks require review or are blocked; known inquiry
permissions come from the caller, never the model. Fills/selects accept only declared values.
Screenshots are raw and model processing needs explicit caller consent. Responses uses `store: false`
and disables parallel calls; this does not promise zero provider retention. Model refusals, invalid
decisions, deadlines and step exhaustion stop rather than trigger hidden retries.

# 7. Cuts

No operator console, queue, database, application service API, desktop adapter, or tenant override
engine is implemented. Recovery supports declared dismiss clicks and
checkpoint rechecks. Automatic continuation, production redaction, authenticated artifact approval,
and broader outbound-data restrictions remain gaps. Chromium protocol dependence, unsupported
auxiliary pages/service workers, and unguarded non-document/browser-internal traffic limit the
safety claim. Discovery is semantic-only (no coordinate fallback); current compilation supports
linear successful paths and exact scalar input substitution, not arbitrary value interpolation or
branch discovery. A typed value read from a live source is necessary, but does not prove that an LLM
selected the semantically correct account. The first live run exposed a diagnostic limitation:
non-success provider bodies/headers are discarded, so HTTP 429 cannot be classified further from
the saved evidence. Success headers, exact HTTP status and response model echo are also not
persisted; five completed decisions are evidenced, not reconstructed provider metadata. No code,
prompt or architecture change was needed for attempt #2. One controlled happy path and one second
fake input do not establish broader reliability, adversarial robustness or tenant portability.
The exact artifact retains its original loopback endpoint; automatic rebinding is not demonstrated.
Review the accepted evidence/draft before choosing further work. Production evidence handling and
artifact approval remain the next safety gaps; no further live attempt is implied.
