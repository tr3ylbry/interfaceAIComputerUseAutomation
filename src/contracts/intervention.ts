import { z } from "zod";
import { EvidenceRefSchema, IdentifierSchema } from "./common.js";

export const InterventionReasonSchema = z.enum([
  "agent_stuck",
  "replay_blocked",
  "risky_action_requires_confirmation",
  "unexpected_state",
  "recovery_exhausted",
]);

export type InterventionReason = z.infer<typeof InterventionReasonSchema>;

export const InterventionRequestSchema = z.object({
  id: IdentifierSchema,
  runId: IdentifierSchema,
  capabilityId: IdentifierSchema.optional(),
  goal: z.string().min(1).optional(),
  stepId: IdentifierSchema.optional(),
  reason: InterventionReasonSchema,
  explanation: z.string().min(1),
  createdAt: z.string().datetime(),
  evidence: z.array(EvidenceRefSchema).default([]),
  stateSummary: z.string().optional(),
});

export type InterventionRequest = z.infer<typeof InterventionRequestSchema>;

export const HumanActionRecordSchema = z.object({
  at: z.string().datetime(),
  kind: z.enum(["click", "type", "select", "navigate", "other"]),
  targetSummary: z.string().optional(),
  valueSummary: z.string().optional(),
  redacted: z.boolean().default(true),
});

export type HumanActionRecord = z.infer<typeof HumanActionRecordSchema>;

export const SessionControlStateSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("automation_running"),
    owner: z.literal("automation"),
    epoch: z.number().int().nonnegative(),
  }),
  z.object({
    state: z.literal("paused_for_intervention"),
    owner: z.literal("none"),
    epoch: z.number().int().nonnegative(),
    interventionId: IdentifierSchema,
  }),
  z.object({
    state: z.literal("human_control"),
    owner: z.literal("human"),
    epoch: z.number().int().nonnegative(),
    interventionId: IdentifierSchema,
    grantedAt: z.string().datetime(),
  }),
  z.object({
    state: z.literal("resuming_automation"),
    owner: z.literal("none"),
    epoch: z.number().int().nonnegative(),
    interventionId: IdentifierSchema,
  }),
  z.object({
    state: z.literal("completed"),
    owner: z.literal("none"),
    epoch: z.number().int().nonnegative(),
  }),
  z.object({
    state: z.literal("failed"),
    owner: z.literal("none"),
    epoch: z.number().int().nonnegative(),
  }),
]);

export type SessionControlState = z.infer<typeof SessionControlStateSchema>;

export const AllowedControlTransitions: Readonly<
  Record<SessionControlState["state"], readonly SessionControlState["state"][]>
> = {
  automation_running: ["paused_for_intervention", "completed", "failed"],
  paused_for_intervention: ["human_control", "failed"],
  human_control: ["resuming_automation", "completed", "failed"],
  resuming_automation: ["automation_running", "completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransitionControl(
  from: SessionControlState,
  to: SessionControlState,
): boolean {
  return (AllowedControlTransitions[from.state] ?? []).includes(to.state);
}
