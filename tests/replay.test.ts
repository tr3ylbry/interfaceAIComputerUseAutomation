import { describe, expect, it, vi } from "vitest";
import { CapabilityArtifactSchema, ReplayResultSchema, NavigationPolicyError, type CapabilityArtifact, type Checkpoint, type SurfaceAdapter } from "../src/contracts/index.js";
import { ReplayCoordinator } from "../src/replay/index.js";
import { locationAllowed } from "../src/replay/policy.js";
import { transform } from "../src/replay/values.js";
import fixture from "../examples/member-savings-balance.capability.json" with { type: "json" };

function artifact(): CapabilityArtifact {
  const value = CapabilityArtifactSchema.parse(fixture);
  value.capability.approvalState = "approved";
  value.runtimeConditions = [];
  value.businessOutcomes = [];
  value.steps = [{ id: "extract", description: "Read", risk: "read_only", action: "extract",
    targetId: "savings-balance-value", outputName: "savings_balance", extraction: "text", transform: "currency_to_number" }];
  return value;
}

function surface() {
  const session = { id: "session-1", kind: "web" as const };
  return {
    kind: "web" as const,
    supportsNavigationGuard: true,
    open: vi.fn<SurfaceAdapter["open"]>().mockResolvedValue(session),
    observe: vi.fn<SurfaceAdapter["observe"]>().mockResolvedValue({ capturedAt: new Date().toISOString(),
      urlOrLocation: fixture.target.entryPoint, elements: [] }),
    resolveTarget: vi.fn<SurfaceAdapter["resolveTarget"]>().mockImplementation(async (_session, target) => ({
      targetId: target.id, runtimeRef: "ref-1", strategyIndex: 2,
    })),
    execute: vi.fn<SurfaceAdapter["execute"]>().mockResolvedValue({ ok: true, value: "$4,321.09" }),
    evaluate: vi.fn<SurfaceAdapter["evaluate"]>().mockResolvedValue({ matched: true }),
    captureEvidence: vi.fn<SurfaceAdapter["captureEvidence"]>().mockResolvedValue([]),
    relinquishToHuman: vi.fn<SurfaceAdapter["relinquishToHuman"]>().mockImplementation(async (_s, id) => ({ interventionId: id, instructions: "Review" })),
    reacquireFromHuman: vi.fn<SurfaceAdapter["reacquireFromHuman"]>().mockResolvedValue(),
    close: vi.fn<SurfaceAdapter["close"]>().mockResolvedValue(),
  };
}
const inputs = { member_id: "12345" };

