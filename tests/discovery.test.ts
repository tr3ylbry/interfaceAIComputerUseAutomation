import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapabilityArtifactSchema, type SurfaceAdapter } from "../src/contracts/index.js";
import { DiscoveryCoordinator } from "../src/discovery/coordinator.js";
import { compileDiscovery } from "../src/discovery/compiler.js";
import { DiscoveryError, type DiscoveryModel } from "../src/discovery/contracts.js";
import { memberSavingsDiscoveryRequest } from "../src/vertical-slice/discovery-request.js";
import { writeDiscoveryEvidence } from "../src/discovery/evidence.js";

function setup(decisions: unknown[] = [{ kind: "ui_read", targetRef: "control-0", outputName: "savings_balance", extraction: "text" }, { kind: "finish_discovery" }]) {
  const request = memberSavingsDiscoveryRequest("http://localhost:3000");
  const session = { id: "test-session", kind: "web" as const };
  let observed = 0;
  const adapter = {
    kind: "web" as const, supportsNavigationGuard: true,
    open: vi.fn<SurfaceAdapter["open"]>().mockResolvedValue(session),
    observe: vi.fn<SurfaceAdapter["observe"]>().mockImplementation(async () => {
      const index = observed++;
      return { id: `observation-${index}`, capturedAt: new Date().toISOString(), urlOrLocation: request.target.entryPoint,
        image: { mimeType: "image/png", base64: "fake-image-for-unit-test", redacted: false },
        elements: [{ ref: `control-${index}`, role: "textbox", name: "Inquiry", contextText: "Savings", text: "$4,321.09", visible: true, enabled: true }] };
    }),
    describeTarget: vi.fn<NonNullable<SurfaceAdapter["describeTarget"]>>().mockResolvedValue({ id: "verified", description: "Observed", strategies: [
      { kind: "text", text: "$4,321.09", exact: true }, { kind: "selector", engine: "css", selector: "input[name=memberNumber]" }] }),
    execute: vi.fn<SurfaceAdapter["execute"]>().mockResolvedValue({ ok: true, value: "$4,321.09" }),
    resolveTarget: vi.fn<SurfaceAdapter["resolveTarget"]>().mockResolvedValue({ targetId: "verified", runtimeRef: "opaque-ref", strategyIndex: 0 }),
    evaluate: vi.fn<SurfaceAdapter["evaluate"]>().mockResolvedValue({ matched: true }),
    captureEvidence: vi.fn<SurfaceAdapter["captureEvidence"]>().mockResolvedValue([]),
    close: vi.fn<SurfaceAdapter["close"]>().mockResolvedValue(),
    relinquishToHuman: vi.fn<SurfaceAdapter["relinquishToHuman"]>().mockImplementation(async (_session, interventionId) => ({ interventionId, instructions: "Review" })),
    reacquireFromHuman: vi.fn<SurfaceAdapter["reacquireFromHuman"]>().mockResolvedValue(),
  };
  const model = { identity: { provider: "scripted-test", model: "no-network" }, decide: vi.fn<DiscoveryModel["decide"]>().mockImplementation(async () => decisions.shift()) };
  return { request, adapter, model, coordinator: new DiscoveryCoordinator(adapter, model) };
}

