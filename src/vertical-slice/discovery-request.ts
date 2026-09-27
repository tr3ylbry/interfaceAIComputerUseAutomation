import { DiscoveryRequestSchema, type DiscoveryRequest } from "../discovery/contracts.js";

/** Caller contract and permissions only: no saved capability, locators or ordered UI steps. */
export function memberSavingsDiscoveryRequest(baseUrl: string): DiscoveryRequest {
  return DiscoveryRequestSchema.parse({
    goal: "Look up member 12345 and return the current savings balance.",
    capability: { id: "discovered.member-savings", version: "0.1.0", name: "Member savings inquiry", description: "Read the savings balance for the supplied member." },
    target: { application: "LegacyCore Demo", surfaceKind: "web", entryPoint: `${baseUrl}/member-search` },
    inputs: [{ name: "member_id", type: "string", description: "Fake member identifier", sensitive: true, discoveryValue: "12345" }],
    outputs: [{ name: "savings_balance", type: "currency", description: "Savings available balance", sensitive: true }],
    limits: { maxSteps: 12, timeoutMs: 180_000 },
    policy: { allowedOrigins: [baseUrl], allowedPathPatterns: ["/member-search", "/members/*", "/frames/accounts/*"],
      allowedActions: ["navigate", "click", "fill", "select", "extract"], irreversibleActionPolicy: "require_human" },
    approval: { allowModelProcessing: true, readOnlyControls: [
      { role: "button", name: "Search", path: "/member-search" },
      { role: "link", name: "Account Information", path: "/members/lookup" },
    ] },
  });
}
