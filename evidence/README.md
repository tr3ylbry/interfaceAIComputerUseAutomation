# Evidence

This directory documents the evidence boundary. **Attempt #2 demonstrates genuine OpenAI discovery
followed by different-input, model-free replay.** Attempt #1's HTTP 429 and untouched raw evidence
remain preserved. Scripted-model tests remain separate engineering evidence; the example capability
remains hand-authored. Raw screenshots/logs are not public merely because the bank data is fake.

## First attempt: provider failure, not successful discovery

Run `92eb2d6e-cdba-47e9-9051-bb442492f466` used the unchanged integration command, configured
gpt-6-astra/medium, a present local key and a clean baseline with 126/126 passing tests. From
23:53:25.898Z to 23:53:27.996Z on 2026-09-27 it opened the proxy, captured one screenshot and nine
semantic elements, then stopped at `provider_http_429`. One provider request was attempted, zero
decisions were returned, and no UI action, finish, artifact or replay occurred. No retry was made.

The original files remain unchanged under ignored `runtime/discovery/<run-id>/`:
`discovery-run.raw.json`, `observation-0.png`, and `tool-trace.sanitized.json`. The screenshot shows
only the blank fake member-search screen. Byte checks found no configured key, credential patterns,
authorization headers or absolute local paths in these files; the raw log still contains declared
sensitive fake inputs and is not approved for publication.

The public candidate bundle contains only
[`review-manifest.json`](discovery/92eb2d6e-cdba-47e9-9051-bb442492f466/review-manifest.json),
a manually reviewed metadata summary with hashes of the unchanged originals. It omits input values,
URLs, control text/refs, absolute local paths and provider bodies. It is **not** an automatically
generated success manifest, signed provider attestation or generated capability. Request count and
configuration are identified as derived from the executed code path; the failure log itself only
stores returned decisions, which were zero.

The provider's 429 subtype, request ID and Retry-After were discarded by the existing adapter.
Do not label this definitively as transient rate limiting or insufficient credits. No model mistake,
semantic-vs-visual strategy, target normalization or cross-member generalization can be assessed
from a response that returned no action. The separately authorized success is recorded below.

## Attempt #2: genuine discovery and unchanged-artifact replay

Run `aafa19ac-42a4-4550-b25b-7d57b4589c66` used unchanged production code/prompts at commit
`02ff7f39827e6a2e2ce7715d062642430e5d896a`, after clean synchronized main, a safe key-presence
check, typecheck and 127/127 tests. Exactly one `npm run discover` invocation selected five model
decisions: fill → Search → Account Information → read Savings → finish. Discovery took 21.134s;
the real UI returned the expected first-member balance and live-source finish verification passed.
Fresh generic replay of the same serialized artifact returned the second-member balance in 484ms,
with zero additional model calls, no recovery and four matched checkpoint events.

Reviewed submission-candidate files:

- [review-manifest.json](discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/review-manifest.json):
  explicitly authored post-run review, source hashes, safe control/policy metadata and fixture-match
  results. It is not a raw provider transcript or authenticated attestation.
- [capability.json](discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/capability.json): byte-for-byte
  generated draft, schema/reference validated, no concrete inputs/outputs, runtime refs or
  provider/browser objects. The run's ephemeral loopback URL is deliberately retained; this is not
  a rebound artifact or a promise that the closed server is still available.
- [tool-trace.sanitized.json](discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/tool-trace.sanitized.json):
  byte-for-byte value-free trace written by the coordinator's evidence writer.
- [replay.sanitized.json](discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/replay.sanitized.json):
  reviewed projection of the real replay log retaining event order/timestamps/locator indices/
  checkpoint results, with invocation and output values omitted. Not another replay execution.

Ten original files remain unchanged under ignored `runtime/discovery/<run-id>/`: full structured
run, five unredacted screenshots, generated capability, original CLI manifest, raw replay result,
and sanitized tool trace. All screenshots were visually reviewed and show only the fake proxy.
The original manifest includes an absolute local artifact path, so it is **not** copied publicly.
The reviewed public bundle contains no configured key, authorization/cookie material, provider
secrets, absolute filesystem paths or unrelated sensitive data. Raw records retain declared
sensitive fake values; they remain private, not relabelled as sanitized.

The adapter only yields decisions after successful completed Responses results; exact success
HTTP status, request IDs, headers/rate-limit metadata and response model echo were not retained.
Do not reconstruct those fields. Both screenshot and semantic inputs were sent, but the trace
cannot quantify the model's reliance on vision. This proves one controlled path and a second input,
not unseen business branches, arbitrary UI robustness or a general redaction pipeline.

## Explicit real-run command

With `OPENAI_API_KEY` set securely, run `npm run discover`. The command starts a fake-data proxy,
uses OpenAI Responses once per bounded decision, compiles the successful run and replays its
serialized artifact for a different fake member in a fresh session. No saved capability is loaded
as discovery input and no scripted fallback exists. Missing credentials stop before browser/API use.

The default provider/model is `openai-responses` / `gpt-6-astra`, configurable via `OPENAI_MODEL`.
Each run writes to **ignored** `evidence/runtime/discovery/<run-id>/`:

- `discovery-run.raw.json`: original request, normalized decisions/actions, control evidence,
  policy checks, observations referencing screenshots, outputs and finish checks; `redacted: false`.
- `observation-*.png`: actual viewport screenshots, unredacted, including declared fake sensitive data.
- `tool-trace.sanitized.json`: value-free tool names, IDs, policy outcomes and execution flags;
  no arguments, goals, URLs, control text, model response bodies or hidden reasoning.
- `capability.json`: generated schema-1.1 draft, only after verified discovery and compilation.
- `replay.raw.json`: different-member invocation and generic ReplayResult, explicitly unredacted.
- `manifest.json`: provider/model, run ID, action sequence, model-turn count, artifact path, replay
  verification and model-call delta (must be zero during replay).

Failures preserve the structured run and screenshots when available but do not fabricate a
capability/success manifest. The smoke CLI prints the evidence directory even when discovery fails.
The live discovery proof is complete only when the manifest verifies both real discovery and the
expected second-member replay output (`8765.43`). The key is never included in these files.

## Publication and limitations

Raw records use restrictive file permissions and remain ignored. Do not force-add the runtime
directory. Review and deliberately sanitize an evidence bundle before copying approved files into
tracked `evidence/discovery/`; the minimal tool summary alone does not redact screenshots/logs.
Generated artifact endpoints reference that proxy process; no automatic cross-environment rebinding
or authenticated provenance is claimed. `store: false` is not provider zero-retention assurance.

Future reviewed submission bundles may include:

- `discovery/` — real LLM-driven run log, screenshots/trace, emitted artifact.
- `replay-success/` — model-free successful replay evidence.
- `replay-business-outcome/` — deterministic legitimate non-success outcome such as member not found.
- `replay-intervention/` — same-session human handoff evidence.

No real credentials, tokens, or sensitive PII belong here.
