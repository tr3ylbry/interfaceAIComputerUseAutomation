import { z } from "zod";
import { Checkpoint, CheckpointEvaluation } from "./checkpoint.js";
import { EvidenceRef, Identifier, IdentifierSchema, JsonValue, JsonValueSchema } from "./common.js";
import { TargetDescriptor } from "./locator.js";

export const SurfaceTargetSchema = z.object({
  surfaceKind: z.enum(["web", "desktop"]),
  entryPoint: z.string().min(1),
});

export type SurfaceTarget = z.infer<typeof SurfaceTargetSchema>;

export const ObservationElementSchema = z.object({
  ref: IdentifierSchema,
  role: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  value: z.string().optional(),
  enabled: z.boolean().optional(),
  visible: z.boolean().optional(),
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().nonnegative(),
      height: z.number().nonnegative(),
    })
    .optional(),
});

export const SurfaceObservationSchema = z.object({
  capturedAt: z.string().datetime(),
  urlOrLocation: z.string().optional(),
  title: z.string().optional(),
  elements: z.array(ObservationElementSchema).default([]),
  textSummary: z.string().optional(),
  screenshotPath: z.string().optional(),
});

export type SurfaceObservation = z.infer<typeof SurfaceObservationSchema>;

export const SurfaceActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("navigate"),
    destination: z.string().min(1),
  }),
  z.object({
    kind: z.literal("click"),
    targetRef: IdentifierSchema,
  }),
  z.object({
    kind: z.literal("fill"),
    targetRef: IdentifierSchema,
    value: z.string(),
    clearFirst: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal("select"),
    targetRef: IdentifierSchema,
    value: z.string(),
  }),
  z.object({
    kind: z.literal("read"),
    targetRef: IdentifierSchema,
    extraction: z.enum(["text", "value", "attribute"]),
    attributeName: z.string().optional(),
  }),
]);

export type SurfaceAction = z.infer<typeof SurfaceActionSchema>;

export const SurfaceActionResultSchema = z.object({
  ok: z.boolean(),
  value: JsonValueSchema.optional(),
  observedState: JsonValueSchema.optional(),
  error: z
    .object({
      code: IdentifierSchema,
      message: z.string(),
    })
    .optional(),
});

export type SurfaceActionResult = z.infer<typeof SurfaceActionResultSchema>;

export interface SurfaceSession {
  readonly id: Identifier;
  readonly kind: "web" | "desktop";
}

export interface ResolvedTarget {
  readonly targetId: Identifier;
  readonly runtimeRef: Identifier;
  readonly strategyIndex: number;
}

export type HumanControlHandle = {
  interventionId: Identifier;
  instructions: string;
};

export interface SurfaceAdapter {
  readonly kind: "web" | "desktop";

  open(target: SurfaceTarget): Promise<SurfaceSession>;

  observe(session: SurfaceSession): Promise<SurfaceObservation>;

  resolveTarget(
    session: SurfaceSession,
    descriptor: TargetDescriptor,
  ): Promise<ResolvedTarget>;

  execute(
    session: SurfaceSession,
    action: SurfaceAction,
  ): Promise<SurfaceActionResult>;

  evaluate(
    session: SurfaceSession,
    checkpoint: Checkpoint,
  ): Promise<CheckpointEvaluation>;

  captureEvidence(
    session: SurfaceSession,
    kinds: Array<"screenshot" | "trace" | "dom_snapshot" | "accessibility_snapshot">,
  ): Promise<EvidenceRef[]>;

  relinquishToHuman(
    session: SurfaceSession,
    interventionId: Identifier,
  ): Promise<HumanControlHandle>;

  reacquireFromHuman(
    session: SurfaceSession,
    interventionId: Identifier,
  ): Promise<void>;

  close(session: SurfaceSession): Promise<void>;
}

export type SurfaceRuntimeContext = {
  inputs: Record<string, JsonValue>;
  outputs: Record<string, JsonValue>;
};
