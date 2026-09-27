import { z } from "zod";
import { IdentifierSchema, ValueExpressionSchema } from "./common.js";

const TimedConditionSchema = z.object({
  timeoutMs: z.number().int().positive().max(120_000).default(10_000),
});

export const ElementStateConditionSchema = TimedConditionSchema.extend({
  kind: z.literal("element_state"),
  targetId: IdentifierSchema,
  state: z.enum(["visible", "hidden", "enabled", "disabled", "attached", "detached"]),
});

export const TextConditionSchema = TimedConditionSchema.extend({
  kind: z.literal("text"),
  targetId: IdentifierSchema,
  operator: z.enum(["equals", "contains", "matches"]),
  expected: ValueExpressionSchema,
});

export const ValueConditionSchema = TimedConditionSchema.extend({
  kind: z.literal("value"),
  targetId: IdentifierSchema,
  operator: z.enum(["equals", "contains", "matches"]),
  expected: ValueExpressionSchema,
});

export const UrlConditionSchema = TimedConditionSchema.extend({
  kind: z.literal("url"),
  operator: z.enum(["equals", "contains", "matches"]),
  expected: z.string().min(1),
});

export const OutputConditionSchema = TimedConditionSchema.extend({
  kind: z.literal("output"),
  outputName: IdentifierSchema,
  operator: z.enum(["defined", "equals"]),
  expected: ValueExpressionSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.operator === "equals" && !value.expected) {
    ctx.addIssue({
      code: "custom",
      message: "equals output checkpoint requires expected",
      path: ["expected"],
    });
  }
});

export const AtomicCheckpointSchema = z.discriminatedUnion("kind", [
  ElementStateConditionSchema,
  TextConditionSchema,
  ValueConditionSchema,
  UrlConditionSchema,
  OutputConditionSchema,
]);

export type AtomicCheckpoint = z.infer<typeof AtomicCheckpointSchema>;

export type Checkpoint =
  | AtomicCheckpoint
  | { kind: "all"; conditions: Checkpoint[] }
  | { kind: "any"; conditions: Checkpoint[] };

export const CheckpointSchema: z.ZodType<Checkpoint> = z.lazy(() =>
  z.union([
    AtomicCheckpointSchema,
    z.object({
      kind: z.literal("all"),
      conditions: z.array(CheckpointSchema).min(1),
    }),
    z.object({
      kind: z.literal("any"),
      conditions: z.array(CheckpointSchema).min(1),
    }),
  ]),
);

export const CheckpointEvaluationSchema = z.object({
  matched: z.boolean(),
  observed: z.unknown().optional(),
  message: z.string().optional(),
});

export type CheckpointEvaluation = z.infer<typeof CheckpointEvaluationSchema>;
