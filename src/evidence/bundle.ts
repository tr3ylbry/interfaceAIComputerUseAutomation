import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { PublicationError, validatePublicEvidence, type EvidenceCandidate, type SensitiveInventory, type PublicEvidence } from "./publication.js";
import { PublicationManifestSchema, ReviewedManifestSchema, PublicTraceSchema, PublicReplaySchema, sourceDigest } from "./schemas.js";
import { CapabilityArtifactSchema } from "../contracts/index.js";
import { PublicHandoffSchema } from "./handoff.js";

const requireMatch = (condition: unknown): void => { if (!condition) throw new PublicationError("inconsistent_bundle"); };
const RequestSchema = z.strictObject({
  runId: z.uuid(), reviewedAt: z.string().datetime(),
  files: z.array(z.strictObject({ filename: z.string(), utf8: z.string() })).min(1),
  sources: z.array(sourceDigest.extend({ withheld: z.boolean() })),
});

/** Validate files AND their public integrity relationships. No runtime/private files are opened. */
export function validateBundle(candidates: EvidenceCandidate[], inventory: SensitiveInventory): PublicEvidence[] {
  const files = candidates.map(candidate => validatePublicEvidence(candidate, inventory));
  requireMatch(files.length > 0 && new Set(files.map(file => file.filename)).size === files.length);
  const get = (name: string) => files.find(file => file.filename === name);
  const legacy = get("review-manifest.json");
  const publication = get("publication-manifest.json");
  requireMatch(!(legacy && publication));
  const artifactFile = get("capability.json");
  const artifact = artifactFile ? CapabilityArtifactSchema.parse(JSON.parse(artifactFile.utf8)) : undefined;
  const traceFile = get("tool-trace.sanitized.json");
  const trace = traceFile ? PublicTraceSchema.parse(JSON.parse(traceFile.utf8)) : undefined;
  const replayFile = get("replay.sanitized.json");
  const replay = replayFile ? PublicReplaySchema.parse(JSON.parse(replayFile.utf8)) : undefined;
  const handoffFile = get("handoff.sanitized.json");
  const handoff = handoffFile ? PublicHandoffSchema.parse(JSON.parse(handoffFile.utf8)) : undefined;
  if (artifact && trace) requireMatch(artifact.provenance.discoveryRunId === trace.runId);
  if (artifact && replay) {
    requireMatch(artifact.capability.id === replay.capabilityId && artifact.capability.version === replay.capabilityVersion);
    for (const event of replay.events) if (event.type === "target_resolved") {
      requireMatch(artifact.targets.find(target => target.id === event.targetId)?.strategies[event.strategyIndex]);
    }
  }
  if (replay) requireMatch(Date.parse(replay.finishedAt) - Date.parse(replay.startedAt) === replay.durationMs);
  if (legacy) {
    const review = ReviewedManifestSchema.parse(JSON.parse(legacy.utf8));
    requireMatch(new Set(review.originalEvidence.map(source => source.file)).size === review.originalEvidence.length);
    requireMatch(isDeepStrictEqual([...review.publicationReview.publicFiles].sort(), files.map(file => file.filename).sort()));
    requireMatch(trace && replay && artifact && review.runId === trace.runId && review.runId === artifact.provenance.discoveryRunId);
    requireMatch(review.replay.runId === replay!.runId && review.replay.status === replay!.status
      && review.replay.durationMs === replay!.durationMs && review.replay.modelCalls === replay!.modelCallsDuringReplay);
    requireMatch(review.modelTurns === trace!.turns.length && isDeepStrictEqual(review.toolSequence, trace!.turns.map(turn => turn.tool)));
    requireMatch(Date.parse(review.finishedAt) - Date.parse(review.startedAt) === review.coordinatorDurationMs);
    for (const name of ["capability.json", "tool-trace.sanitized.json"]) {
      const digest = review.originalEvidence.find(entry => entry.file === name);
      requireMatch(digest && digest.bytes === get(name)!.bytes && digest.sha256 === get(name)!.sha256);
    }
  }
  if (publication) {
    const manifest = PublicationManifestSchema.parse(JSON.parse(publication.utf8));
    requireMatch(new Set(manifest.sources.map(source => source.file)).size === manifest.sources.length);
    requireMatch(isDeepStrictEqual(manifest.publicFiles.map(file => file.file).sort(), files.filter(file => file !== publication).map(file => file.filename).sort()));
    for (const digest of manifest.publicFiles) requireMatch(digest.bytes === get(digest.file)?.bytes && digest.sha256 === get(digest.file)?.sha256);
    if (trace) requireMatch(trace.runId === manifest.runId);
    if (handoff) requireMatch(handoff.runId === manifest.runId);
    if (artifact) requireMatch(artifact.provenance.discoveryRunId === manifest.runId);
    for (const source of manifest.sources) {
      if (!source.withheld) requireMatch(source.bytes === get(source.file)?.bytes && source.sha256 === get(source.file)?.sha256);
    }
  }
  return files;
}

