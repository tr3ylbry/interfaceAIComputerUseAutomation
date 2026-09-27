import type { CapabilityArtifact, Checkpoint, ValueExpression } from "../contracts/index.js";

/** Validate references not covered by the original serialized shape validator. */
export function validateReferences(artifact: CapabilityArtifact): void {
  const targets = new Set(artifact.targets.map((target) => target.id));
  const inputs = new Set(artifact.inputs.map((input) => input.name));
  const outputs = new Set(artifact.outputs.map((output) => output.name));
  for (const ids of [artifact.steps.map((step) => step.id), artifact.runtimeConditions.map((condition) => condition.id)]) {
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate identifiers");
  }
  const expression = (value: ValueExpression) => {
    if (value.source !== "literal" && !(value.source === "input" ? inputs : outputs).has(value.name)) {
      throw new Error("Unknown value reference");
    }
  };
  const checkpoint = (value: Checkpoint): void => {
    if (value.kind === "all" || value.kind === "any") { value.conditions.forEach(checkpoint); return; }
    if ("targetId" in value && !targets.has(value.targetId)) throw new Error("Unknown checkpoint target");
    if (value.kind === "output" && !outputs.has(value.outputName)) throw new Error("Unknown output checkpoint");
    if ("expected" in value && value.expected && typeof value.expected === "object") expression(value.expected);
    if ("operator" in value && value.operator === "matches") {
      const expected = value.expected;
      if (typeof expected === "string") new RegExp(expected);
      else if (expected?.source === "literal") new RegExp(String(expected.value));
    }
  };
  for (const input of artifact.inputs) if (input.validation?.pattern) new RegExp(input.validation.pattern);
  for (const policy of artifact.recoveryPolicies) {
    if (policy.dismissTargetId && !targets.has(policy.dismissTargetId)) throw new Error("Unknown recovery target");
  }
  for (const step of artifact.steps) {
    if ("value" in step) expression(step.value);
    if ("destination" in step) expression(step.destination);
    if (step.checkpoint) checkpoint(step.checkpoint);
  }
  for (const outcome of artifact.businessOutcomes) {
    checkpoint(outcome.when);
    Object.values(outcome.data ?? {}).forEach(expression);
  }
  artifact.runtimeConditions.forEach((condition) => checkpoint(condition.when));
  checkpoint(artifact.successCondition);
}
