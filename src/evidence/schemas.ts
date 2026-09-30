import { z } from "zod";

// Publication schemas are deliberately separate from evolving runtime/provider records.
const text = z.string();
const id = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const count = z.number().int().nonnegative();
const at = z.string().datetime();
const decision = z.enum(["allow", "block", "require_human"]);
const risk = z.enum(["read_only", "reversible_write", "irreversible_write"]);
const status = z.enum(["success", "failure", "intervention_required", "business_outcome"]);
const tool = z.enum(["ui_fill", "ui_click", "ui_select", "ui_navigate", "ui_read", "finish_discovery", "request_human"]);
const action = z.enum(["open", "navigate", "click", "fill", "select", "wait", "extract"]);
const valueType = z.enum(["string", "integer", "number", "boolean", "date", "currency"]);
export const publicFilename = z.enum(["capability.json", "tool-trace.sanitized.json", "replay.sanitized.json", "handoff.sanitized.json", "review-manifest.json", "publication-manifest.json"]);
export const sourceDigest = z.strictObject({
  file: z.string().regex(/^(?:capability\.json|handoff\.raw\.json|discovery-run\.raw\.json|manifest\.json|replay\.raw\.json|tool-trace\.sanitized\.json|observation-\d+\.png)$/),
  bytes: count, sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const InventorySchema = z.strictObject({
  sensitiveValues: z.array(z.union([z.string().min(1), z.number().finite()])),
  secretValues: z.array(z.string().min(1)),
});

export const PublicTraceSchema = z.strictObject({
  runId: id, model: z.strictObject({ provider: id, model: id }), redacted: z.literal(true),
  status: z.enum(["success", "failure", "intervention_required"]),
  turns: z.array(z.strictObject({ turn: count, tool, observationId: id })),
  actions: z.array(z.strictObject({ index: count, tool, policy: decision, executed: z.boolean() })),
});
const eventBase = { at, stepId: id.optional() };
export const PublicEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("step_started"), at, stepId: id }),
  z.strictObject({ type: z.literal("step_completed"), at, stepId: id }),
  z.strictObject({ type: z.literal("target_resolved"), at, stepId: id, targetId: id, strategyIndex: count }),
  z.strictObject({ type: z.literal("policy_decision"), ...eventBase, action, decision, reason: text.optional() }),
  z.strictObject({ type: z.literal("checkpoint_evaluated"), ...eventBase, matched: z.boolean() }),
  z.strictObject({ type: z.literal("recoverable_condition"), at, condition: z.strictObject({
    classification: z.literal("recoverable"), code: z.enum(["timeout", "known_dialog", "transient_load"]),
    stepId: id, attempt: count, maxAttempts: count, recovered: z.boolean(),
  }) }),
  z.strictObject({ type: z.literal("human_control"), at, interventionId: id, phase: z.enum(["requested", "granted", "returned"]) }),
]);
export const PublicReplaySchema = z.strictObject({
  kind: z.literal("reviewed_value_free_replay_projection"), redacted: z.literal(true), source: z.literal("replay.raw.json"),
  runId: id, capabilityId: id, capabilityVersion: id, startedAt: at, finishedAt: at, durationMs: count, status,
  modelCallsDuringReplay: count, invocationAndOutputValuesOmitted: z.literal(true), events: z.array(PublicEventSchema),
});

