import type { CapabilityArtifact, CapabilityStep, RiskClass } from "../contracts/index.js";

export type PolicyRequest = {
  action: CapabilityStep["action"] | "open";
  risk: RiskClass;
  location: string;
  destination?: string;
};
export type PolicyDecision = { decision: "allow" | "block" | "require_human"; reason: string };
export type PolicyEvaluator = (request: Readonly<PolicyRequest>) => PolicyDecision;

export function locationAllowed(policy: CapabilityArtifact["policy"], location: string): boolean {
  try {
    const url = new URL(location);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    if (!policy.allowedOrigins.includes(url.origin)) return false;
    const path = decodeURIComponent(url.pathname);
    // Reject ambiguous encoded separators/dot segments rather than interpreting them twice.
    if (/%|\\/.test(path) || /%2f|%5c|%2e/i.test(url.pathname)) return false;
    return policy.allowedPathPatterns.length === 0 || policy.allowedPathPatterns.some((pattern) => {
      const escaped = pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      return new RegExp(`^${escaped}$`).test(path);
    });
  } catch { return false; }
}

export function evaluatePolicy(policy: CapabilityArtifact["policy"], request: PolicyRequest): PolicyDecision {
  if (!locationAllowed(policy, request.location)
    || (request.destination !== undefined && !locationAllowed(policy, request.destination))) {
    return { decision: "block", reason: "Location outside allowed origins or paths" };
  }
  if (request.action !== "open" && !policy.allowedActions.includes(request.action)) {
    return { decision: "block", reason: "Action is not allowed" };
  }
  if (request.risk === "irreversible_write") {
    return { decision: policy.irreversibleActionPolicy === "block" ? "block" : "require_human", reason: "Irreversible action requires policy disposition" };
  }
  return { decision: "allow", reason: "Action and location permitted" };
}
