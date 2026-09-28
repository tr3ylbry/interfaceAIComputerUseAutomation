import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoveryTrace, inventoryFromRaw, replayProjection, validatePublicEvidence,
  type EvidenceCandidate, type RawEvidence, type SensitiveInventory } from "../src/evidence/publication.js";
import { publishEvidenceBundle, validateBundle, validatePublicDirectory } from "../src/evidence/bundle.js";
import { assertPrivateEvidenceDestination } from "../src/evidence/private-destination.js";
import { writeDiscoveryEvidence } from "../src/discovery/evidence.js";
import { memberSavingsDiscoveryRequest } from "../src/vertical-slice/discovery-request.js";
import { PublicTraceSchema } from "../src/evidence/schemas.js";
import type { z } from "zod";

const runId = "ba6edb58-d1c0-4321-97e8-4dd1ea212345";
const time = "2026-09-28T17:48:06.000Z";
const input = "SENSITIVE_INPUT_SENTINEL_4321";
const output = "SENSITIVE_OUTPUT_SENTINEL_8765";
const secret = "FAKE_API_SECRET_FIXTURE_DO_NOT_USE_72a9";
const inventory: SensitiveInventory = { sensitiveValues: [input, output, 9876.54, "4321", "12345"], secretValues: [secret] };
const acceptedDirectory = resolve("evidence/discovery/aafa19ac-42a4-4550-b25b-7d57b4589c66");
const acceptedInventory = { sensitiveValues: ["12345", "67890", 4321.09, 8765.43, "$4,321.09", "$8,765.43"], secretValues: [] };
const roots: string[] = [];
async function temporaryRoot() { const root = await mkdtemp(join(tmpdir(), "publication-test-")); roots.push(root); return root; }
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

function raw(): RawEvidence {
  const request = memberSavingsDiscoveryRequest("http://127.0.0.1:3000");
  request.inputs[0]!.discoveryValue = input;
  return { classification: "raw", invocationInputs: { member_id: "SECOND_INPUT_SENTINEL" }, discovery: {
    id: runId, request, model: { provider: "scripted-test", model: "no-network" }, startedAt: time, finishedAt: time,
    redacted: false, status: "success", observations: [], successChecks: [],
    decisions: [{ observationId: "observation-1", decision: { kind: "ui_fill", targetRef: "control-1", value: input } }],
    actions: [{ index: 0, beforeId: "observation-1", afterId: "observation-2", executed: true,
      decision: { kind: "ui_fill", targetRef: "control-1", value: input }, policy: { risk: "reversible_write", decision: "allow", reason: secret } }],
    outputs: { savings_balance: { value: 9876.54, rawValue: output, actionIndex: 0, extraction: "text",
      target: { id: "target-0", description: "Savings", strategies: [{ kind: "text", text: "Savings", exact: true }] } } },
  }, replay: { runId: "replay-1", capabilityId: "test-capability", capabilityVersion: "0.1.0", startedAt: time, finishedAt: time, durationMs: 0,
    status: "success", outputs: { savings_balance: 8765.43 }, evidence: [{ kind: "screenshot", path: "/Users/private/raw.png", capturedAt: time, redacted: false }],
    events: [
      { type: "step_started", at: time, stepId: "step-0" },
      { type: "policy_decision", at: time, stepId: "step-0", action: "fill", decision: "allow", reason: secret },
      { type: "target_resolved", at: time, stepId: "step-0", targetId: "target-0", strategyIndex: 0 },
      { type: "checkpoint_evaluated", at: time, stepId: "step-0", matched: true, message: output },
      { type: "recoverable_condition", at: time, condition: { classification: "recoverable", code: "transient_load", stepId: "step-0",
        attempt: 1, maxAttempts: 2, recovered: true, message: secret } },
      { type: "human_control", at: time, interventionId: "intervention-1", phase: "returned" },
      { type: "step_completed", at: time, stepId: "step-0" },
    ] } };
}
type Trace = z.infer<typeof PublicTraceSchema>;
function alteredTrace(change: (value: Trace) => void): EvidenceCandidate {
  const candidate = discoveryTrace(raw().discovery);
  const value = JSON.parse(candidate.utf8);
  change(value);
  return { filename: candidate.filename, utf8: JSON.stringify(value, null, 2) };
}
async function artifactWithDescription(description: string): Promise<EvidenceCandidate> {
  const data = JSON.parse(await readFile(join(acceptedDirectory, "capability.json"), "utf8"));
  data.capability.description = description;
  return { filename: "capability.json", utf8: JSON.stringify(data, null, 2) };
}

