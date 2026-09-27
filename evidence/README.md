# Evidence

This directory documents the evidence boundary. **No genuine OpenAI discovery run has been
preserved yet: live API credentials were unavailable.** Passing scripted-model tests are engineering
evidence, not proof of a real model choosing UI actions. The example capability is hand-authored.

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
