# Submission-readiness audit — finalized 2026-09-30

**Verdict: READY TO SUBMIT.** Genuine discovery → typed artifact → different-input model-free replay
and genuine recorded same-session handoff are proven within the controlled take-home scope.
The author personally completed run `67e7318d-2874-4a8f-8917-89c4bd19a2fe`: one manual click,
explicit terminal handback, restored ownership and successful verification/navigation/extraction.
The [public handoff evidence](../evidence/discovery/67e7318d-2874-4a8f-8917-89c4bd19a2fe/handoff.sanitized.json)
passes the unchanged publication validator. No submission blocker remains. This is not authenticated
human identity, a general continuation engine or a production co-browsing claim.

Historical audited baseline: `a35c1e4fce33beae0b51c1491f3274bc6cc6439d`. The original audit changed documentation/setup
guidance and published one existing-runtime exceptional replay projection. No source, tests,
dependencies, prompts, provider configuration or accepted generated-artifact bytes changed in that audit.
No OpenAI call or discovery command was run. The matrix below incorporates the subsequent recorder
implementation and genuine acceptance; historical audit findings/validation retain their original date.

## Requirement matrix

Requirements were checked against the project's assignment matrix and the author's explicit
clarification that actual human-action recording and same-session manual work/handback/completion
are must-haves. PROVEN means demonstrated within the controlled slice, not general production
robustness. PARTIALLY PROVEN distinguishes implemented seams from untested broader claims.