describe("fail-closed public evidence", () => {
  it("publishes a safe discovery trace and manifest only after validation", async () => {
    const root = await temporaryRoot();
    const trace = discoveryTrace(raw().discovery);
    const directory = await publishEvidenceBundle(root, { runId, reviewedAt: time, files: [trace], sources: [] }, inventory);
    expect(await readdir(directory)).toEqual(["publication-manifest.json", "tool-trace.sanitized.json"]);
    expect(await readFile(join(directory, trace.filename), "utf8")).toBe(trace.utf8);
    const files = await validatePublicDirectory(directory, inventory);
    expect(files).toHaveLength(2);
    expect(files.every(file => file.classification === "public")).toBe(true);
  });

  it("publishes an allowlisted replay projection without output/evidence/free-text payloads", async () => {
    const root = await temporaryRoot();
    const candidate = replayProjection(raw().replay, 0);
    const data = JSON.parse(candidate.utf8);
    expect(data).not.toHaveProperty("outputs");
    expect(data).not.toHaveProperty("evidence");
    expect(data.events).toHaveLength(7);
    expect(data.events[1]).not.toHaveProperty("reason");
    expect(data.events[3]).not.toHaveProperty("message");
    expect(data.events[4].condition).not.toHaveProperty("message");
    const directory = await publishEvidenceBundle(root, { runId, reviewedAt: time, files: [candidate], sources: [] }, inventory);
    expect(await validatePublicDirectory(directory, inventory)).toHaveLength(2);
  });

  it.each([input, output, "4321", "12345"])("rejects a known sensitive value in an allowed field: %s", value => {
    expect(() => validatePublicEvidence(alteredTrace(data => { data.model.model = value; }), inventory)).toThrow("sensitive_value");
  });
  it("rejects a known numeric output even in a plausible metadata field", () => {
    expect(() => validatePublicEvidence(alteredTrace(data => { data.actions[0]!.index = 9876.54; }), inventory)).toThrow("sensitive_value");
  });
  it("rejects a sensitive value embedded in prose or a URL query", async () => {
    for (const text of [`Value: ${input}`, `https://example.test/find?member=${input}`]) {
      const candidate = await artifactWithDescription(text);
      expect(() => validatePublicEvidence(candidate, inventory)).toThrow("sensitive_value");
    }
  });

  it.each([
    secret, "sk-proj-FAKE_FIXTURE_NOT_A_REAL_KEY_123456789", "Authorization: Basic FAKE_FIXTURE",
    "Bearer FAKE_BEARER_FIXTURE_123", "Cookie: session=FAKE_COOKIE_FIXTURE", "session_token=FAKE_SESSION_FIXTURE",
    "OPENAI_API_KEY=FAKE_KEY_FIXTURE", "https://user:FAKE_PASSWORD@example.test/path",
  ])("rejects credential text without exposing it in the error", async value => {
    const candidate = await artifactWithDescription(value);
    try { validatePublicEvidence(candidate, inventory); expect.fail("Unsafe content was accepted"); }
    catch (error) { expect(String(error)).toContain("credential_material"); expect(String(error)).not.toContain(value); }
  });
  it.each(["Authorization", "cookies", "session_token", "apiKey", "OPENAI_API_KEY", "providerSecret", "refreshToken"])("rejects credential field %s", key => {
    expect(() => validatePublicEvidence(alteredTrace(data => { Object.assign(data.model, { [key]: "FAKE_FIXTURE" }); }), inventory)).toThrow("credential_field");
  });
  it.each(["/Users/test/private.json", "/home/test/private.json", "C:\\Users\\test\\private.json", "D:/private/file.json", "file:///tmp/private.json", "\\\\machine\\share\\private.json"])("rejects local path %s", async path => {
    const candidate = await artifactWithDescription(path);
    expect(() => validatePublicEvidence(candidate, inventory)).toThrow("local_path");
  });
  it.each(["/member-search", "/members/*", "https://example.test/home/help?tab=accounts", "https://example.test/Users/help"])("permits ordinary route/URL paths: %s", async path => {
    const candidate = await artifactWithDescription(path);
    expect(validatePublicEvidence(candidate, inventory).classification).toBe("public");
  });
  it.each([
    (data: Trace) => { Object.assign(data, { providerPayload: {} }); },
    (data: Trace) => { Object.assign(data.model, { futureField: "unexpected" }); },
    (data: Trace) => { Object.assign(data.actions[0]!, { arguments: { value: "unexpected" } }); },
  ])("rejects unknown public fields at every nesting level", change => {
    expect(() => validatePublicEvidence(alteredTrace(change), inventory)).toThrow("unapproved_schema");
  });
  it("new raw fields are deliberately omitted, not copied by projections", () => {
    const source = raw();
    const expected = discoveryTrace(source.discovery);
    Object.assign(source.discovery, { futureProviderPayload: { private: secret } });
    Object.assign(source.discovery.model, { futureProviderField: secret });
    expect(discoveryTrace(source.discovery)).toEqual(expected);
  });
  it.each(["observation-0.png", "trace.zip", "../capability.json", "raw.json"])("refuses unapproved files/binaries: %s", filename => {
    expect(() => validatePublicEvidence({ filename, utf8: "arbitrary bytes" }, inventory)).toThrow("unapproved_file_or_binary");
  });
  it("rejects a binary payload disguised as JSON and embedded images", async () => {
    expect(() => validatePublicEvidence({ filename: "capability.json", utf8: "\u0089PNG" }, inventory)).toThrow("invalid_json");
    const candidate = await artifactWithDescription("data:image/png;base64,FAKE_IMAGE_BYTES");
    expect(() => validatePublicEvidence(candidate, inventory)).toThrow("binary_not_supported");
  });
  it("does not false-positive numeric substrings in unrelated UUID metadata", () => {
    expect(validatePublicEvidence(discoveryTrace(raw().discovery), inventory).classification).toBe("public");
  });
  it("refuses hidden duplicate keys rather than checking one value and publishing another", () => {
    const candidate = discoveryTrace(raw().discovery);
    candidate.utf8 = candidate.utf8.replace('"model": {', `"hidden": "${secret}", "hidden": null, "model": {`);
    expect(() => validatePublicEvidence(candidate, inventory)).toThrow("noncanonical_json");
  });
  it("requires an explicit valid private inventory", () => {
    expect(() => validatePublicEvidence(discoveryTrace(raw().discovery), undefined as unknown as SensitiveInventory)).toThrow("inventory_required");
  });
  it("derives the inventory from discovery and replay values without persisting it", () => {
    const result = inventoryFromRaw(raw(), [secret]);
    expect(result.sensitiveValues).toEqual(expect.arrayContaining([input, output, 9876.54, "SECOND_INPUT_SENTINEL", 8765.43]));
    expect(result.secretValues).toEqual([secret]);
  });
  it("rejects new replay event types rather than losing their meaning", () => {
    const source = raw();
    Object.assign(source.replay.events[0]!, { type: "new_runtime_event" });
    expect(() => replayProjection(source.replay, 0)).toThrow("unknown_event");
  });
  it("validates the complete accepted genuine bundle without rewriting any byte", async () => {
    const names = await readdir(acceptedDirectory);
    const before = await Promise.all(names.map(name => readFile(join(acceptedDirectory, name))));
    const files = await validatePublicDirectory(acceptedDirectory, acceptedInventory);
    expect(files).toHaveLength(4);
    expect(files.find(file => file.filename === "capability.json")!.sha256).toBe("30a431ac3a45729d1cf8d887ea1c8057254579da072f1892bd6e3b155b03d6df");
    expect(await Promise.all(names.map(name => readFile(join(acceptedDirectory, name))))).toEqual(before);
  });
  it("rejects inconsistent recorded hashes even when every file is individually safe", async () => {
    const candidates = await Promise.all((await readdir(acceptedDirectory)).map(async filename => ({ filename, utf8: await readFile(join(acceptedDirectory, filename), "utf8") })));
    const capability = candidates.find(file => file.filename === "capability.json")!;
    capability.utf8 = capability.utf8.replace("Member savings inquiry", "Changed safe title");
    expect(() => validateBundle(candidates, acceptedInventory)).toThrow("inconsistent_bundle");
  });
  it("writes nothing when any candidate or source metadata is unsafe", async () => {
    const root = await temporaryRoot();
    const request = { runId, reviewedAt: time, files: [discoveryTrace(raw().discovery), alteredTrace(data => { data.model.model = input; })], sources: [] };
    await expect(publishEvidenceBundle(root, request, inventory)).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
    request.files = [discoveryTrace(raw().discovery)];
    Object.assign(request, { sources: [{ file: "/home/private.json", bytes: 0, sha256: "a".repeat(64), withheld: true }] });
    await expect(publishEvidenceBundle(root, request, inventory)).rejects.toThrow("invalid_publication_request");
    expect(await readdir(root)).toEqual([]);
  });
  it("records withheld screenshot hashes without copying binary contents", async () => {
    const root = await temporaryRoot();
    const directory = await publishEvidenceBundle(root, { runId, reviewedAt: time, files: [discoveryTrace(raw().discovery)],
      sources: [{ file: "observation-0.png", bytes: 100, sha256: "a".repeat(64), withheld: true }] }, inventory);
    expect(await readdir(directory)).not.toContain("observation-0.png");
    expect(await validatePublicDirectory(directory, inventory)).toHaveLength(2);
  });
  it("never overwrites an existing public bundle", async () => {
    const root = await temporaryRoot();
    const request = { runId, reviewedAt: time, files: [discoveryTrace(raw().discovery)], sources: [] };
    const directory = await publishEvidenceBundle(root, request, inventory);
    const before = await readFile(join(directory, "publication-manifest.json"));
    await expect(publishEvidenceBundle(root, request, inventory)).rejects.toThrow("existing_bundle");
    expect(await readFile(join(directory, "publication-manifest.json"))).toEqual(before);
  });
  it("rejects symlinked public destinations", async () => {
    const root = await temporaryRoot();
    const elsewhere = await temporaryRoot();
    await symlink(elsewhere, join(root, "evidence"));
    await expect(publishEvidenceBundle(root, { runId, reviewedAt: time, files: [discoveryTrace(raw().discovery)], sources: [] }, inventory)).rejects.toThrow("non_regular_directory");
    expect(await readdir(elsewhere)).toEqual([]);
  });
  it("rejects extra screenshots and symlinks in a public bundle", async () => {
    const root = await temporaryRoot();
    const directory = await publishEvidenceBundle(root, { runId, reviewedAt: time, files: [discoveryTrace(raw().discovery)], sources: [] }, inventory);
    await writeFile(join(directory, "observation-0.png"), "FAKE_BINARY_FIXTURE");
    await expect(validatePublicDirectory(directory, inventory)).rejects.toThrow("unapproved_file_or_binary");
    await rm(join(directory, "observation-0.png"));
    await symlink(join(directory, "publication-manifest.json"), join(directory, "extra.json"));
    await expect(validatePublicDirectory(directory, inventory)).rejects.toThrow("non_regular_file");
  });
  it("keeps raw persistence private, including symlink aliases", async () => {
    const root = await temporaryRoot();
    const publicDirectory = join(root, "evidence/discovery");
    await mkdir(publicDirectory, { recursive: true });
    await assertPrivateEvidenceDestination(join(root, "evidence/runtime/new-run"), root);
    await expect(assertPrivateEvidenceDestination(join(publicDirectory, "new-run"), root)).rejects.toThrow("Raw evidence");
    await symlink(publicDirectory, join(root, "alias"));
    await expect(assertPrivateEvidenceDestination(join(root, "alias/new-run"), root)).rejects.toThrow("Raw evidence");
    const external = await temporaryRoot();
    await symlink(external, join(publicDirectory, "external"));
    await expect(assertPrivateEvidenceDestination(join(publicDirectory, "external/new-run"), root)).rejects.toThrow("Raw evidence");
    await expect(writeDiscoveryEvidence(raw().discovery, resolve("evidence/discovery/never-write-this"))).rejects.toThrow("Raw evidence");
  });
});