// Pinned publication profile, not a replacement for CapabilityArtifactSchema. New artifact
// fields require deliberate publication review. Literal JSON objects are not publishable.
const expression = z.union([
  z.strictObject({ source: z.enum(["input", "output"]), name: id }),
  z.strictObject({ source: z.literal("literal"), value: z.union([text, z.number().finite(), z.boolean(), z.null()]) }),
]);
const checkpoint: z.ZodType = z.lazy(() => z.union([
  z.strictObject({ kind: z.enum(["all", "any"]), conditions: z.array(checkpoint) }),
  z.strictObject({ kind: z.literal("element_state"), targetId: id, state: text, timeoutMs: count }),
  z.strictObject({ kind: z.enum(["text", "value"]), targetId: id, operator: text, expected: expression, timeoutMs: count }),
  z.strictObject({ kind: z.literal("url"), operator: text, expected: text, timeoutMs: count }),
  z.strictObject({ kind: z.literal("output"), outputName: id, operator: text, expected: expression.optional(), timeoutMs: count }),
]));
const locatorBase = { id: id.optional(), description: text.optional() };
const strategy = z.union([
  z.strictObject({ ...locatorBase, kind: z.literal("accessibility"), role: text.optional(), name: text.optional(), exact: z.boolean() }),
  z.strictObject({ ...locatorBase, kind: z.literal("label"), label: text, exact: z.boolean() }),
  z.strictObject({ ...locatorBase, kind: z.literal("text"), text, exact: z.boolean() }),
  z.strictObject({ ...locatorBase, kind: z.literal("relative"), anchorText: text, relation: text, controlHint: text.optional(), ordinal: count }),
  z.strictObject({ ...locatorBase, kind: z.literal("selector"), engine: text, selector: text }),
]);
const definition = { name: id, type: valueType, description: text, required: z.boolean(), sensitive: z.boolean() };
const stepBase = { id, description: text, risk, checkpoint: checkpoint.optional(), recoveryPolicyId: id.optional() };
export const PublicCapabilitySchema = z.strictObject({
  schemaVersion: z.enum(["1.0", "1.1"]),
  capability: z.strictObject({ id, version: id, name: text, description: text, approvalState: z.enum(["draft", "approved"]) }),
  target: z.strictObject({ application: text, surfaceKind: z.literal("web"), entryPoint: text,
    productFamily: text.optional(), supportedVersions: z.array(text).optional(), bindingProfile: id.optional() }),
  inputs: z.array(z.strictObject({ ...definition, validation: z.strictObject({
    minLength: count.optional(), maxLength: count.optional(), pattern: text.optional(), minimum: z.number().optional(), maximum: z.number().optional(),
  }).optional() })), outputs: z.array(z.strictObject(definition)),
  targets: z.array(z.strictObject({ id, description: text, strategies: z.array(strategy), framePath: z.array(text).optional(), notes: text.optional() })),
  steps: z.array(z.union([
    z.strictObject({ ...stepBase, action: z.literal("navigate"), destination: expression }),
    z.strictObject({ ...stepBase, action: z.literal("click"), targetId: id }),
    z.strictObject({ ...stepBase, action: z.literal("fill"), targetId: id, value: expression, clearFirst: z.boolean() }),
    z.strictObject({ ...stepBase, action: z.literal("select"), targetId: id, value: expression }),
    z.strictObject({ ...stepBase, action: z.literal("wait"), checkpoint }),
    z.strictObject({ ...stepBase, action: z.literal("extract"), targetId: id, outputName: id, extraction: text, attributeName: text.optional(), transform: text }),
  ])),
  // Current learned artifacts have not demonstrated branches. Extend only with reviewed evidence.
  businessOutcomes: z.array(z.never()), recoveryPolicies: z.array(z.never()), runtimeConditions: z.array(z.never()),
  successCondition: checkpoint,
  policy: z.strictObject({ allowedOrigins: z.array(text), allowedPathPatterns: z.array(text), allowedActions: z.array(action), irreversibleActionPolicy: z.enum(["block", "require_human"]) }),
  provenance: z.strictObject({ discoveryRunId: id, createdAt: at, compilerVersion: id }),
});

export const PublicationManifestSchema = z.strictObject({
  kind: z.literal("evidence_publication"), version: z.literal(1), runId: id,
  generatedAt: at, reviewedAt: at, reviewStatus: z.literal("reviewed"), publicationStatus: z.literal("validated"),
  publicFiles: z.array(z.strictObject({ file: publicFilename, bytes: count, sha256: z.string().regex(/^[a-f0-9]{64}$/) })),
  sources: z.array(sourceDigest.extend({ withheld: z.boolean() })),
  binaryPolicy: z.literal("withheld_manual_review_required"),
});

