import { z } from "zod";
import {
  IdentifierSchema,
  RiskClassSchema,
  ValueExpressionSchema,
  ValueTypeSchema,
} from "./common.js";
import { CheckpointSchema } from "./checkpoint.js";
import { TargetDescriptorSchema } from "./locator.js";

export const ParameterDefinitionSchema = z.object({
  name: IdentifierSchema,
  type: ValueTypeSchema,
  description: z.string().min(1),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
  validation: z
    .object({
      minLength: z.number().int().nonnegative().optional(),
      maxLength: z.number().int().positive().optional(),
      pattern: z.string().optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
    })
    .optional(),
});

export type ParameterDefinition = z.infer<typeof ParameterDefinitionSchema>;

export const OutputDefinitionSchema = z.object({
  name: IdentifierSchema,
  type: ValueTypeSchema,
  description: z.string().min(1),
  required: z.boolean().default(true),
  sensitive: z.boolean().default(false),
});

export type OutputDefinition = z.infer<typeof OutputDefinitionSchema>;

const StepBaseSchema = z.object({
  id: IdentifierSchema,
  description: z.string().min(1),
  risk: RiskClassSchema,
  checkpoint: CheckpointSchema.optional(),
  recoveryPolicyId: IdentifierSchema.optional(),
});

export const NavigateStepSchema = StepBaseSchema.extend({
  action: z.literal("navigate"),
  destination: ValueExpressionSchema,
});

export const ClickStepSchema = StepBaseSchema.extend({
  action: z.literal("click"),
  targetId: IdentifierSchema,
});

export const FillStepSchema = StepBaseSchema.extend({
  action: z.literal("fill"),
  targetId: IdentifierSchema,
  value: ValueExpressionSchema,
  clearFirst: z.boolean().default(true),
});

export const SelectStepSchema = StepBaseSchema.extend({
  action: z.literal("select"),
  targetId: IdentifierSchema,
  value: ValueExpressionSchema,
});

export const WaitStepSchema = StepBaseSchema.extend({
  action: z.literal("wait"),
  checkpoint: CheckpointSchema,
});

export const ExtractStepSchema = StepBaseSchema.extend({
  action: z.literal("extract"),
  targetId: IdentifierSchema,
  outputName: IdentifierSchema,
  extraction: z.enum(["text", "value", "attribute"]),
  attributeName: z.string().min(1).optional(),
  transform: z.enum(["none", "trim", "currency_to_number", "integer", "number"]).default("none"),
}).superRefine((value, ctx) => {
  if (value.extraction === "attribute" && !value.attributeName) {
    ctx.addIssue({
      code: "custom",
      message: "attribute extraction requires attributeName",
      path: ["attributeName"],
    });
  }
});

export const CapabilityStepSchema = z.discriminatedUnion("action", [
  NavigateStepSchema,
  ClickStepSchema,
  FillStepSchema,
  SelectStepSchema,
  WaitStepSchema,
  ExtractStepSchema,
]);

export type CapabilityStep = z.infer<typeof CapabilityStepSchema>;

export const BusinessOutcomeDefinitionSchema = z.object({
  code: IdentifierSchema,
  description: z.string().min(1),
  when: CheckpointSchema,
  data: z.record(z.string(), ValueExpressionSchema).optional(),
});

export type BusinessOutcomeDefinition = z.infer<typeof BusinessOutcomeDefinitionSchema>;

export const RecoveryPolicySchema = z.object({
  id: IdentifierSchema,
  appliesTo: z.array(z.enum(["timeout", "known_dialog", "transient_load"])).min(1),
  maxAttempts: z.number().int().min(1).max(5),
  backoffMs: z.number().int().nonnegative().max(30_000).default(500),
  dismissTargetId: IdentifierSchema.optional(),
});

export type RecoveryPolicy = z.infer<typeof RecoveryPolicySchema>;

export const CapabilityArtifactSchema = z.object({
  schemaVersion: z.literal("1.0"),
  capability: z.object({
    id: IdentifierSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1),
    description: z.string().min(1),
    approvalState: z.enum(["draft", "approved"]).default("draft"),
  }),
  target: z.object({
    application: z.string().min(1),
    productFamily: z.string().min(1).optional(),
    surfaceKind: z.enum(["web", "desktop"]),
    entryPoint: z.string().min(1),
    supportedVersions: z.array(z.string().min(1)).optional(),
    bindingProfile: IdentifierSchema.optional(),
  }),
  inputs: z.array(ParameterDefinitionSchema),
  outputs: z.array(OutputDefinitionSchema),
  targets: z.array(TargetDescriptorSchema),
  steps: z.array(CapabilityStepSchema).min(1),
  businessOutcomes: z.array(BusinessOutcomeDefinitionSchema).default([]),
  recoveryPolicies: z.array(RecoveryPolicySchema).default([]),
  successCondition: CheckpointSchema,
  policy: z.object({
    allowedOrigins: z.array(z.string().min(1)).min(1),
    allowedPathPatterns: z.array(z.string().min(1)).default([]),
    allowedActions: z
      .array(z.enum(["navigate", "click", "fill", "select", "wait", "extract"]))
      .min(1),
    irreversibleActionPolicy: z.enum(["block", "require_human"]),
  }),
  provenance: z.object({
    discoveryRunId: IdentifierSchema,
    createdAt: z.string().datetime(),
    compilerVersion: z.string().min(1),
  }),
}).superRefine((artifact, ctx) => {
  const inputNames = new Set(artifact.inputs.map((input) => input.name));
  const outputNames = new Set(artifact.outputs.map((output) => output.name));
  const targetIds = new Set(artifact.targets.map((target) => target.id));
  const recoveryIds = new Set(artifact.recoveryPolicies.map((policy) => policy.id));

  if (inputNames.size !== artifact.inputs.length) {
    ctx.addIssue({ code: "custom", message: "input names must be unique", path: ["inputs"] });
  }
  if (outputNames.size !== artifact.outputs.length) {
    ctx.addIssue({ code: "custom", message: "output names must be unique", path: ["outputs"] });
  }
  if (targetIds.size !== artifact.targets.length) {
    ctx.addIssue({ code: "custom", message: "target ids must be unique", path: ["targets"] });
  }
  if (recoveryIds.size !== artifact.recoveryPolicies.length) {
    ctx.addIssue({ code: "custom", message: "recovery policy ids must be unique", path: ["recoveryPolicies"] });
  }

  for (const [index, step] of artifact.steps.entries()) {
    if ("targetId" in step && !targetIds.has(step.targetId)) {
      ctx.addIssue({
        code: "custom",
        message: `step references unknown target '${step.targetId}'`,
        path: ["steps", index, "targetId"],
      });
    }
    if (step.action === "extract" && !outputNames.has(step.outputName)) {
      ctx.addIssue({
        code: "custom",
        message: `extract step references unknown output '${step.outputName}'`,
        path: ["steps", index, "outputName"],
      });
    }
    if (step.recoveryPolicyId && !recoveryIds.has(step.recoveryPolicyId)) {
      ctx.addIssue({
        code: "custom",
        message: `step references unknown recovery policy '${step.recoveryPolicyId}'`,
        path: ["steps", index, "recoveryPolicyId"],
      });
    }
  }
});

export type CapabilityArtifact = z.infer<typeof CapabilityArtifactSchema>;
