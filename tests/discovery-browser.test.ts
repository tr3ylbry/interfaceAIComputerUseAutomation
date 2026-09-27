import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PlaywrightSurfaceAdapter } from "../src/adapters/index.js";
import { startLegacyBankServer, type LegacyBankServer } from "../src/demo/legacy-bank-server.js";
import { DiscoveryCoordinator } from "../src/discovery/coordinator.js";
import { compileDiscovery } from "../src/discovery/compiler.js";
import type { DiscoveryModel } from "../src/discovery/contracts.js";
import { memberSavingsDiscoveryRequest } from "../src/vertical-slice/discovery-request.js";
import { ReplayCoordinator } from "../src/replay/index.js";

describe("discovery surface and compilation (scripted model, not live API evidence)", () => {
  let server: LegacyBankServer;
  beforeAll(async () => { server = await startLegacyBankServer(); });
  afterAll(async () => { await server.close(); });

  it("compiles observed controls, then replays on a fresh session with a different member and no model calls", async () => {
    let turn = 0;
    const model = { identity: { provider: "scripted-test", model: "no-network" }, decide: vi.fn<DiscoveryModel["decide"]>().mockImplementation(async observation => {
      expect(observation.image?.base64.startsWith("iVBOR")).toBe(true);
      const ref = (predicate: (element: typeof observation.elements[number]) => boolean) => {
        const element = observation.elements.find(predicate);
        expect(element, JSON.stringify(observation.elements)).toBeDefined();
        return element!.ref;
      };
      switch (turn++) {
        case 0: return { kind: "ui_fill", targetRef: ref(element => element.role === "textbox"), value: "12345" };
        case 1: return { kind: "ui_click", targetRef: ref(element => element.name === "Search") };
        case 2: return { kind: "ui_click", targetRef: ref(element => element.name === "Account Information") };
        case 3: return { kind: "ui_read", targetRef: ref(element => element.contextText === "Savings" && !!element.text?.startsWith("$")), outputName: "savings_balance", extraction: "text" };
        default: return { kind: "finish_discovery" };
      }
    }) };
    const adapter = new PlaywrightSurfaceAdapter();
    const actual = adapter.execute.bind(adapter);
    const execute = vi.spyOn(adapter, "execute");
    const order: string[] = [];
    // Policy callback sees each action before the adapter executes it.
    execute.mockImplementation(async (...args) => { order.push("execute"); return actual(...args); });
    const coordinator = new DiscoveryCoordinator(adapter, model, { policy: request => { order.push(request.action); return { decision: "allow", reason: "Test approval" }; } });
    const run = await coordinator.run(memberSavingsDiscoveryRequest(server.baseUrl));
    expect(run.status, JSON.stringify({ code: run.code, actions: run.actions.map(action => ({ kind: action.decision.kind, executed: action.executed })) })).toBe("success");
    expect(run.outputs.savings_balance?.value).toBe(4321.09);
    expect(order).toEqual(["open", "fill", "execute", "click", "execute", "click", "execute", "extract", "execute"]);
    const artifact = compileDiscovery(run);
    expect(artifact.steps.map(step => step.action)).toEqual(["fill", "click", "click", "extract"]);
    expect(artifact.targets.at(-1)?.framePath).toEqual(['iframe[name="accountPane"]']);
    expect(artifact.targets.at(-1)?.strategies[0]).toMatchObject({ kind: "relative", anchorText: "Savings" });
    expect(JSON.stringify(artifact)).not.toContain("12345");
    expect(JSON.stringify(artifact)).not.toContain(run.actions[0]!.control!.ref);
    const replay = await new ReplayCoordinator(new PlaywrightSurfaceAdapter(), { allowDraft: true }).run(JSON.parse(JSON.stringify(artifact)), { member_id: "67890" });
    expect(replay).toMatchObject({ status: "success", outputs: { savings_balance: 8765.43 } });
    expect(model.decide).toHaveBeenCalledTimes(5);
  });

  it("expires observation refs after observation replacement and action execution", async () => {
    const adapter = new PlaywrightSurfaceAdapter();
    const session = await adapter.open(memberSavingsDiscoveryRequest(server.baseUrl).target);
    try {
      const first = await adapter.observe(session, { discovery: true });
      const stale = first.elements.find(element => element.role === "textbox")!.ref;
      const second = await adapter.observe(session, { discovery: true });
      expect(await adapter.execute(session, { kind: "fill", targetRef: stale, value: "12345", clearFirst: true })).toMatchObject({ ok: false });
      // Even a failed action invalidates outstanding observation handles.
      const staleAfterAction = second.elements.find(element => element.role === "textbox")!.ref;
      expect(await adapter.execute(session, { kind: "fill", targetRef: staleAfterAction, value: "12345", clearFirst: true })).toMatchObject({ ok: false });
      await expect(adapter.describeTarget(session, stale)).rejects.toThrow();
    } finally { await adapter.close(session); }
  });

  it("hands off the same page and invalidates discovery refs under human ownership", async () => {
    const adapter = new PlaywrightSurfaceAdapter();
    let savedRef = "";
    const model: DiscoveryModel = { identity: { provider: "scripted-test", model: "no-network" }, async decide(observation) {
      savedRef = observation.elements.find(element => element.role === "textbox")!.ref;
      return { kind: "request_human", reason: "Operator needed" };
    } };
    const handoff = vi.spyOn(adapter, "relinquishToHuman");
    const coordinator = new DiscoveryCoordinator(adapter, model);
    const run = await coordinator.run(memberSavingsDiscoveryRequest(server.baseUrl));
    expect(run.status).toBe("intervention_required");
    const state = coordinator.getHandoff(run.intervention!.id)!;
    try {
      const before = adapter.getSessionSnapshot(state.session);
      expect(handoff).toHaveBeenCalledTimes(1); expect(before.owner).toBe("human");
      expect(await adapter.execute(state.session, { kind: "fill", targetRef: savedRef, value: "12345", clearFirst: true })).toMatchObject({ ok: false });
      await adapter.reacquireFromHuman(state.session, run.intervention!.id);
      expect(adapter.getSessionSnapshot(state.session)).toMatchObject({ pageIdentity: before.pageIdentity, epoch: 4, owner: "automation" });
      expect(await adapter.execute(state.session, { kind: "fill", targetRef: savedRef, value: "12345", clearFirst: true })).toMatchObject({ ok: false });
    } finally { await coordinator.releaseHandoff(run.intervention!.id); }
  });
});
