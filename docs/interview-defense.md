# Interview defense guide

Be able to explain each architectural choice as: constraint → alternatives → decision → rationale → downside → revisit signal.

Key questions:

- Why normalize discovery into an artifact instead of replaying the model transcript?
- Why is normal replay model-free?
- Why is Playwright hidden behind `SurfaceAdapter`?
- How are multiple locator strategies still deterministic?
- Why do checkpoints matter after apparently successful UI actions?
- Why is `MEMBER_NOT_FOUND` a business outcome instead of an exception?
- Why are recoverable conditions events rather than terminal results?
- What gets retried automatically, and how is the retry budget bounded?
- How does the policy engine constrain both discovery and replay?
- How does same-session human control avoid split-brain ownership?
- What changes to support a native desktop surface?
- How would vendor-level artifacts be specialized for tenant/version differences?