| # | Requirement | Result | Repository evidence and limits |
|---|---|---|---|
| 1 | Natural-language goal + target | PROVEN | [DiscoveryRequestSchema](../src/discovery/contracts.ts), [canonical caller contract](../src/vertical-slice/discovery-request.ts). |
| 2 | Real LLM observe → decide → act | PROVEN | [Genuine review manifest](../evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/review-manifest.json): five completed decisions; [tool trace](../evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/tool-trace.sanitized.json). Not a scripted model. |
| 3 | Stop on success, max steps, timeout, dead-end | PROVEN | [DiscoveryCoordinator](../src/discovery/coordinator.ts); [bounded-loop tests](../tests/discovery.test.ts), [provider refusal/malformed-result tests](../tests/openai-discovery-model.test.ts). |
| 4 | Typed/versioned artifact | PROVEN | [CapabilityArtifactSchema](../src/contracts/capability.ts); [generated schema-1.1 draft](../evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/capability.json). |
| 5 | Artifact decoupled from transcript | PROVEN | [Compiler](../src/discovery/compiler.ts) consumes normalized verified evidence; generated JSON has no transcript/provider objects. |
| 6 | Typed inputs / parameterization | PROVEN | Generated member_id string and input ValueExpression; [compile/different-input browser test](../tests/discovery-browser.test.ts). Exact scalar substitution only. |
| 7 | Typed outputs | PROVEN | Generated savings_balance currency extraction; [strict transforms](../src/replay/values.ts) and [tests](../tests/replay.test.ts). Not a general currency/locale library. |
| 8 | Ordered steps | PROVEN | Generated fill → click → click → extract; [replay interpreter](../src/replay/coordinator.ts) executes the array order. |
| 9 | Stable target/control identification | PROVEN | [Verified target descriptions](../src/adapters/discovery-observation.ts), [ordered fallback tests](../tests/playwright-surface-adapter.test.ts). Second-input locators reused; vendor drift remains unproven. |
| 10 | Checkpoints / success verification | PROVEN | Discovery finish rechecks live source; generated UI/output conditions; [replay checkpoint tests](../tests/replay.test.ts). Does not independently prove arbitrary semantic goal correctness. |
| 11 | Deterministic replay | PROVEN | [ReplayCoordinator](../src/replay/coordinator.ts), [real replay projection](../evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66/replay.sanitized.json). |
| 12 | No model decisions during replay | PROVEN | Genuine manifest records unchanged model counter; [dependency-boundary test](../tests/replay-browser.test.ts); replay imports only local replay/contracts/Node modules. |
| 13 | Business outcome | PROVEN | [Browser scenario test](../tests/replay-browser.test.ts), `MEMBER_NOT_FOUND`; [new value-free business result](../evidence/discovery/d7727060-ec70-4f74-b4a8-501825698825/replay.sanitized.json). |
| 14 | Recoverable condition | PROVEN | [Declared fixture](../examples/member-savings-balance.capability.json), slow/busy browser tests and audit demos; attempts are events, not terminal results. |
| 15 | Hard failure | PROVEN | Permission denial and recovery exhaustion in [browser tests](../tests/replay-browser.test.ts) and audit demos. |
| 16 | Structured failure context | PROVEN | [ReplayResult](../src/contracts/replay.ts) and browser assertions for step/expected/observed/evidence; uncertain effects are not retried. |
| 17 | Origin/route/action allowlists | PROVEN | [Generic policy](../src/replay/policy.ts), [navigation firewall](../src/adapters/navigation-firewall.ts), [zero-forbidden-server-hit tests](../tests/navigation-policy-browser.test.ts). Document navigation, not all network traffic. |
| 18 | Risky/irreversible actions | PROVEN | [Discovery risk classification](../src/discovery/policy.ts), [replay policy tests](../tests/replay.test.ts): blocked/unapproved actions do not execute. Inquiry permissions trust configured app semantics. |
| 19 | Sensitive-data handling, including broader production privacy | PARTIALLY PROVEN | Required public evidence/secret handling is proven by [publication tests](../tests/evidence-publication.test.ts), validated bundles and hygiene scans. Only non-required production PII detection/retention/model privacy remains partial; fake raw screenshots/results stay private. Not a production-data approval. |
| 20 | Structured logs / richer failure evidence | PROVEN | Replay events and opt-in [adapter capture](../src/adapters/playwright-surface-adapter.ts); failure tests assert screenshot/DOM references labelled unredacted. Raw binaries are intentionally not public. |
| 21 | Same-session human takeover | PROVEN | [Genuine handoff](../evidence/discovery/67e7318d-2874-4a8f-8917-89c4bd19a2fe/handoff.sanitized.json) records samePage/sameSession, human epoch 2 and one click personally confirmed by the author; ownership/stale-action tests remain green. No cryptographic identity claim. |
| 22 | Human handback / resume or complete | PROVEN | Same genuine bundle: explicitHandback, epochs 3→4, warning verification, account navigation, savings extraction and successful output verification, zero model calls. [Scoped completion](../src/vertical-slice/handoff-completion.ts) is not general automatic continuation. |
| 23 | Heterogeneous-surface abstraction and broader execution | PARTIALLY PROVEN | Required [SurfaceAdapter](../src/contracts/surface.ts) seam and REPORT desktop/heterogeneity explanation are proven; real awkward web/iframe execution works. Only the non-required desktop/visual-only implementation and broad portability remain unproven. |
| 24 | Multi-tenant/vendor variation discussion | PROVEN | [REPORT](../REPORT.md#heterogeneity--multi-tenant), [ADR-002](decisions/0002-surface-abstraction.md), [ADR-005](decisions/0005-targeting-and-core-contracts.md): versioned vendor flow + reviewed tenant bindings; no portability claim. |
| 25 | Genuine discovery evidence | PROVEN | Accepted four-file bundle; five model decisions, live read/finish verification; unchanged generated draft. First 429 attempt separately preserved. |
| 26 | Exceptional replay evidence | PROVEN | Audit closes missing-public-log gap with [replay-only bundle](../evidence/discovery/d7727060-ec70-4f74-b4a8-501825698825/publication-manifest.json), produced through existing publisher. |
| 27 | Public GitHub repository | PROVEN | GitHub unauthenticated repository API reported `private: false`, default branch main; fetched main matched origin/main before audit edits. |
| 28 | README / exact setup | PROVEN | Fresh checkout install, browser install, typecheck/tests; standalone proxy HTTP 200 and all six documented demos. Paid command inspected, not rerun. |
| 29 | REPORT exact seven headings | PROVEN | [REPORT](../REPORT.md) retains all seven literal required names and a concise write-up; handoff claims now cite genuine acceptance and its limits. |
| 30 | Evidence directory | PROVEN | [Evidence index](../evidence/README.md) distinguishes historical/generated/raw/private/public/replay-only data and provides read-only validation commands. |
| 31 | Record actual manual human actions | PROVEN | Genuine bundle records one redacted click/button associated with run/intervention and epoch 2, backed by the author's personal report. Manual click is genuinely demonstrated; type/select/navigation mechanisms remain separately simulation-tested. Public evidence is value-free and hash-validated. |

Final counts: **29 PROVEN, 2 PARTIALLY PROVEN, 0 NOT PROVEN** across the same 31 rows.
No required acceptance path remains partial: rows 19 and 23 retain conservative partial ratings
only for their broader, explicitly non-required production-privacy and desktop-execution scope.
Required safe public evidence, abstraction/explanation and tenant discussion are satisfied. Do not
use this fake-data prototype with real customer data without a separate privacy design.

## Findings and disposition

### A — Submission blockers

**A1: Recorded human handoff — CLOSED by genuine acceptance on 2026-09-30.** The original finding was: capture actual human interactions safely while the human
owns the same session, associate records/evidence with the intervention/run, then demonstrate
explicit return and automation resuming or completing on that page. At audit time, the adapter could
return ownership, but the demo/tests did not perform manual work or a successful action afterward.
The coordinator had `getHandoff`/`releaseHandoff`, not a continuation API. Do not equate ownership
transition with task completion, or a schema declaration with a working recorder.

The audit itself introduced no recorder. The subsequent ADR-010 slice implements that separate
path: 13 new simulated tests, 195 total passing; original discovery/replay/provider behavior remains
unchanged apart from recording during handoff. The author subsequently personally performed and
reported the accepted run above. Its two-file publication and four matched completion checkpoints
close A1. An operator console, authenticated approval, automatic continuation and another LLM run
remain unnecessary. The earlier NOT READY verdict was correct then and is preserved in the journal.

**A2: Missing committed exceptional replay log — fixed.** Existing tests were not the requested
saved exceptional evidence. The new replay-only business-outcome bundle closes this packaging gap
without changing the runtime or inventing a learned branch.

### B — Small should-fix items completed

- README now gives clone/locked install, Linux browser dependency note, env-file/key instructions,
  offline pipeline command and copyable public-evidence validation with no unavailable private file.
- REPORT headings use the literal required names; added concise bounded-tools and desktop/tenant
  tradeoffs from existing ADRs, without claiming implementation. Identified the real handoff gap.
- ADR-004's old awaiting-credentials statement is retained as history with a subsequent-proof note.
- Current handoff/architecture/defense material no longer suggests ownership tests prove manual work.

### C — Explicit cuts / non-blockers

1. Desktop, visual-only targeting and tenant-binding execution; only the seam/discussion is required here.
2. General workflow branching/interpolation; discovered artifact is the demonstrated happy path.
3. Production PII redaction/retention and general outbound DLP; this demo uses fake data only.
4. Full operator UI, authenticated operator identity and **automatic general** continuation; required explicit handback/completion is proven.
5. Broad reliability claims: one model-chosen path and one different fake member, not drift/tenant robustness.

### D — Stretch deliberately deferred

Authenticated artifact approval, signed provenance, branch discovery, additional adapters, tenant
override engine and richer safe provider diagnostics. No dependency major upgrade or new paid run
is needed for submission. Frameworks, queues, databases and service infrastructure are not required.

## Historical validation and repository hygiene — original audit

- Fresh temporary clone of audited baseline: `npm ci`, `npx playwright install chromium`,
  `npm run typecheck`, `npm test` all passed; **182/182**. Browser binaries use the installed local
  cache; Linux system-package installation was documented, not tested on this macOS host.
- Working checkout: typecheck and **182/182** tests passed. Ten suites include 20 browser navigation
  cases (zero forbidden hits), 22 URL cases, 55 publication cases, 38 discovery/provider cases,
  replay/adapter scenarios and core contracts. No live API transport in normal tests.
- All six exact demo commands passed: success; MEMBER_NOT_FOUND; slow recovered on attempt 1;
  busy-always exhausted attempts 1/2; permission_denied; intervention returned the same page from
  human epoch 2 to automation epoch 4, then released it. The last result is not manual-work proof.
- Standalone `npm run proxy` served the documented entry point with HTTP 200; the audit stopped it.
- Genuine four-file bundle and new two-file replay-only bundle pass the existing publication CLI.
  Accepted artifact SHA-256 remains `30a431ac3a45729d1cf8d887ea1c8057254579da072f1892bd6e3b155b03d6df`.
  The first failed-attempt manifest is an unchanged manually reviewed historical format; it is
  outside the validator's pinned success-manifest schema, not silently treated as validator-approved.
- Public-file hashes/byte counts and manifest relationships are valid. Withheld-source hashes are
  review assertions; no fresh provider transcript or private screenshots were published.
- Credential and machine-path scan: no configured key or real secret found. The sole key-pattern
  hit is the deliberately named fake rejection fixture in `tests/evidence-publication.test.ts`.
  No tracked env files (except `.env.example`), dependencies, build output, raw runtime files,
  screenshots, IDE metadata or temporary audit scripts. Private working docs remain ignored.
- `npm audit --omit=dev`: **0**. Full audit: **2 moderate**, direct Vitest and transitive mocker,
  same advisory/unused development redirect-mock feature. Existing documented disposition retained;
  no force fix or dependency change.

## Code quality review

No TODO/FIXME placeholders or accidental debug logs found in source. Console output is confined to
CLI diagnostics/demo results. The older bank runner is still exercised by adapter regression tests,
not dead production replay logic. All declared dependencies have imports/build/test use.
Provider HTTP objects remain in the discovery provider; Playwright/CDP types remain in adapters.
Replay has no bank/model imports. Bounded polling/backoff is explicit, with injectable clocks in
unit tests; no arbitrary browser sleeps were found. Catch sites normalize expected failures or
preserve safety/ownership on cleanup; provider diagnostic detail loss is an already documented cut.
At audit time, the unused HumanActionRecord was the material requirement gap, not a reason for a
style refactor. ADR-010 now implements its recorder/consumer, and the genuine pass closes acceptance.

## Final validation — 2026-09-30

- Typecheck and **195/195 tests** pass, including navigation confinement, publication, recorded handoff,
  all replay result categories, bounded recovery/exhaustion and scripted discovery. No live API call.
- Canonical deterministic demo returns success/4321.09. No new discovery or manual acceptance rerun.
- Genuine discovery, exceptional replay and new genuine handoff bundles all validate unchanged.
  New handoff public bytes (3,327) match SHA-256 `6bf92f05e6755f78bd9c967efdb1c769a5083bb22f216a723f37bcf6d226f663`.
  The withheld raw source's bytes/hash also match; its contents are not published.
- New handoff: run/intervention IDs match the envelope; one redacted action; same page/session;
  complete bounded recording; explicit handback; human/returned epochs 2/4; success; zero model
  calls; output verified and values omitted. All four checkpoints matched. The personal attribution
  and exact Operator reviewed label are author-reported; public evidence only says click/button.
- Production audit: zero. Development: unchanged two moderate Vitest/mocker findings for the same
  advisory. Suggested major fix is now 5.0.3; no forced remediation or dependency changes.
- Only the two new public handoff files are added as evidence; no raw runtime data, screenshots,
  secrets, local paths, environment files, dependencies or build output are added. Existing first
  failed discovery and accepted generated artifact remain untouched.

## Exact next action

**One final personal walkthrough of README, REPORT and evidence, then submission.** No further
implementation or paid discovery is needed.

## Assignment sources

The working assignment matrix and handoff task reflected inconsistent completion claims at audit
start. The author clarified during this audit that actual human-action recording
and explicit same-session return/completion are required. That clarification controls this verdict;
earlier checked boxes and green ownership tests do not override it. The matrix above is public
technical acceptance evidence, not a copy of private project-management/interview notes.
