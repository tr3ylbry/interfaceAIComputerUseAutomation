# ADR-007: Enforce navigation policy before browser request egress

**Status:** Accepted — supersedes ADR-006's post-navigation-only limitation.

## Context and invariant

Checking location after an approved click detects an escape too late: a form may already have
sent data to a forbidden endpoint. The invariant is: “No browser request capable of moving the
automated session outside its allowed navigation surface may be sent unless policy permits it.”
Document navigations are the scope; this is intentionally not a same-origin-only renderer or
general network/data-exfiltration sandbox. See `../safety-model.md` for precise limits.

The existing `open(target)` contract supplied no policy to the adapter before initial navigation.
Also, inspection of installed Playwright 1.63 Chromium request handling showed that ordinary
route interception automatically continues redirected requests instead of calling the user route
handler for each hop. Route-only enforcement would therefore leave a consequential bypass.

## Alternatives considered

1. Keep post-navigation validation: portable and useful as defense in depth, but cannot undo egress.
2. Patch DOM links/forms or inspect their URLs before clicks: misses script navigation and redirects.
3. Use context routing alone: small, covers initial documents/popups, but misses redirect hops.
4. Fetch redirects manually and fulfill routes: can change browser URL, cookies, methods and origins;
   a response proxy would be a larger and more fragile semantic change.
5. Add a network proxy: potentially stronger coverage, but unnecessary infrastructure for this slice.
6. Context routing plus Chromium Fetch request-stage enforcement: chosen; handles every tested hop
   without rewriting browser navigation, at the cost of a Chromium-specific implementation.

## Decision and boundary

Add only a runtime `SurfaceOpenOptions.navigationGuard(source, destination)` callback, a generic
allow/block decision and `NavigationPolicyError`. Adapters advertise `supportsNavigationGuard`;
web replay fails before opening an adapter without that capability. Saved artifacts, schema version,
steps, results and event unions do not change. No Playwright types cross the contract boundary.
The existing generic `policy.ts` owns URL normalization and allowlist semantics and remains usable
by a hypothetical desktop/web adapter. Action/risk approval still precedes every execute call.

Install context routing before creating the page. Gate each initial document request and install
Fetch guards on the page and separate frame protocol sessions before continuing requests. Fetch
pauses Document requests at Request stage, including redirect hops. Disable service workers.
Child frames use the same allowlist; reject auxiliary pages rather than silently creating an
unmanaged session. Ordinary subresources pass. Guards remain active through human ownership.

Latch the first denial and report it at adapter operation boundaries, including cleanup. This
preserves `policy_violation` when Playwright also throws a generic aborted-navigation error.
Do not convert categorical allowlist denials into human approval. Diagnostics strip path/query
values; evidence capture retains the existing opt-in/unredacted behavior.

## Tradeoffs and evidence

The runtime surface contract changed because pre-open policy delivery was genuinely missing,
not to imitate Playwright. Optional opening options retain standalone adapter compatibility;
only generic replay guarantees policy installation. Non-replay users must supply the guard.
Allowlists now need to include legitimate frame documents. Matching query parameters is outside
the current path-pattern contract. Ordinary subresources remain an intentional exfiltration gap.

Implementation: `src/contracts/navigation.ts`, `src/replay/policy.ts`,
`src/adapters/navigation-firewall.ts`, `src/adapters/playwright-surface-adapter.ts`.
Tests: navigation policy unit tests and browser tests with separate loopback destinations and
server-hit counters. Tests cover allowed/denied links, forms, script navigation, same-origin paths,
frames (including already cross-site frames), initial and chained redirects, explicit navigation,
popups and cross-origin scripts. Forbidden destinations receive zero requests; legacy replay
success/business/recovery/failure/intervention tests remain green.

References: [Playwright context routing](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)
and [Chromium Fetch request interception](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/).

## Revisit conditions

Revalidate the server-counter matrix on browser/Playwright upgrades. Revisit for other engines,
multiple pages, service workers, downloads, speculative navigation, adversarial application content,
parameter-level policy or broader outbound-data controls. No LLM discovery, provider, proxy service,
operator UI or production evidence redaction was added.
