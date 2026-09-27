# ADR-008: Typed discovery with strict direct model tools

**Status:** Accepted and implemented; live API proof pending credentials.

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
No genuine API run occurred: no OPENAI_API_KEY was available. Mocked payload conformance is not
evidence of model access, live API acceptance or actual model-chosen workflow success.

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
