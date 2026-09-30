import { z } from "zod";
import type { HumanActionRecording, ReplayEvent } from "../contracts/index.js";
import { PublicEventSchema } from "./schemas.js";

export const PublicHandoffSchema = z.strictObject({
  kind: z.literal("value_free_handoff_completion"), redacted: z.literal(true),
  runId: z.uuid(), interventionId: z.uuid(),
  acceptance: z.enum(["operator_reported_manual", "automated_simulation"]),
  humanAcceptanceIndependentlyVerified: z.literal(false),
  requestedAt: z.string().datetime(), handbackAt: z.string().datetime(), finishedAt: z.string().datetime(),
  sameSession: z.literal(true), samePage: z.literal(true), recordingComplete: z.literal(true),
  control: z.array(z.strictObject({ phase: z.enum(["automation_running", "paused_for_intervention", "human_control", "resuming_automation"]),
    owner: z.enum(["automation", "human", "none"]), epoch: z.number().int().nonnegative() })).length(5),
  actions: z.array(z.strictObject({ at: z.string().datetime(), kind: z.enum(["click", "type", "select", "navigate"]),
    targetSummary: z.enum(["button", "link", "input", "select", "editable", "element", "main-document", "child-document"]),
    redacted: z.literal(true) })).min(1).max(1000),
  humanEpoch: z.literal(2), returnedEpoch: z.literal(4),
  explicitHandback: z.literal(true), status: z.literal("success"), modelCalls: z.literal(0),
  completionEvents: z.array(PublicEventSchema), outputVerified: z.literal(true), outputValuesOmitted: z.literal(true),
}).superRefine((value, ctx) => {
  const phases = ["automation_running", "paused_for_intervention", "human_control", "resuming_automation", "automation_running"];
  const owners = ["automation", "none", "human", "none", "automation"];
  if (value.control.some((entry, i) => entry.phase !== phases[i] || entry.owner !== owners[i] || entry.epoch !== i)
    || Date.parse(value.requestedAt) > Date.parse(value.handbackAt) || Date.parse(value.handbackAt) > Date.parse(value.finishedAt)
    || value.actions.some(action => Date.parse(action.at) < Date.parse(value.requestedAt) || Date.parse(action.at) > Date.parse(value.handbackAt))
    || !value.completionEvents.some(event => event.type === "checkpoint_evaluated" && event.stepId === "verify-manual-resolution" && event.matched)
    || value.completionEvents.some(event => event.type === "checkpoint_evaluated" && !event.matched)
    || !value.completionEvents.some(event => event.type === "checkpoint_evaluated" && event.stepId === "completion-output" && event.matched)) {
    ctx.addIssue({ code: "custom", message: "Inconsistent handoff completion" });
  }
});

export type HandoffPublicationInput = {
  runId: string; requestedAt: string; handbackAt: string; finishedAt: string;
  acceptance: "operator_reported_manual" | "automated_simulation";
  recording: HumanActionRecording; sameSession: boolean; samePage: boolean;
  control: Array<{ phase: string; owner: string; epoch: number }>; events: ReplayEvent[]; outputVerified: boolean;
};

export function handoffFields(input: HandoffPublicationInput, projectEvent: (event: ReplayEvent) => unknown) {
  return { filename: "handoff.sanitized.json", utf8: JSON.stringify({
    kind: "value_free_handoff_completion", redacted: true, runId: input.runId, interventionId: input.recording.interventionId,
    acceptance: input.acceptance, humanAcceptanceIndependentlyVerified: false,
    requestedAt: input.requestedAt, handbackAt: input.handbackAt, finishedAt: input.finishedAt,
    sameSession: input.sameSession, samePage: input.samePage, recordingComplete: !input.recording.incomplete,
    control: input.control.map(entry => ({ phase: entry.phase, owner: entry.owner, epoch: entry.epoch })),
    actions: input.recording.actions.map(action => ({ at: action.at, kind: action.kind, targetSummary: action.targetSummary, redacted: action.redacted })),
    humanEpoch: input.recording.epoch, returnedEpoch: input.control.at(-1)?.epoch,
    explicitHandback: true, status: "success", modelCalls: 0, completionEvents: input.events.map(projectEvent),
    outputVerified: input.outputVerified, outputValuesOmitted: true,
  }, null, 2) };
}