describe("generic replay", () => {
  it("refuses web adapters without pre-request enforcement before opening", async () => {
    const adapter = surface();
    adapter.supportsNavigationGuard = false;
    expect(await new ReplayCoordinator(adapter).run(artifact(), inputs)).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(adapter.open).not.toHaveBeenCalled();
  });

  it("passes a surface-independent navigation guard before session opening", async () => {
    const adapter = surface();
    await new ReplayCoordinator(adapter).run(artifact(), inputs);
    const guard = adapter.open.mock.calls[0]![1]!.navigationGuard!;
    expect(guard(fixture.target.entryPoint, "/members/12345").decision).toBe("allow");
    expect(guard(fixture.target.entryPoint, "https://forbidden.test/").decision).toBe("block");
  });

  it("does not turn a late blocked navigation during cleanup into success or surface_error", async () => {
    const adapter = surface();
    adapter.close.mockRejectedValue(new NavigationPolicyError("http://localhost/[redacted]", "https://forbidden.test/[redacted]", "destination_not_allowed"));
    expect(await new ReplayCoordinator(adapter).run(artifact(), inputs)).toMatchObject({ status: "failure", code: "policy_violation" });
  });

  it("retains a policy violation even if its diagnostic event sink throws", async () => {
    const adapter = surface();
    adapter.execute.mockRejectedValue(new NavigationPolicyError(fixture.target.entryPoint, "https://forbidden.test/private?secret=value", "destination_not_allowed"));
    const result = await new ReplayCoordinator(adapter, { onEvent: (event) => {
      if (event.type === "policy_decision" && event.decision === "block") throw new Error("Sink unavailable");
    } }).run(artifact(), inputs);
    expect(result).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(result.events).toContainEqual(expect.objectContaining({ type: "policy_decision", decision: "block" }));
    expect(JSON.stringify(result)).not.toContain("secret=value");
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it("binds outputs for later actions/checkpoints, preserves artifact and emits policy before execute", async () => {
    const saved = artifact();
    saved.steps.push({ id: "fill-output", description: "Use prior output", risk: "reversible_write", action: "fill",
      targetId: "member-id-input", clearFirst: true, value: { source: "output", name: "savings_balance" },
      checkpoint: { kind: "output", outputName: "savings_balance", operator: "equals", expected: { source: "literal", value: 4321.09 }, timeoutMs: 100 } });
    const original = structuredClone(saved);
    const adapter = surface();
    const order: string[] = [];
    adapter.execute.mockImplementation(async () => { order.push("execute"); return { ok: true, value: "$4,321.09" }; });
    const result = await new ReplayCoordinator(adapter, { onEvent: (event) => { if (event.type === "policy_decision") order.push(event.decision); } }).run(saved, inputs);
    expect(result).toMatchObject({ status: "success", outputs: { savings_balance: 4321.09 } });
    expect(ReplayResultSchema.safeParse(result).success).toBe(true);
    expect(order).toEqual(["allow", "allow", "execute", "allow", "execute"]);
    expect(adapter.execute).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ value: "4321.09" }));
    expect(adapter.evaluate).not.toHaveBeenCalled();
    expect(saved).toEqual(original);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "target_resolved", strategyIndex: 2 }));
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { member_id: 12345 }, { member_id: "" }, { member_id: "x", extra: true }])("rejects invalid inputs before opening: %j", async (bad) => {
    const adapter = surface();
    expect(await new ReplayCoordinator(adapter).run(artifact(), bad)).toMatchObject({ status: "failure", code: "unexpected_state" });
    expect(adapter.open).not.toHaveBeenCalled();
  });

  it("validates malformed artifacts and cross references before opening", async () => {
    const adapter = surface();
    const runner = new ReplayCoordinator(adapter);
    expect((await runner.run({}, inputs)).status).toBe("failure");
    const saved = artifact();
    saved.successCondition = { kind: "element_state", targetId: "unknown", state: "visible", timeoutMs: 1 };
    expect((await runner.run(saved, inputs)).status).toBe("failure");
    expect(adapter.open).not.toHaveBeenCalled();
  });

  it("blocks draft, disallowed origins, routes and actions", async () => {
    for (const change of [
      (saved: CapabilityArtifact) => { saved.capability.approvalState = "draft"; },
      (saved: CapabilityArtifact) => { saved.target.entryPoint = "https://elsewhere.example/"; },
      (saved: CapabilityArtifact) => { saved.policy.allowedPathPatterns = ["/different"]; },
      (saved: CapabilityArtifact) => { saved.policy.allowedActions = ["click"]; },
    ]) {
      const saved = artifact(); change(saved);
      const adapter = surface();
      expect(await new ReplayCoordinator(adapter).run(saved, inputs)).toMatchObject({ status: "failure", code: "policy_violation" });
      expect(adapter.execute).not.toHaveBeenCalled();
    }
  });

  it("blocks explicit navigation before execute and does not permit runtime policy to override a block", async () => {
    const saved = artifact();
    saved.policy.allowedActions.push("navigate");
    saved.steps = [{ id: "leave", description: "Navigate", risk: "read_only", action: "navigate", destination: { source: "literal", value: "https://untrusted.example/" } }];
    const adapter = surface();
    expect(await new ReplayCoordinator(adapter, { policy: () => ({ decision: "allow", reason: "test" }) }).run(saved, inputs))
      .toMatchObject({ status: "failure", code: "policy_violation" });
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it("enforces runtime restrictions and irreversible block or intervention", async () => {
    const saved = artifact(); saved.steps[0]!.risk = "irreversible_write";
    const adapter = surface();
    const runner = new ReplayCoordinator(adapter);
    const result = await runner.run(saved, inputs);
    expect(result.status).toBe("intervention_required");
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(adapter.close).not.toHaveBeenCalled();
    if (result.status !== "intervention_required") throw new Error("Expected handoff");
    expect(runner.getHandoff(result.interventionId)?.request).toMatchObject({ reason: "risky_action_requires_confirmation", stepId: "extract" });
    await runner.releaseHandoff(result.interventionId);
    expect(adapter.close).toHaveBeenCalledWith({ id: "session-1", kind: "web" });
    saved.policy.irreversibleActionPolicy = "block";
    expect(await runner.run(saved, inputs)).toMatchObject({ status: "failure", code: "policy_violation" });
    const restricted = new ReplayCoordinator(surface(), { policy: () => ({ decision: "block", reason: "restricted" }) });
    expect(await restricted.run(artifact(), inputs)).toMatchObject({ status: "failure", code: "policy_violation" });
  });

  it("returns business outcomes before extraction", async () => {
    const saved = artifact(); saved.businessOutcomes = CapabilityArtifactSchema.parse(fixture).businessOutcomes;
    const adapter = surface();
    expect(await new ReplayCoordinator(adapter).run(saved, inputs)).toMatchObject({ status: "business_outcome", code: "MEMBER_NOT_FOUND" });
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it("enforces step and output checkpoints with bounded condition polling", async () => {
    const saved = artifact();
    saved.steps[0]!.checkpoint = { kind: "url", operator: "equals", expected: "http://127.0.0.1:3000/missing", timeoutMs: 50 };
    const adapter = surface(); adapter.evaluate.mockResolvedValue({ matched: false });
    let time = 0;
    const runner = new ReplayCoordinator(adapter, { clock: () => time, sleep: async (ms) => { time += ms; } });
    expect(await runner.run(saved, inputs)).toMatchObject({ status: "failure", code: "checkpoint_failed", stepId: "extract" });
    expect(time).toBe(50);
    delete saved.steps[0]!.checkpoint;
    saved.successCondition = { kind: "output", outputName: "savings_balance", operator: "equals", expected: { source: "literal", value: 0 }, timeoutMs: 50 };
    expect(await runner.run(saved, inputs)).toMatchObject({ status: "failure", code: "checkpoint_failed" });
  });

  it("waits for a changing checkpoint without repeating a dispatched action", async () => {
    const saved = artifact();
    saved.steps[0]!.checkpoint = { kind: "url", operator: "contains", expected: "ready", timeoutMs: 100 };
    const adapter = surface();
    adapter.evaluate.mockResolvedValueOnce({ matched: false }).mockResolvedValue({ matched: true });
    let time = 0;
    expect(await new ReplayCoordinator(adapter, { clock: () => time, sleep: async (ms) => { time += ms; } }).run(saved, inputs)).toMatchObject({ status: "success" });
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  it("records bounded timeout recovery without reissuing the original action", async () => {
    const saved = artifact();
    saved.steps[0]!.checkpoint = { kind: "url", operator: "contains", expected: "ready", timeoutMs: 1 };
    saved.steps[0]!.recoveryPolicyId = "transient-search-load";
    const adapter = surface(); adapter.evaluate.mockResolvedValue({ matched: false });
    let time = 0;
    const result = await new ReplayCoordinator(adapter, { clock: () => time, sleep: async (ms) => { time += ms; } }).run(saved, inputs);
    expect(result).toMatchObject({ status: "failure", code: "recovery_exhausted" });
    expect(result.events.filter((event) => event.type === "recoverable_condition")).toHaveLength(2);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
  });

  it("does not hide uncertain action failures behind retries or expose raw sensitive errors", async () => {
    const saved = artifact(); saved.steps[0]!.recoveryPolicyId = "transient-search-load";
    const adapter = surface(); adapter.execute.mockResolvedValue({ ok: false, error: { code: "timeout", message: "secret-input-12345" } });
    const result = await new ReplayCoordinator(adapter).run(saved, inputs);
    expect(result).toMatchObject({ status: "failure", code: "surface_error" });
    expect(JSON.stringify(result)).not.toContain("secret-input-12345");
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(adapter.captureEvidence).not.toHaveBeenCalled();
  });

  it("reports evidence and cleanup failure without losing the original failure", async () => {
    const adapter = surface();
    adapter.execute.mockRejectedValue(new Error("sensitive details"));
    adapter.captureEvidence.mockRejectedValue(new Error("disk full"));
    adapter.close.mockRejectedValue(new Error("closed"));
    const result = await new ReplayCoordinator(adapter, { captureRawEvidence: true }).run(artifact(), inputs);
    expect(result).toMatchObject({ status: "failure", code: "surface_error", observed: { evidence: "capture_failed" } });
    if (result.status === "failure") expect(result.message).toContain("cleanup failed");
  });

  it("binds surface expected values and handles mixed any/all output checkpoints", async () => {
    const saved = artifact();
    const value: Checkpoint = { kind: "value", targetId: "member-id-input", operator: "equals", expected: { source: "input", name: "member_id" }, timeoutMs: 1 };
    saved.successCondition = { kind: "all", conditions: [value, { kind: "any", conditions: [
      { kind: "output", outputName: "savings_balance", operator: "equals", expected: { source: "literal", value: 0 }, timeoutMs: 1 },
      { kind: "output", outputName: "savings_balance", operator: "defined", timeoutMs: 1 },
    ] }] };
    const adapter = surface();
    expect((await new ReplayCoordinator(adapter).run(saved, inputs)).status).toBe("success");
    expect(adapter.evaluate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ expected: { source: "literal", value: "12345" } }));
  });
});

describe("strict values and policy matching", () => {
  it.each(["", "NaN", "12 dollars", "1,2.00", "Infinity"])("rejects malformed currency %j", (value) => {
    expect(() => transform(value, "currency_to_number")).toThrow();
  });
  it("anchors paths and rejects credentials, scheme and encoded separator bypasses", () => {
    const policy = artifact().policy;
    expect(locationAllowed(policy, "http://127.0.0.1:3000/members/12345")).toBe(true);
    for (const url of ["http://127.0.0.1:3000/member-search-extra", "http://user:pass@127.0.0.1:3000/member-search", "file:///member-search", "http://127.0.0.1:3000/members%2Fsecret", "http://127.0.0.1:3000.evil/member-search"]) expect(locationAllowed(policy, url)).toBe(false);
  });
});