describe("bounded discovery", () => {
  it("observes an image every turn, reads a real output, verifies finish and compiles evidence", async () => {
    const { request, adapter, model, coordinator } = setup();
    const run = await coordinator.run(request);
    expect(run.status).toBe("success");
    expect(run.outputs.savings_balance?.value).toBe(4321.09);
    expect(run.actions[0]).toMatchObject({ executed: true, beforeId: "observation-0", afterId: "observation-1", policy: { decision: "allow" } });
    expect(model.decide.mock.calls.every(([observation]) => !!observation.image)).toBe(true);
    expect(adapter.execute).toHaveBeenCalledTimes(1); expect(adapter.evaluate).toHaveBeenCalledTimes(1);
    const artifact = compileDiscovery(run);
    expect(CapabilityArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(artifact.capability.approvalState).toBe("draft");
    expect(artifact.runtimeConditions).toEqual([]); // Never invent unobserved branches.
    expect(JSON.stringify(artifact)).not.toMatch(/control-0|observation-0|4,321|4321\.09|12345/);
    expect(artifact.targets[0]?.strategies).toEqual([{ kind: "selector", engine: "css", selector: "input[name=memberNumber]" }]);
    expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it("substitutes declared concrete values and keeps the caller request unchanged", async () => {
    const { request, coordinator } = setup([{ kind: "ui_fill", targetRef: "control-0", value: "12345" },
      { kind: "ui_read", targetRef: "control-1", outputName: "savings_balance", extraction: "text" }, { kind: "finish_discovery" }]);
    const original = structuredClone(request);
    const artifact = compileDiscovery(await coordinator.run(request));
    expect(artifact.steps[0]).toMatchObject({ action: "fill", value: { source: "input", name: "member_id" } });
    expect(request).toEqual(original);
  });

  it("refuses ambiguous parameter bindings rather than guessing the caller's contract", async () => {
    const { request, coordinator } = setup([{ kind: "ui_fill", targetRef: "control-0", value: "12345" },
      { kind: "ui_read", targetRef: "control-1", outputName: "savings_balance", extraction: "text" }, { kind: "finish_discovery" }]);
    request.inputs.push({ ...request.inputs[0]!, name: "another_member" });
    const run = await coordinator.run(request);
    expect(run.status).toBe("success");
    expect(() => compileDiscovery(run)).toThrow("ambiguous_input_binding");
  });

  it("refuses output-dependent locators when no value-independent strategy was verified", async () => {
    const { request, adapter, coordinator } = setup();
    adapter.describeTarget.mockResolvedValue({ id: "value-only", description: "Observed", strategies: [{ kind: "text", text: "$4,321.09", exact: true }] });
    const run = await coordinator.run(request);
    expect(run.status).toBe("success");
    expect(() => compileDiscovery(run)).toThrow("no_value_independent_locator");
  });

  it.each([
    { metadata: "generated run ID", runId: undefined },
    // Reproduce the old whole-JSON substring assertion's false positive deterministically.
    { metadata: "unrelated run ID containing 4321 and 12345", runId: "ba6edb58-d1c0-4321-97e8-4dd1ea212345" },
  ])("labels raw evidence honestly and emits a value-free tool trace ($metadata)", async ({ runId }) => {
    const sensitiveInput = "SENSITIVE_TEST_VALUE_4321";
    const { request, coordinator } = setup([
      { kind: "ui_fill", targetRef: "control-0", value: sensitiveInput },
      { kind: "ui_read", targetRef: "control-1", outputName: "savings_balance", extraction: "text" },
      { kind: "finish_discovery" },
    ]);
    request.inputs[0]!.discoveryValue = sensitiveInput;
    const run = await coordinator.run(request);
    expect(run.status).toBe("success");
    if (runId) run.id = runId;
    const directory = await mkdtemp(join(tmpdir(), "discovery-evidence-test-"));
    try {
      await writeDiscoveryEvidence(run, directory);
      const raw = JSON.parse(await readFile(join(directory, "discovery-run.raw.json"), "utf8"));
      expect(raw.redacted).toBe(false);
      expect(raw.request.inputs[0].discoveryValue).toBe(sensitiveInput);
      expect(raw.actions[0].decision.value).toBe(sensitiveInput);
      expect(raw.outputs.savings_balance).toMatchObject({ value: 4321.09, rawValue: "$4,321.09" });
      expect(raw.observations[0]).toMatchObject({ screenshotPath: "observation-0.png", redacted: false });
      expect(raw.observations[0]).not.toHaveProperty("image");
      const trace = JSON.parse(await readFile(join(directory, "tool-trace.sanitized.json"), "utf8"));
      // Exact nested shape rejects added payload fields or values, including input arguments,
      // outputs, control evidence, goals, URLs and images, without scanning unrelated IDs.
      expect(trace).toStrictEqual({
        runId: run.id,
        model: { provider: "scripted-test", model: "no-network" },
        redacted: true,
        status: "success",
        turns: [
          { turn: 1, tool: "ui_fill", observationId: "observation-0" },
          { turn: 2, tool: "ui_read", observationId: "observation-1" },
          { turn: 3, tool: "finish_discovery", observationId: "observation-2" },
        ],
        actions: [
          { index: 0, tool: "ui_fill", policy: "allow", executed: true },
          { index: 1, tool: "ui_read", policy: "allow", executed: true },
        ],
      });
      expect(JSON.stringify(trace)).not.toContain(sensitiveInput);
      if (process.platform !== "win32") expect((await stat(join(directory, "discovery-run.raw.json"))).mode & 0o777).toBe(0o600);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    [{ kind: "finish_discovery" }, "success_unverified"],
    [{ kind: "ui_navigate", destination: "https://forbidden.test/" }, "policy_violation"],
    [{ kind: "ui_fill", targetRef: "control-0", value: "not-authorized" }, "policy_violation"],
    [{ kind: "ui_read", targetRef: "invented", outputName: "savings_balance", extraction: "text" }, "policy_violation"],
    [{ kind: "ui_read", targetRef: "control-0", outputName: "invented", extraction: "text" }, "unknown_output"],
    [[{ kind: "ui_click", targetRef: "control-0" }], "invalid_model_decision"],
    [{ kind: "ui_click", targetRef: "control-0", javascript: "bad" }, "invalid_model_decision"],
  ])("rejects invalid/unsafe proposals without execution: %j", async (decision, code) => {
    const { request, adapter, coordinator } = setup([decision]);
    const run = await coordinator.run(request);
    expect(run).toMatchObject({ status: "failure", code });
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(() => compileDiscovery(run)).toThrow("unverified_discovery_run");
  });

  it("enforces policy before every execute call and permits additional runtime restrictions", async () => {
    const { request, adapter, model } = setup();
    const order: string[] = [];
    adapter.execute.mockImplementation(async () => { order.push("execute"); return { ok: true, value: "$4,321.09" }; });
    const coordinator = new DiscoveryCoordinator(adapter, model, { policy: request => {
      order.push(request.action); return { decision: "block", reason: "Restricted" };
    } });
    expect(await coordinator.run(request)).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(order).toEqual(["open"]); expect(adapter.open).not.toHaveBeenCalled();
  });

  it.each(["request_human", "ui_click"])("transfers the live session for %s without executing the proposal", async (kind) => {
    const decision = kind === "ui_click" ? { kind, targetRef: "control-0" } : { kind, reason: "Ambiguous" };
    const { request, adapter, coordinator } = setup([decision]);
    const run = await coordinator.run(request);
    expect(run.status).toBe("intervention_required"); expect(adapter.execute).not.toHaveBeenCalled();
    expect(adapter.close).not.toHaveBeenCalled();
    expect(coordinator.getHandoff(run.intervention!.id)?.session.id).toBe("test-session");
    await coordinator.releaseHandoff(run.intervention!.id); expect(adapter.close).toHaveBeenCalledTimes(1);
  });

  it("categorically blocks risky actions when the policy says block", async () => {
    const { request, adapter, coordinator } = setup([{ kind: "ui_click", targetRef: "control-0" }]);
    request.policy.irreversibleActionPolicy = "block";
    expect(await coordinator.run(request)).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(adapter.relinquishToHuman).not.toHaveBeenCalled();
  });

  it("prevents a runtime-policy-denied action after permitting session opening", async () => {
    const { request, adapter, model } = setup();
    const decisions: string[] = [];
    const coordinator = new DiscoveryCoordinator(adapter, model, { policy: action => {
      decisions.push(action.action); return { decision: action.action === "open" ? "allow" : "block", reason: "Runtime restriction" };
    } });
    expect(await coordinator.run(request)).toMatchObject({ code: "policy_violation" });
    expect(decisions).toEqual(["open", "extract"]);
    expect(adapter.execute).not.toHaveBeenCalled(); expect(adapter.describeTarget).not.toHaveBeenCalled();
  });

  it("pauses unexpected dialogs before sending another observation to the model", async () => {
    const { request, adapter, model, coordinator } = setup();
    const original = adapter.observe.getMockImplementation()!;
    adapter.observe.mockImplementation(async (...args) => ({ ...await original(...args), elements: [{ ref: "warning", role: "dialog", visible: true, enabled: true }] }));
    const run = await coordinator.run(request);
    expect(run.status).toBe("intervention_required"); expect(model.decide).not.toHaveBeenCalled();
    await coordinator.releaseHandoff(run.intervention!.id);
  });

  it("cleans up a session whose opening completes after the deadline", async () => {
    vi.useFakeTimers();
    try {
      const { request, adapter, coordinator } = setup();
      let opened!: (session: { id: string; kind: "web" }) => void;
      adapter.open.mockImplementation(() => new Promise(resolve => { opened = resolve; }));
      const pending = coordinator.run(request);
      await vi.advanceTimersByTimeAsync(request.limits.timeoutMs);
      expect(await pending).toMatchObject({ code: "timeout" });
      opened({ id: "late-session", kind: "web" });
      await vi.advanceTimersByTimeAsync(0);
      expect(adapter.close).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("stops at the decision budget without asking the model again", async () => {
    const { request, model, coordinator } = setup(); request.limits.maxSteps = 1;
    expect(await coordinator.run(request)).toMatchObject({ status: "failure", code: "max_steps" });
    expect(model.decide).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung model at the deadline and closes the session", async () => {
    vi.useFakeTimers();
    try {
      const { request, adapter, model, coordinator } = setup();
      model.decide.mockImplementation(() => new Promise(() => undefined));
      const pending = coordinator.run(request);
      await vi.advanceTimersByTimeAsync(request.limits.timeoutMs);
      expect(await pending).toMatchObject({ status: "failure", code: "timeout" });
      expect(adapter.close).toHaveBeenCalledTimes(1);
      expect(model.decide.mock.calls[0]?.[2].aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("does not execute a model reply arriving after the deadline", async () => {
    let now = 0;
    const { request, adapter, model } = setup();
    model.decide.mockImplementation(async () => { now = request.limits.timeoutMs; return { kind: "ui_fill", targetRef: "control-0", value: "12345" }; });
    expect(await new DiscoveryCoordinator(adapter, model, { clock: () => now }).run(request)).toMatchObject({ code: "timeout" });
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it("does not accept a claim of success when the live source no longer matches", async () => {
    const { request, adapter, coordinator } = setup(); adapter.evaluate.mockResolvedValue({ matched: false });
    expect(await coordinator.run(request)).toMatchObject({ status: "failure", code: "success_unverified" });
  });

  it("stops safely on model dead ends, surface errors and invalid output types", async () => {
    for (const kind of ["model", "surface", "output"] as const) {
      const { request, adapter, model, coordinator } = setup();
      if (kind === "model") model.decide.mockRejectedValue(new DiscoveryError("model_dead_end"));
      if (kind === "surface") adapter.execute.mockResolvedValue({ ok: false, error: { code: "surface_error", message: "Raw sensitive error" } });
      if (kind === "output") adapter.execute.mockResolvedValue({ ok: true, value: "not a balance" });
      const result = await coordinator.run(request);
      expect(result.status).toBe("failure"); expect(result.code).toBe({ model: "model_dead_end", surface: "surface_error", output: "invalid_output" }[kind]);
      expect(adapter.close).toHaveBeenCalledTimes(1);
    }
  });

  it("requires model-processing consent before opening", async () => {
    const { request, adapter, model, coordinator } = setup(); request.approval.allowModelProcessing = false;
    expect(await coordinator.run(request)).toMatchObject({ code: "model_processing_not_approved" });
    expect(adapter.open).not.toHaveBeenCalled(); expect(model.decide).not.toHaveBeenCalled();
  });

  it("rejects invalid typed discovery inputs before opening", async () => {
    const { request, adapter, coordinator } = setup(); request.inputs[0]!.discoveryValue = 12345;
    await expect(coordinator.run(request)).rejects.toMatchObject({ code: "invalid_request" });
    expect(adapter.open).not.toHaveBeenCalled();
  });
});
