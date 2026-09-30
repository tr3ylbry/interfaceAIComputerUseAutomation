# Safety model

The policy engine sits between both discovery/replay decision logic and the surface adapter.

Initial policy dimensions:

- permitted origins,
- permitted path patterns,
- permitted action kinds,
- action risk class,
- irreversible-action policy (`block` or `require_human`).

Sensitive invocation values may exist in memory long enough to execute an action, but artifacts and persistent logs should store references/redacted summaries rather than raw secrets, credentials, tokens, or sensitive PII.

## Replay enforcement

The coordinator validates artifact references and input constraints before opening a session.
Draft artifacts require explicit development opt-in. Opening validates the entry point. Each step
and each recovery action receives a policy decision before execution; an injected runtime evaluator
can tighten, but cannot override, an artifact-policy denial. Irreversible actions either fail or
request human intervention without executing. Recovery clicks conservatively use reversible-write
risk because the existing recovery policy has no per-action risk declaration.

Explicit navigation is checked before execute. Implicit navigation is now also gated at the
browser request boundary, not merely checked after the surface changes (ADR-007).
Artifact approval is a trust assertion, not authentication.

Events contain IDs and statuses rather than caller values or raw exception messages. Raw evidence
is opt-in and remains unredacted. Return values and handoff context intentionally carry invocation
data in memory. Production persistence requires a separate redaction/retention design.

## Discovery enforcement and model data

The model is an untrusted proposer, never a browser operator. Seven strict function tools accept
current observation refs or an explicit URL, not selectors, coordinates, scripts, shell commands
or arbitrary code. Parallel calls are disabled and multiple returned calls are rejected before any
execution. Independent runtime schema validation remains necessary even with provider strict mode.

Every proposal passes argument validation, risk classification and existing action/location policy
before execute. A runtime policy hook may further restrict approval. Unknown clicks conservatively
carry irreversible-write risk: policy either blocks or transfers the same session to a human.
The caller may authorize known inquiry controls by exact semantic role/name and current path.
Those unordered permissions are application trust configuration, not workflow steps or a general
proof that similarly named controls are harmless. Adversarial applications could spoof semantics;
this slice is for the configured controlled target, not arbitrary hostile websites.

Fill/select values must match explicitly authorized discovery inputs exactly. They are reversible
interactions only within the configured surface; no arbitrary model-supplied literals are entered.
Read and in-policy navigation remain read-only. A route allowlist is not server-side transaction
authorization. All implicit document requests still pass the pre-egress guard; a model-driven
click cannot weaken it. Visible dialogs pause before another model call. The coordinator never
treats a categorical allowlist violation as an opportunity for approval.

Observation refs bind to exact nodes and expire on re-observation, any action or handoff. The adapter
rejects changed control semantics rather than silently retargeting an old index. Automation ownership
is revoked synchronously before asynchronous handoff cleanup. These checks reduce stale-state risk,
but are not an atomic transaction with application-side DOM/server mutations.

The caller must approve model processing. Screenshots and compact observations can expose input,
output, URL and other visible data; `sensitive: true` is metadata, not automatic redaction. Password
field values are omitted from the structured projection, but screenshots are not scrubbed. Use only
fake data for this integration. UI content is explicitly treated as untrusted in the model prompt;
independent policy remains the enforcement boundary against prompt injection.

The key stays in the environment/ignored env file and the provider's Authorization header. The
Responses client has a fixed HTTPS endpoint and refuses redirects; it does not record provider
error bodies or hidden reasoning. `store: false` disables Responses storage, not every possible
provider retention mechanism. Review provider data controls before processing real customer data.

DiscoveryRun is an **unredacted in-memory record**, including concrete values and observations.
The explicit integration CLI persists raw records/screenshots with restrictive file permissions
inside ignored `evidence/runtime/discovery/`. Its sanitized tool summary contains only IDs, action
names, policy outcomes and execution flags. This selective summary is not a general redactor.
The compiler filters concrete input/output values and refuses unsafe normalization; generated
artifacts remain drafts. Provenance and draft approval are not signed/authenticated attestations.

## Public evidence publication boundary

Only evidence that has passed the publication boundary may be written under committed/public
evidence paths. `src/evidence/` separates raw records, untrusted publication candidates and immutable
validated public bytes. This does not change UI decisions, replay, prompts or provider settings.

`discoveryTrace` and `replayProjection` construct allowlisted fields; they do not recursively redact
raw objects. Outputs, invocation arguments, screenshots, provider bodies and free-form replay
messages/reasons are omitted by construction. The historical reviewed projection may retain its
explicitly allowlisted reason field, subject to the same content checks. Unknown nested public
fields fail strict validation. New runtime fields therefore do not automatically become public.

`publishEvidenceBundle` validates the entire bundle before creating its directory. It checks an
explicit private inventory of known sensitive values and secrets, credential field names and text,
common macOS/Linux/Windows/UNC/file-URI paths, binary data and schema/integrity consistency. Exact
scalar/token-boundary checks avoid numeric UUID substring false positives. Ordinary route paths
and HTTP URL paths are not treated as filesystem paths. Duplicate-key/noncanonical JSON fails;
errors never print offending values. Existing accepted artifact bytes are preserved, not repaired.

Publication is JSON-only. Screenshots and arbitrary binaries are rejected, even if a caller adds
an approval flag. Explicit manual sanitization/review of binaries is outside this automatic path;
their hashes/byte counts may be recorded as withheld sources. No image redaction is claimed.
The writer refuses overwrites and symlinked public destinations, and writes its generated manifest
last. Raw discovery/adapter evidence writers reject public evidence destinations before persistence.

