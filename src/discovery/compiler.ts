import { CapabilityArtifactSchema, type CapabilityArtifact, type CapabilityStep, type Checkpoint, type TargetDescriptor, type ValueExpression } from "../contracts/index.js";
import { scalar, matchesType } from "../replay/values.js";
import { validateReferences } from "../replay/validation.js";
import { DiscoveryError, type DiscoveryRun } from "./contracts.js";
import { outputTransform } from "./coordinator.js";

/** Pure normalization of verified evidence; never asks a model to author locators or code. */
export function compileDiscovery(run: DiscoveryRun): CapabilityArtifact {
  if (run.status !== "success" || run.decisions.at(-1)?.decision.kind !== "finish_discovery"
    || !run.successChecks.length || !run.actions.length || run.actions.some(action => !action.executed || action.policy.decision !== "allow" || !action.afterId)) {
    throw new DiscoveryError("unverified_discovery_run");
  }
  for (const output of run.request.outputs) {
    const candidate = run.outputs[output.name];
    if ((!candidate && output.required) || (candidate && !matchesType(candidate.value, output.type))) throw new DiscoveryError("unverified_output");
  }
  const forbidden = [...run.request.inputs.map(input => scalar(input.discoveryValue)),
    ...Object.values(run.outputs).flatMap(output => [String(output.value), String(output.rawValue)])].filter(Boolean);
  const containsValue = (value: unknown) => forbidden.some(token => JSON.stringify(value).includes(token));
  const targets: TargetDescriptor[] = [];
  const targetIds = new Map<number, string>();
  for (const action of run.actions) {
    if (action.decision.kind === "ui_navigate") continue;
    if (!action.control || !action.target || action.control.ref !== action.decision.targetRef) throw new DiscoveryError("missing_control_evidence");
    const strategies = action.target.strategies.filter(strategy => !containsValue(strategy));
    if (!strategies.length || containsValue(action.target.framePath ?? [])) throw new DiscoveryError("no_value_independent_locator");
    const id = `target-${action.index}`;
    targets.push({ id, description: `Verified ${action.decision.kind.slice(3)} control`, strategies: structuredClone(strategies),
      ...(action.target.framePath?.length ? { framePath: [...action.target.framePath] } : {}) });
    targetIds.set(action.index, id);
  }
  const bind = (value: string): ValueExpression => {
    const matching = run.request.inputs.filter(input => scalar(input.discoveryValue) === value);
    if (matching.length > 1) throw new DiscoveryError("ambiguous_input_binding");
    if (matching.length === 1) return { source: "input", name: matching[0]!.name };
    if (containsValue(value)) throw new DiscoveryError("unsupported_value_interpolation");
    return { source: "literal", value };
  };
  const visible = (targetId: string): Checkpoint => ({ kind: "element_state", targetId, state: "visible", timeoutMs: 5_000 });
  const steps: CapabilityStep[] = run.actions.map((action, index) => {
    const decision = action.decision;
    const next = run.actions[index + 1];
    const base = { id: `step-${index}`, description: `Discovered ${decision.kind.slice(3)} action`, risk: action.policy.risk,
      ...(next && targetIds.has(next.index) ? { checkpoint: visible(targetIds.get(next.index)!) } : {}) };
    if (decision.kind === "ui_navigate") return { ...base, action: "navigate", destination: bind(decision.destination) };
    const targetId = targetIds.get(action.index)!;
    if (decision.kind === "ui_click") return { ...base, action: "click", targetId };
    if (decision.kind === "ui_fill") return { ...base, action: "fill", targetId, value: bind(decision.value), clearFirst: true };
    if (decision.kind === "ui_select") return { ...base, action: "select", targetId, value: bind(decision.value) };
    const definition = run.request.outputs.find(output => output.name === decision.outputName);
    if (!definition) throw new DiscoveryError("unknown_output");
    return { ...base, action: "extract", targetId, extraction: decision.extraction, outputName: decision.outputName, transform: outputTransform(definition.type) };
  });
  const conditions: Checkpoint[] = Object.entries(run.outputs).flatMap(([name, candidate]) => [
    { kind: "output" as const, outputName: name, operator: "defined" as const, timeoutMs: 1 }, visible(targetIds.get(candidate.actionIndex)!),
  ]);
  const artifact = CapabilityArtifactSchema.parse({ schemaVersion: "1.1", capability: { ...run.request.capability, approvalState: "draft" },
    target: run.request.target,
    inputs: run.request.inputs.map(({ discoveryValue: _value, ...definition }) => definition), outputs: run.request.outputs,
    targets, steps, businessOutcomes: [], runtimeConditions: [], recoveryPolicies: [],
    successCondition: { kind: "all", conditions }, policy: run.request.policy,
    provenance: { discoveryRunId: run.id, createdAt: run.finishedAt, compilerVersion: "0.2.0" } });
  validateReferences(artifact);
  if (containsValue(artifact)) throw new DiscoveryError("discovery_value_in_artifact");
  return artifact;
}
