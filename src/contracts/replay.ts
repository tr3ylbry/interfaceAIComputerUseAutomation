import { z } from "zod";
import { EvidenceRefSchema, IdentifierSchema, JsonValueSchema } from "./common.js";

export const RecoverableConditionSchema = z.object({
  classification: z.literal("recoverable"),
  code: z.enum(["timeout", "known_dialog", "transient_load"]),
  stepId: IdentifierSchema,
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  message: z.string(),
  recovered: z.boolean(),
});

export type RecoverableCondition = z.infer<typeof RecoverableConditionSchema>;

export const ReplayEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("step_started"),
    at: z.string().datetime(),
    stepId: IdentifierSchema,
  }),
  z.object({
    type: z.literal("step_completed"),
    at: z.string().datetime(),
    stepId: IdentifierSchema,
  }),
  z.object({
    type: z.literal("target_resolved"),
    at: z.string().datetime(),
    stepId: IdentifierSchema,
    targetId: IdentifierSchema,
    strategyIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("policy_decision"),
    at: z.string().datetime(),
    stepId: IdentifierSchema.optional(),
    action: z.string().min(1),
    decision: z.enum(["allow", "block", "require_human"]),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("checkpoint_evaluated"),
    at: z.string().datetime(),
    stepId: IdentifierSchema.optional(),
    matched: z.boolean(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal("recoverable_condition"),
    at: z.string().datetime(),
    condition: RecoverableConditionSchema,
  }),
  z.object({
    type: z.literal("human_control"),
    at: z.string().datetime(),
    interventionId: IdentifierSchema,
    phase: z.enum(["requested", "granted", "returned"]),
  }),
]);

export type ReplayEvent = z.infer<typeof ReplayEventSchema>;

const ReplayBaseSchema = z.object({
  runId: IdentifierSchema,
  capabilityId: IdentifierSchema,
  capabilityVersion: z.string().min(1),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  events: z.array(ReplayEventSchema),
  evidence: z.array(EvidenceRefSchema).default([]),
});

export const ReplaySuccessSchema = ReplayBaseSchema.extend({
  status: z.literal("success"),
  outputs: z.record(z.string(), JsonValueSchema),
});

export const ReplayBusinessOutcomeSchema = ReplayBaseSchema.extend({
  status: z.literal("business_outcome"),
  code: IdentifierSchema,
  message: z.string(),
  data: z.record(z.string(), JsonValueSchema).default({}),
});

export const ReplayInterventionRequiredSchema = ReplayBaseSchema.extend({
  status: z.literal("intervention_required"),
  interventionId: IdentifierSchema,
  stepId: IdentifierSchema.optional(),
  reason: z.string(),
});

export const ReplayFailureSchema = ReplayBaseSchema.extend({
  status: z.literal("failure"),
  code: z.enum([
    "policy_violation",
    "target_not_found",
    "checkpoint_failed",
    "session_expired",
    "permission_denied",
    "unexpected_state",
    "recovery_exhausted",
    "surface_error",
  ]),
  stepId: IdentifierSchema.optional(),
  message: z.string(),
  expected: JsonValueSchema.optional(),
  observed: JsonValueSchema.optional(),
});

export const ReplayResultSchema = z.discriminatedUnion("status", [
  ReplaySuccessSchema,
  ReplayBusinessOutcomeSchema,
  ReplayInterventionRequiredSchema,
  ReplayFailureSchema,
]);

export type ReplayResult = z.infer<typeof ReplayResultSchema>;
