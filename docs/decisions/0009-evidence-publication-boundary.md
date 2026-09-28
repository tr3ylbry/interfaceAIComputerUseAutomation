# ADR-009: Fail-closed structured evidence publication

**Status:** Accepted and implemented.

## Context and invariant

The genuine discovery bundle was accepted, but its public replay projection and review manifest
were assembled manually after raw persistence. The existing trace writer selected fields but did
not authorize publication. A new runtime/provider field must never become public by accident.

“Only evidence that has passed the publication boundary may be written under committed/public
evidence paths.” This is an application persistence invariant, not an operating-system or Git
permission boundary against a local operator.

## Options and decision

1. Continue manual copying and review: preserves flexibility but repeats the same leak risk.
2. Recursively redact arbitrary raw objects: unknown fields and encodings can escape, while
   replacing values can destroy artifact integrity or mislabel screenshots as sanitized.
3. Construct fixed public records and reject unsafe candidates before writing: chosen.

Keep raw/public types in `src/evidence/`, not CapabilityArtifact or ReplayResult. Raw records and
screenshots remain private under ignored runtime storage. Existing discovery/adapter raw writers
reject destinations in the repository's public evidence tree, including existing symlink aliases.
Temporary/private destinations outside the evidence tree remain supported for tests/library callers.

Discovery and replay projections select fields explicitly. Strict nested schemas reject unknown
public fields. A separate pinned publication profile for generated web artifacts is checked in
addition to the unchanged capability schema/reference validator. It supports the demonstrated
linear artifact, not coordinates, desktop artifacts, object literals or learned branches.
The accepted historical success manifest has an explicit compatibility schema; it is not a
general provider-payload or failure-manifest schema.

Before any public directory is created, validate every file, the private sensitive-value inventory,
and the generated manifest. Reject known values, credential fields/material, common local paths,
unapproved files and inline binary data. Match sensitive scalar values exactly and at token
boundaries, not as short substrings inside UUIDs/hashes. Scan decoded URL content once; normal HTTP
URL paths remain valid. Errors report fixed codes, never offending values or validation payloads.

Preserve accepted artifact bytes. Require canonical two-space JSON with optional final newline;
reject duplicate-key/alternate-encoding candidates instead of checking parsed safe data but writing
different unsafe bytes. The public writer never overwrites an existing run, rejects symlinked
destinations, snapshots its request before asynchronous work, and writes the manifest last.

## Binary policy and integrity

No automatic binary publication, approval boolean override, OCR or screenshot redaction. Screenshots
and traces remain withheld; any future binary publication needs a separate explicit sanitized/manual
review decision and supported path. Manifests may record their basenames, hashes and byte counts.

New manifests contain reviewed/generated timestamps, validated status, public byte hashes and
withheld-source metadata. Public-file integrity is checked without opening private sources. Source
hashes/review assertions are caller-supplied review evidence, not authenticated attestations.
The accepted four-file bundle is validated read-only and remains byte-identical.

## Tradeoffs and limits

Schemas deliberately duplicate the publication field boundary so core/provider evolution cannot
silently expand it. Unsupported formats require review instead of automatic migration. A complete
private inventory is caller responsibility; `inventoryFromRaw` helps collect input, formatted output
and transformed/replay values. It currently supports string/number values and rejects unsupported
sensitive primitives. Content detection is bounded, not general PII discovery or encoded-secret DLP.
Known-value collisions can conservatively reject otherwise harmless content. HTTP URL paths can be
ambiguous with filesystem text; only documented common local-path forms are recognized automatically.

The boundary does not redact raw storage or model inputs, enforce retention, prevent manual Git
force-add/copy operations, authenticate review/approval, or defend against concurrent hostile local
filesystem changes. An I/O failure can leave an incomplete directory of already-validated files;
without its final manifest it is not a completed publication. No automatic destructive cleanup.

## Evidence and revisit conditions

`tests/evidence-publication.test.ts` covers safe projections, rejection paths, private destination
guards, no-write-on-rejection, duplicate keys, integrity, no-overwrite and the genuine bundle.
The existing browser/model-free replay suite remains unchanged and green. No live API run occurred.
Revisit for a demonstrated new artifact branch, new public format, reviewed binary need, real PII,
signed approvals, retention requirements or a less-trusted publication operator.
