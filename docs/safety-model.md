# Safety model

The policy engine sits between both discovery/replay decision logic and the surface adapter.

Initial policy dimensions:

- permitted origins,
- permitted path patterns,
- permitted action kinds,
- action risk class,
- irreversible-action policy (`block` or `require_human`).

Sensitive invocation values may exist in memory long enough to execute an action, but artifacts and persistent logs should store references/redacted summaries rather than raw secrets, credentials, tokens, or sensitive PII.
