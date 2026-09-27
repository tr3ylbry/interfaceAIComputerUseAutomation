import type { SurfaceObservation } from "../contracts/index.js";
import { evaluatePolicy } from "../replay/policy.js";
import { scalar } from "../replay/values.js";
import type { DiscoveryRequest, DiscoveryPolicyDecision, UiDecision } from "./contracts.js";

export function discoveryPolicy(request: DiscoveryRequest, action: UiDecision, observation: SurfaceObservation): DiscoveryPolicyDecision {
  const control = "targetRef" in action ? observation.elements.find(element => element.ref === action.targetRef) : undefined;
  let risk: DiscoveryPolicyDecision["risk"] = "read_only";
  if (action.kind === "ui_click") {
    const approved = request.approval.readOnlyControls.some(rule => control?.role === rule.role && control.name === rule.name
      && new URL(observation.urlOrLocation!).pathname === rule.path);
    risk = approved ? "read_only" : "irreversible_write";
  }
  if (action.kind === "ui_fill" || action.kind === "ui_select") {
    risk = "reversible_write";
    if (!request.inputs.some(input => scalar(input.discoveryValue) === action.value)) return { risk, decision: "block", reason: "unauthorized_input_value" };
  }
  if ("targetRef" in action && (!control?.visible || !control.enabled)) return { risk, decision: "block", reason: "unknown_or_inactive_ref" };
  const kind = action.kind === "ui_read" ? "extract" : action.kind.slice(3) as "click" | "fill" | "select" | "navigate";
  return { risk, ...evaluatePolicy(request.policy, { action: kind, risk, location: observation.urlOrLocation ?? "",
    ...(action.kind === "ui_navigate" ? { destination: action.destination } : {}) }) };
}
