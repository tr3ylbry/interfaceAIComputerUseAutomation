import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { CapabilityArtifactSchema, type ReplayEvent, type ReplayResult } from "../contracts/index.js";
import type { DiscoveryRun } from "../discovery/contracts.js";
import { validateReferences } from "../replay/validation.js";
import { PublicHandoffSchema, handoffFields, type HandoffPublicationInput } from "./handoff.js";
import { InventorySchema, PublicCapabilitySchema, PublicReplaySchema, PublicTraceSchema,
  PublicationManifestSchema, ReviewedManifestSchema, publicFilename } from "./schemas.js";

export type SensitiveInventory = z.infer<typeof InventorySchema>;
export type RawEvidence = { classification: "raw"; discovery: DiscoveryRun; replay: ReplayResult; invocationInputs: Record<string, unknown> };
export type EvidenceCandidate = { filename: string; utf8: string };
export type PublicEvidence = Readonly<EvidenceCandidate & { classification: "public"; bytes: number; sha256: string }>;

export class PublicationError extends Error {
  constructor(readonly code: string) { super(`Evidence publication rejected: ${code}`); }
}
function reject(code: string): never { throw new PublicationError(code); }
const credentialField = /^(?:authorization|proxyauthorization|cookie|cookies|setcookie|session|sessionid|sessiontoken|apikey|openaiapikey|accesstoken|refreshtoken|idtoken|token|password|secret|clientsecret|providersecret)$/i;
const credentialText = /(?:\b(?:authorization|proxy-authorization|set-cookie|cookie|session[_-]?(?:id|token)|api[_-]?key|openai_api_key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]|\bBearer\s+\S+|\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i;
const localPath = /(?:file:\/\/|(?:^|[\s"'=(:])(?:[a-z]:[\\/]|\\\\)|\/(?:Users|home|private|tmp|var|etc|opt|Volumes|mnt|root|Applications|Library|usr)\/)/i;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Inspection, not recursive redaction: reject the entire candidate; never rewrite a value. */
function checkContent(value: unknown, inventory: SensitiveInventory, depth = 0): void {
  if (depth > 60) reject("structure_limit");
  if (typeof value === "string") {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch { /* Literal CSS/prose may contain %. */ }
    for (const text of new Set([value, decoded])) {
      if (inventory.secretValues.some(secret => text.includes(secret)) || credentialText.test(text)) reject("credential_material");
      if (inventory.sensitiveValues.some(sensitive => text === String(sensitive)
        || new RegExp(`(?<![\\p{L}\\p{N}_-])${escape(String(sensitive))}(?![\\p{L}\\p{N}_-])`, "u").test(text))) reject("sensitive_value");
      // HTTP URL paths are not machine filesystem paths. Credentials in URLs still fail.
      const withoutUrls = text.replace(/https?:\/\/[^\s<>"']+/gi, url => {
        try { const parsed = new URL(url); if (parsed.username || parsed.password) reject("credential_material"); }
        catch (error) { if (error instanceof PublicationError) throw error; reject("invalid_url"); }
        return "";
      });
      if (localPath.test(withoutUrls)) reject("local_path");
      if (/\bdata:[^\s]*;base64,/i.test(text)) reject("binary_not_supported");
    }
  } else if (typeof value === "number") {
    if (inventory.sensitiveValues.some(sensitive => String(sensitive) === String(value))) reject("sensitive_value");
  } else if (Array.isArray(value)) {
    value.forEach(item => checkContent(item, inventory, depth + 1));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (credentialField.test(key.replace(/[_-]/g, ""))) reject("credential_field");
      checkContent(key, inventory, depth + 1);
      checkContent(child, inventory, depth + 1);
    }
  }
}

const schemas: Record<z.infer<typeof publicFilename>, z.ZodType> = {
  "handoff.sanitized.json": PublicHandoffSchema,
  "capability.json": PublicCapabilitySchema,
  "tool-trace.sanitized.json": PublicTraceSchema,
  "replay.sanitized.json": PublicReplaySchema,
  "review-manifest.json": ReviewedManifestSchema,
  "publication-manifest.json": PublicationManifestSchema,
};

/** Returns immutable, original JSON bytes only after all gates pass. No error echoes content. */
export function validatePublicEvidence(candidate: EvidenceCandidate, suppliedInventory: SensitiveInventory): PublicEvidence {
  const inventory = InventorySchema.safeParse(suppliedInventory);
  if (!inventory.success) reject("inventory_required");
  const filename = publicFilename.safeParse(candidate.filename);
  if (!filename.success) reject("unapproved_file_or_binary");
  if (typeof candidate.utf8 !== "string" || Buffer.byteLength(candidate.utf8) > 2_000_000) reject("invalid_json_size");
  let data: unknown;
  try { data = JSON.parse(candidate.utf8); } catch { reject("invalid_json"); }
  // Preserve accepted generated bytes, but disallow hidden duplicate keys/alternate encodings.
  const canonical = JSON.stringify(data, null, 2);
  if (candidate.utf8 !== canonical && candidate.utf8 !== canonical + "\n") reject("noncanonical_json");
  checkContent(data, inventory.data);
  const parsed = schemas[filename.data].safeParse(data);
  if (!parsed.success || !isDeepStrictEqual(parsed.data, data)) reject("unapproved_schema");
  if (filename.data === "capability.json") {
    const artifact = CapabilityArtifactSchema.safeParse(data);
    if (!artifact.success) reject("invalid_capability");
    try { validateReferences(artifact.data); } catch { reject("invalid_capability_references"); }
  }
  return Object.freeze({ classification: "public", filename: filename.data, utf8: candidate.utf8,
    bytes: Buffer.byteLength(candidate.utf8), sha256: createHash("sha256").update(candidate.utf8).digest("hex") });
}

export function discoveryTrace(run: DiscoveryRun): EvidenceCandidate {
  // Explicit construction: new raw fields, arguments, goal and screenshots cannot propagate.
  return { filename: "tool-trace.sanitized.json", utf8: JSON.stringify({
    runId: run.id, model: { provider: run.model.provider, model: run.model.model }, redacted: true, status: run.status,
    turns: run.decisions.map((entry, index) => ({ turn: index + 1, tool: entry.decision.kind, observationId: entry.observationId })),
    actions: run.actions.map(entry => ({ index: entry.index, tool: entry.decision.kind, policy: entry.policy.decision, executed: entry.executed })),
  }, null, 2) };
}

function projectEvent(event: ReplayEvent): unknown {
  const base = { type: event.type, at: event.at };
  switch (event.type) {
    case "step_started": case "step_completed": return { ...base, stepId: event.stepId };
    case "target_resolved": return { ...base, stepId: event.stepId, targetId: event.targetId, strategyIndex: event.strategyIndex };
    case "policy_decision": return { ...base, stepId: event.stepId, action: event.action, decision: event.decision }; // Free-form reason withheld.
    case "checkpoint_evaluated": return { ...base, stepId: event.stepId, matched: event.matched }; // Message withheld.
    case "human_control": return { ...base, interventionId: event.interventionId, phase: event.phase };
    case "recoverable_condition": return { ...base, condition: {
      classification: event.condition.classification, code: event.condition.code, stepId: event.condition.stepId,
      attempt: event.condition.attempt, maxAttempts: event.condition.maxAttempts, recovered: event.condition.recovered,
    } };
    default: return reject("unknown_event");
  }
}

export function replayProjection(result: ReplayResult, modelCallsDuringReplay: number): EvidenceCandidate {
  return { filename: "replay.sanitized.json", utf8: JSON.stringify({
    kind: "reviewed_value_free_replay_projection", redacted: true, source: "replay.raw.json",
    runId: result.runId, capabilityId: result.capabilityId, capabilityVersion: result.capabilityVersion,
    startedAt: result.startedAt, finishedAt: result.finishedAt, durationMs: result.durationMs, status: result.status,
    modelCallsDuringReplay, invocationAndOutputValuesOmitted: true, events: result.events.map(projectEvent),
  }, null, 2) };
}

export function handoffProjection(input: HandoffPublicationInput): EvidenceCandidate {
  return handoffFields(input, projectEvent);
}

/** Keep this inventory private. Include raw/formatted and transformed values, not just inputs. */
export function inventoryFromRaw(raw: RawEvidence, secretValues: string[]): SensitiveInventory {
  const values: Array<string | number> = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string" && value.length || typeof value === "number" && Number.isFinite(value)) values.push(value as string | number);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
    else if (value !== undefined && value !== null && value !== "") reject("unsupported_sensitive_value");
  };
  raw.discovery.request.inputs.forEach(input => collect(input.discoveryValue));
  Object.values(raw.discovery.outputs).forEach(output => { collect(output.value); collect(output.rawValue); });
  Object.values(raw.invocationInputs).forEach(collect);
  if (raw.replay.status === "success") collect(raw.replay.outputs);
  if (raw.replay.status === "business_outcome") collect(raw.replay.data);
  return { sensitiveValues: [...new Set(values)], secretValues: [...secretValues] };
}
