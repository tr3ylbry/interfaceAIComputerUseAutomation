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

Origins match exactly. Path globs are anchored, with `*` matching any path suffix. Non-HTTP(S), URL
credentials and ambiguous encoded path separators are rejected. Explicit navigation is checked
before execute. Implicit form/link navigation is checked after it occurs, before further actions.
This boundary does not prevent an approved click from sending a request elsewhere; browser network
enforcement is a remaining limitation. Artifact approval is a trust assertion, not authentication.

Events contain IDs and statuses rather than caller values or raw exception messages. Raw evidence
is opt-in and remains unredacted. Return values and handoff context intentionally carry invocation
data in memory. Production persistence requires a separate redaction/retention design.