export async function validatePublicDirectory(directory: string, inventory: SensitiveInventory): Promise<PublicEvidence[]> {
  if (!(await lstat(directory)).isDirectory()) throw new PublicationError("invalid_directory");
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates: EvidenceCandidate[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) throw new PublicationError("non_regular_file");
    const info = await lstat(join(directory, entry.name));
    if (!info.isFile() || info.size > 2_000_000) throw new PublicationError("invalid_json_size");
    candidates.push({ filename: entry.name, utf8: await readFile(join(directory, entry.name), "utf8") });
  }
  const files = validateBundle(candidates, inventory);
  requireMatch(files.some(file => ["review-manifest.json", "publication-manifest.json"].includes(file.filename)));
  return files;
}

export type PublicationRequest = z.infer<typeof RequestSchema>;

/** The only public writer: validate the COMPLETE bundle before creating a public directory.
 * Existing bundles are never overwritten. The manifest is written last as a completion marker.
 */
export async function publishEvidenceBundle(repositoryRoot: string, candidate: PublicationRequest, inventory: SensitiveInventory): Promise<string> {
  const parsed = RequestSchema.safeParse(candidate);
  if (!parsed.success) throw new PublicationError("invalid_publication_request");
  const request = parsed.data; // Snapshot before the first await; callers cannot change the destination.
  if (request.files.some(file => /manifest/.test(file.filename))) throw new PublicationError("reserved_manifest");
  const checked = validateBundle(request.files, inventory);
  const manifest: EvidenceCandidate = { filename: "publication-manifest.json", utf8: JSON.stringify({
    kind: "evidence_publication", version: 1, runId: request.runId, generatedAt: new Date().toISOString(), reviewedAt: request.reviewedAt,
    reviewStatus: "reviewed", publicationStatus: "validated", binaryPolicy: "withheld_manual_review_required",
    publicFiles: checked.map(file => ({ file: file.filename, bytes: file.bytes, sha256: file.sha256 })),
    // Reject unknown review/source fields instead of silently dropping ambiguous publication intent.
    sources: request.sources,
  }, null, 2) };
  const files = validateBundle([...request.files, manifest], inventory);
  const root = resolve(repositoryRoot);
  if (!(await lstat(root)).isDirectory()) throw new PublicationError("invalid_repository_root");
  let parent = root;
  for (const segment of ["evidence", "discovery"]) {
    parent = join(parent, segment);
    try { await mkdir(parent); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new PublicationError("publication_io"); }
    if (!(await lstat(parent)).isDirectory()) throw new PublicationError("non_regular_directory");
  }
  const directory = join(parent, request.runId);
  try {
    await mkdir(directory); // Exclusive: a reviewed historical run cannot be replaced.
    for (const file of files) await writeFile(join(directory, file.filename), file.utf8, { flag: "wx", mode: 0o600 });
  } catch { throw new PublicationError("publication_io_or_existing_bundle"); }
  return directory;
}
