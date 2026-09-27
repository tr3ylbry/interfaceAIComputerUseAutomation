# Documentation & Decision-Tracking Protocol

This project is intentionally documented as it is built so every important implementation and architecture choice can be explained later in an engineering/leadership discussion.

## Goals

Documentation should preserve not only **what** was built, but also:

- why a decision was necessary,
- which credible alternatives were considered,
- why one option was selected,
- what tradeoffs and risks were accepted,
- what implementation evidence confirmed or challenged the decision,
- what would cause us to revisit it,
- what was deliberately cut or deferred,
- what failed during implementation and what was learned.

The documentation should make it possible to reconstruct the reasoning behind the system without relying on chat history.

## Source-of-truth split

### Repository

The repository contains durable technical truth that must travel with the submission.

Maintain:

- `README.md` — setup, commands, current demo path, repository orientation.
- `REPORT.md` — final assignment write-up using the required seven headings. Update only when implementation evidence supports the claims.
- `docs/architecture.md` — current system structure and component boundaries.
- `docs/decisions/` — ADR-style records for material technical choices.
- `docs/build-journal.md` — chronological engineering sessions, discoveries, failures, and changes in direction.
- `docs/error-model.md` — runtime classification and handling semantics.
- `docs/safety-model.md` — policy, risk, redaction, and data-handling decisions.
- `docs/human-handoff.md` — session ownership/control-transfer design and implementation notes.
- `docs/interview-defense.md` — questions the final implementation must be defensible against.
- `evidence/` — preserved, redacted evidence from real discovery and deterministic replay runs.

### Notion

Notion contains the broader working history and project-management layer:

- assignment requirements matrix,
- project tasks and status,
- architecture/decision log,
- chronological build journal,
- open questions,
- implementation planning,
- interview-defense notes.

The repository should contain enough reasoning to stand alone. Notion may be more detailed and chronological, but it must not be the only place where a technical decision required to understand the submission is documented.

## Decision-record standard

Every material architectural or implementation decision should capture:

1. **Context** — what problem, requirement, or implementation finding forced a choice?
2. **Options considered** — realistic alternatives, not strawmen.
3. **Decision** — what was selected.
4. **Rationale** — why it best fits this assignment and current evidence.
5. **Tradeoffs / risks** — what becomes harder, less flexible, or less ideal.
6. **Evidence** — code paths, tests, run IDs, traces, screenshots, or observed behavior supporting the decision.
7. **Revisit conditions** — what new evidence would cause us to change it.
8. **Implementation references** — files/commits/tests where the decision is embodied.

Create or revise an ADR when a decision materially changes a system boundary, data contract, execution semantic, safety behavior, replay behavior, control-transfer behavior, or scaling/generalization story.

## Build-journal standard

After each meaningful implementation session, record:

- goal for the session,
- files/components changed,
- tests and validation run,
- observed behavior,
- unexpected findings,
- failed approaches,
- decisions created or revised,
- evidence produced,
- unresolved questions,
- deliberate cuts,
- next implementation step.

A build-journal entry should explain reasoning that a Git commit message cannot.

## Evidence discipline

Do not claim behavior in `REPORT.md`, ADRs, or interview-defense notes that has not been demonstrated.

For important claims, preserve evidence such as:

- real discovery run log,
- deterministic replay run log,
- emitted capability artifact,
- failure/business-outcome evidence,
- Playwright trace,
- redacted screenshots,
- human-handoff control events,
- automated tests.

Evidence must not contain real credentials, secrets, tokens, or sensitive PII.

## Keeping Notion and Git aligned

After each significant phase:

1. Update the relevant Notion task status.
2. Add a dated Notion build-journal entry.
3. Update/create repository ADRs for material decisions.
4. Update repository technical docs affected by the implementation.
5. Update `docs/build-journal.md`.
6. Add evidence references once real runs exist.
7. Update `docs/interview-defense.md` with new questions/weaknesses discovered.
8. Update `REPORT.md` only for claims now supported by working implementation/evidence.

If Notion and repository documentation disagree, reconcile them immediately rather than letting two architecture narratives develop.

## Interview-preparation principle

For every important component, be able to answer:

- What requirement does this satisfy?
- Why is this boundary here?
- What simpler alternative existed?
- What more sophisticated alternative existed?
- Why was this level of complexity appropriate?
- What failure modes does it address?
- What does it deliberately not solve?
- How would it need to change at interface.ai's real multi-tenant scale?
- What evidence shows the implementation behaves as claimed?

The goal is not to memorize polished answers. The goal is to preserve enough engineering history that the answers follow naturally from decisions actually made during the build.
