# 1. Architecture

Generic deterministic replay in `src/replay/` reads a saved capability, validates inputs and
references, opens a SurfaceAdapter session, binds values, executes ordered steps and returns a
validated ReplayResult. Playwright stays inside its adapter. The demo's saved artifact reads fake
member 12345's savings balance as 4321.09. Discovery and compilation are not implemented.

# 2. Artifact schema

The JSON artifact declares inputs, outputs, ordered steps, logical targets with ordered locators,
checkpoints, business outcomes, recovery budgets, and safety policy. Schema 1.1 adds checkpoint-based
runtime conditions for failures, recoverable states, and intervention. Version 1.0 artifacts without
conditions still validate. The fixture is manually authored, not evidence of an LLM discovery run.

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

# 7. Cuts

No LLM provider, discovery loop, compiler, operator console, queue, database, remote API, desktop
adapter, or tenant override engine is implemented. Recovery supports declared dismiss clicks and
checkpoint rechecks. Automatic continuation, production redaction, authenticated artifact approval,
and broader outbound-data restrictions remain gaps. Chromium protocol dependence, unsupported
auxiliary pages/service workers, and unguarded non-document/browser-internal traffic limit the
safety claim. The next task is to specify discovery inputs, approval boundaries and provider
requirements before selecting a provider or implementing a model-driven loop.
