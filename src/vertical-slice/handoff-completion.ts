import { setTimeout as delay } from "node:timers/promises";
import type { CapabilityArtifact, Checkpoint, ReplayEvent, SurfaceAdapter, SurfaceSession, TargetDescriptor } from "../contracts/index.js";
import type { ReplayHandoff } from "../replay/coordinator.js";
import { evaluatePolicy } from "../replay/policy.js";
import { transform } from "../replay/values.js";
import { accountInformationTarget, savingsBalanceTarget } from "./member-savings.js";

/** Explicit controlled-demo completion, NOT arbitrary replay continuation or human approval. */
export async function completeBankHandoff(adapter: SurfaceAdapter, handoff: ReplayHandoff,
  policy: CapabilityArtifact["policy"], events: ReplayEvent[]): Promise<number> {
  const session = handoff.session;
  const member = handoff.context.inputs.member_id;
  if (handoff.request.capabilityId !== "legacy-core.member.read-savings-balance"
    || handoff.request.reason !== "unexpected_state" || handoff.request.stepId !== "search-member"
    || typeof member !== "string" || !/^\d+$/.test(member)) throw new Error("Unsupported handoff completion");
  const location = new URL((await adapter.observe(session)).urlOrLocation!);
  if (location.pathname !== "/members/lookup" || location.searchParams.get("memberNumber") !== member
    || location.searchParams.get("scenario") !== "intervention") throw new Error("Manual context changed");
  const approve = async (action: "click" | "extract", stepId: string) => {
    const current = (await adapter.observe(session)).urlOrLocation ?? "";
    const decision = evaluatePolicy(policy, { action, risk: "read_only", location: current });
    events.push({ type: "policy_decision", at: now(), stepId, action, ...decision });
    if (decision.decision !== "allow") throw new Error("Completion policy denied");
  };
  await approve("extract", "verify-manual-resolution");
  const warning: TargetDescriptor = { id: "closed-operator-warning", description: "Retained operator warning",
    strategies: [{ kind: "selector", engine: "css", selector: 'dialog[aria-label="Unexpected account warning"]' }] };
  await resolve(adapter, session, warning, events);
  await check(adapter, session, { kind: "element_state", targetId: warning.id, state: "hidden", timeoutMs: 1 }, events, "verify-manual-resolution");
  const link = await resolve(adapter, session, accountInformationTarget, events);
  await approve("click", "complete-account-navigation");
  const clicked = await adapter.execute(session, { kind: "click", targetRef: link.runtimeRef });
  if (!clicked.ok) throw new Error("Completion click failed");
  events.push({ type: "step_completed", at: now(), stepId: "complete-account-navigation" });
  await check(adapter, session, { kind: "url", operator: "equals",
    expected: `${location.origin}/members/${member}/accounts?scenario=intervention`, timeoutMs: 5000 }, events, "complete-account-navigation");
  const balance = await resolve(adapter, session, savingsBalanceTarget, events);
  await check(adapter, session, { kind: "text", targetId: savingsBalanceTarget.id, operator: "matches",
    expected: { source: "literal", value: "^\\$[0-9,]+\\.[0-9]{2}$" }, timeoutMs: 5000 }, events, "complete-savings-extraction");
  await approve("extract", "complete-savings-extraction");
  const read = await adapter.execute(session, { kind: "read", targetRef: balance.runtimeRef, extraction: "text" });
  if (!read.ok) throw new Error("Completion read failed");
  events.push({ type: "step_completed", at: now(), stepId: "complete-savings-extraction" });
  const value = transform(read.value, "currency_to_number");
  if (typeof value !== "number") throw new Error("Invalid completion output");
  events.push({ type: "checkpoint_evaluated", at: now(), stepId: "completion-output", matched: true });
  return value;
}
const now = () => new Date().toISOString();

async function resolve(adapter: SurfaceAdapter, session: SurfaceSession, target: TargetDescriptor, events: ReplayEvent[]) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      const result = await adapter.resolveTarget(session, target);
      events.push({ type: "target_resolved", at: now(), stepId: "handoff-completion", targetId: target.id, strategyIndex: result.strategyIndex });
      return result;
    } catch (error) {
      // Bounded readiness probes only. Never retry an action or swallow policy/ownership errors.
      if (!(error instanceof Error) || !("code" in error) || error.code !== "target_not_found" || Date.now() >= deadline) throw error;
      await delay(25);
    }
  }
}
async function check(adapter: SurfaceAdapter, session: SurfaceSession, checkpoint: Checkpoint, events: ReplayEvent[], stepId: string) {
  const result = await adapter.evaluate(session, checkpoint);
  events.push({ type: "checkpoint_evaluated", at: now(), stepId, matched: result.matched });
  if (!result.matched) throw new Error("Post-handback checkpoint failed");
}