// Historical authored review, supported unchanged. Not a general provider payload schema.
const resolved = z.strictObject({ stepId: id, targetId: id, strategyIndex: count });
const matched = z.strictObject({ stepId: id, matched: z.boolean() });
export const ReviewedManifestSchema = z.strictObject({
  kind: z.literal("post_run_review_not_provider_transcript"), attempt: count, runId: id, baselineCommit: z.string().regex(/^[a-f0-9]{40}$/),
  baseline: z.strictObject({ branch: id, workingTreeClean: z.boolean(), synchronizedWithOrigin: z.boolean(), keyPresent: z.boolean(), typecheck: text, testsPassed: count }),
  command: z.literal("npm run discover"), postRunValidation: z.strictObject({ typecheck: text, testsPassed: count, sourceAndTestsUnchanged: z.boolean() }),
  genuineApiDiscovery: z.boolean(), provider: id, requestedModel: id, reasoningEffort: z.enum(["low", "medium", "high"]),
  store: z.literal(false), strictFunctionTools: z.literal(true), parallelToolCalls: z.literal(false), configurationSource: text,
  startedAt: at, finishedAt: at, coordinatorDurationMs: count, modelTurns: count, toolSequence: z.array(tool),
  actions: z.array(z.strictObject({ index: count, tool, selectedControl: z.strictObject({ role: text, name: text, contextText: text }),
    policy: z.strictObject({ risk, decision, reason: text }), executed: z.boolean() })),
  blockedProposals: z.array(z.never()), intervention: z.null(),
  outputs: z.record(id, z.strictObject({ type: valueType, matchesExpectedDiscoveryFixture: z.boolean(), valueOmitted: z.literal(true) })),
  finishVerification: z.strictObject({ passed: z.boolean(), method: text }),
  artifact: z.strictObject({ path: z.literal("capability.json"), schemaVersion: text, schemaValidation: text, referenceValidation: text,
    capabilityId: id, version: id, approvalState: text, stepSequence: z.array(action),
    targetStrategyChains: z.array(z.strictObject({ targetId: id, strategies: z.array(text), frameScoped: z.boolean() })),
    memberInputParameterized: z.boolean(), discoveryValuesAbsent: z.boolean(), ephemeralRefsAbsent: z.boolean(), providerAndPlaywrightObjectsAbsent: z.boolean(),
    provenanceMatches: z.boolean(), handEdited: z.boolean(), publicCopy: text }),
  replay: z.strictObject({ runId: id, status, durationMs: count, freshBrowser: z.boolean(), sameSerializedArtifact: z.boolean(),
    differentDeclaredInput: z.boolean(), matchesExpectedReplayFixture: z.boolean(), modelCalls: count, modelCallCountBasis: text,
    resolvedTargets: z.array(resolved), checkpoints: z.array(matched), recoveryEvents: count }),
  providerResult: z.strictObject({ successfulCompletedDecisions: count, httpStatus: z.null(), errorType: z.null(), errorCode: z.null(),
    requestId: z.null(), retryAfter: z.null(), rateLimitMetadata: z.null(), limitation: text }),
  implementationChanges: z.boolean(), promptChanges: z.boolean(), automaticRetries: count, manualRetries: count, originalEvidence: z.array(sourceDigest),
  publicationReview: z.strictObject({ rawEvidenceRemainsIgnored: z.literal(true), originalEvidenceUnchanged: z.boolean(), firstAttemptPreserved: z.boolean(),
    screenshotsVisuallyReviewed: count, configuredKeyFound: z.literal(false), credentialHeadersOrCookiesFound: z.literal(false),
    absoluteLocalPathsInPublicBundle: z.literal(false), rawManifestContainsLocalArtifactPath: z.boolean(),
    publicFiles: z.array(publicFilename), sanitization: text, limitation: text }), limitations: z.array(text),
});
