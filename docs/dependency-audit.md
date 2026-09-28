# Dependency audit

## 2026-09-27 baseline

`npm audit` reports two moderate entries for one advisory:

- Direct development dependency: `vitest@3.2.7`
- Transitive development dependency: `@vitest/mocker@3.2.7`, reached through Vitest
- Advisory: `GHSA-82fw-gwwq-j7x9`, path traversal / arbitrary file read through redirect mocks
- Affected range reported by npm: Vitest-related versions below `4.1.11`

`npm audit --omit=dev` reports zero vulnerabilities. Vitest and its mocker are test tooling; they are
not imported by the proxy or Playwright adapter and are absent from the production dependency tree.
The vulnerable redirect-mock feature is not used by this repository's tests.

npm offers `vitest@5.0.2` as the automatic fix and marks it as a SemVer-major change. There is no
in-range patch for the current `^3.2.4` declaration. The finding is intentionally unresolved because
the requested policy excludes forced or potentially breaking upgrades, and the issue has no runtime
exposure here. Reassess a deliberate Vitest major upgrade separately; do not run
`npm audit fix --force`.

## 2026-09-28 submission audit

Re-ran both commands against the registry: unchanged two moderate development entries for
`GHSA-82fw-gwwq-j7x9`; production findings remain zero. A clean lockfile install also completed.
No dependency or lockfile change was made. Preserve the disposition above and keep the test runner
local; an intentional major-version migration is separate work, not a submission prerequisite.