This is not production DLP: inventory completeness, raw storage/retention, model-input privacy,
unknown/encoded credentials, general PII detection and authenticated approval remain outside scope.
The path guard protects this repository's evidence tree; callers own temporary/external private
destinations. Local operators can still bypass application APIs or force-add ignored files. See
ADR-009 and `evidence/README.md` for the supported profile and explicit validation procedure.

## Navigation request invariant

“No browser request capable of moving the automated session outside its allowed navigation surface
may be sent unless policy permits it.”

For this Chromium adapter, the enforced traffic is HTTP(S) document navigation: initial opening,
explicit navigation, links, form GET/POST submissions, script-triggered navigation after a click,
child/nested frames and every server redirect hop. Child frames use the **same** capability origin
and path allowlist; the savings artifact therefore explicitly includes `/frames/accounts/*`.
Auxiliary pages/popups are unsupported in this single-page adapter and their document requests
are categorically blocked, even for an otherwise allowed destination.

This is not a blanket network sandbox: ordinary scripts, styles, images, fonts, fetch/XHR and other
non-document traffic pass unchanged, including cross-origin resources. A permitted click still
needs action/risk approval; navigation interception does not approve the click's other effects.
An implicit document request is checked against the navigation allowlist, not required to be a
separately declared `navigate` step. The runtime action-policy hook remains an action-level hook.

The generic evaluator takes policy, an allowed context URL, and a candidate URL. The adapter uses
the managed top-level page as that context, or the approved entry point before the first document.
It installs context routing before page creation and Chromium Fetch request-stage interception
before the first navigation. Context routing covers initial documents and pauses new frame
requests while their protocol guard is attached. Fetch intercepts redirect hops that Playwright's
ordinary routing otherwise automatically continues. Same-process frames use their parent's
protocol session; out-of-process frames receive a guard before their request is continued.
Service workers are disabled so they cannot bypass routing. No redirect is manually refetched or
rewritten; the browser retains normal method, cookie, URL and redirect semantics.

## URL rules

- HTTP(S) only; credentials in URLs are rejected. Configured origins cannot include a path/query.
- WHATWG URL normalization supplies lowercase hosts, default-port equivalence and relative URL
  resolution. Dot segments are canonicalized before matching; the resulting destination must match.
- Match the decoded pathname once, not query or fragment. Reject malformed encoding, encoded
  separators/backslashes/dots remaining after normalization, and residual percent escapes.
- Existing anchored `*` patterns match zero or more characters, including `/`. Other characters
  are literal. Empty patterns allow all paths on permitted origins. Literal trailing slashes matter.
- Queries/fragments are not authorization constraints. Applications needing parameter-level rules
  need an additional policy design; allowing a route does not approve every server-side operation.

## Denials, handoff, and limits

A denial aborts before the destination receives a request and latches a `NavigationPolicyError`.
Replay emits a blocked `policy_decision` and returns `failure/policy_violation`, not a timeout,
surface error, recoverable condition or automatic human intervention. Diagnostics include the
active step when available, source/destination origins with paths/query/credentials removed, and a
stable reason. Existing opt-in evidence remains unredacted; this narrow URL diagnostic protection
is not a general evidence-redaction system. Guard errors fail closed.

The guard stays installed during human ownership; handoff is not an allowlist bypass. A denied
human navigation prevents reacquisition, but explicit disposal remains possible. There is no
general automatic workflow continuation or rewriting of a previously returned intervention result.

Limitations: Chromium-only protocol enforcement, one managed page, no service-worker applications,
and no general data-exfiltration protection. Same-document history/hash changes and non-network
`about:`, `data:` or `blob:` surfaces do not send HTTP document requests and are not governed by
this interceptor; replay's observed-location checks still reject disallowed top-level state.
Speculative/browser-internal traffic not classified as document navigation is not covered by the
tested guarantee. This is not isolation against a compromised browser, extensions, DNS rebinding,
malicious local operators or an application's server-side proxying. Revisit before exposing an
untrusted arbitrary web application or enabling other browser engines/speculative surfaces.

`tests/navigation-policy-browser.test.ts` uses server-side counters, including redirect chains
and cross-site frames: blocked destinations receive zero requests, while permitted documents and
cross-origin scripts receive requests. Final browser location alone is not treated as evidence.

## Recorded manual handoff (ADR-010)

The recorder's Node-side gate requires current human ownership and epoch; it stops synchronously
before automation reacquires control. Fixed browser instrumentation captures native clicks, typing,
selection/change and document navigation. It never reads typed values, option text, labels or HTML.
Fixed semantic categories trade detail for privacy. Origin-only navigation diagnostics stay private;
even those origins are omitted from public evidence. Raw runner snapshots omit operator-controlled
URL paths/queries too. The recorder does not disable navigation policy or imply action approval.

The demo requires explicit `return`, validates the known member/warning context and checks the
original policy before its completion click/read. A still-open warning, changed context, missing
manual record, recorder overflow or navigation denial fails acceptance. No screenshot/trace is
exported by this runner. Separate `publish` confirmation passes only the strict handoff projection
through the existing publication gate; unknown fields, values, credentials, paths and binaries still
fail closed. The original discovery bundles and generated artifact are unchanged.

Native event trust is not human identity: automation tools can generate native events. This is not
lossless input auditing or protection against hostile page scripts/OS users. Bootstrap, unload and
bridge boundaries can lose events; popups/native browser UI and closed shadow roots are unsupported.
The author personally completed and reported run `67e7318d-2874-4a8f-8917-89c4bd19a2fe`; its one
redacted click, explicit handback, same-session completion and zero-model result pass the unchanged
publication rules. The actual-human requirement is proven for that controlled pass, based on the
author's report plus structured evidence, not authenticated operator identity. No new privacy or
lossless-audit guarantee follows from this single success.
