import { z } from "zod";
import { CapabilityArtifactSchema, ParameterDefinitionSchema, OutputDefinitionSchema, JsonPrimitiveSchema,
  type SurfaceObservation, type TargetDescriptor, type RiskClass, type JsonValue, type Checkpoint,
  type InterventionRequest } from "../contracts/index.js";

export const DiscoveryRequestSchema = z.strictObject({
  goal: z.string().min(1).max(4_000),
  capability: CapabilityArtifactSchema.shape.capability.omit({ approvalState: true }),
  target: CapabilityArtifactSchema.shape.target,
  inputs: z.array(ParameterDefinitionSchema.extend({ discoveryValue: JsonPrimitiveSchema })).max(20),
  outputs: z.array(OutputDefinitionSchema).min(1).max(20),
  limits: z.strictObject({ maxSteps: z.number().int().min(1).max(50), timeoutMs: z.number().int().min(1).max(600_000) }),
  policy: CapabilityArtifactSchema.shape.policy,
  approval: z.strictObject({
    allowModelProcessing: z.boolean(),
    // Caller trust, not a model assertion or an ordered workflow.
    readOnlyControls: z.array(z.strictObject({ role: z.string().min(1), name: z.string().min(1), path: z.string().startsWith("/") })).default([]),
  }),
});
export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;

export const toolArguments = {
  ui_click: z.strictObject({ targetRef: z.string().min(1) }),
  ui_fill: z.strictObject({ targetRef: z.string().min(1), value: z.string() }),
  ui_select: z.strictObject({ targetRef: z.string().min(1), value: z.string() }),
  ui_navigate: z.strictObject({ destination: z.string().min(1) }),
  ui_read: z.strictObject({ targetRef: z.string().min(1), outputName: z.string().min(1), extraction: z.enum(["text", "value"]) }),
  finish_discovery: z.strictObject({}),
  request_human: z.strictObject({ reason: z.string().min(1).max(500) }),
};
export type DiscoveryDecision = { [K in keyof typeof toolArguments]: { kind: K } & z.infer<(typeof toolArguments)[K]> }[keyof typeof toolArguments];
export type UiDecision = Exclude<DiscoveryDecision, { kind: "finish_discovery" | "request_human" }>;

export function parseDecision(value: unknown): DiscoveryDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid decision");
  const { kind, ...args } = value as Record<string, unknown>;
  if (typeof kind !== "string" || !Object.hasOwn(toolArguments, kind)) throw new Error("Unknown tool");
  return { kind, ...toolArguments[kind as keyof typeof toolArguments].parse(args) } as DiscoveryDecision;
}

export type DiscoveryPolicyDecision = { decision: "allow" | "block" | "require_human"; reason: string; risk: RiskClass };
export type DiscoveryAction = {
  index: number; decision: UiDecision; policy: DiscoveryPolicyDecision;
  beforeId: string; afterId?: string;
  control?: SurfaceObservation["elements"][number]; target?: TargetDescriptor;
  executed: boolean; rawValue?: JsonValue;
};
export type OutputCandidate = { value: JsonValue; rawValue: JsonValue; actionIndex: number; target: TargetDescriptor; extraction: "text" | "value" };
export type DiscoveryRun = {
  id: string; request: DiscoveryRequest; model: { provider: string; model: string };
  startedAt: string; finishedAt: string; redacted: false;
  status: "success" | "failure" | "intervention_required";
  code?: string; intervention?: InterventionRequest;
  observations: SurfaceObservation[]; actions: DiscoveryAction[];
  decisions: Array<{ observationId: string; decision: DiscoveryDecision }>;
  outputs: Record<string, OutputCandidate>; successChecks: Checkpoint[];
};
export type DiscoveryContext = { request: DiscoveryRequest; actions: DiscoveryAction[]; outputs: Record<string, OutputCandidate> };
export interface DiscoveryModel {
  readonly identity: { provider: string; model: string };
  decide(observation: SurfaceObservation, context: DiscoveryContext, signal: AbortSignal): Promise<unknown>;
}

export class DiscoveryError extends Error {
  constructor(readonly code: string) { super(code); }
}
