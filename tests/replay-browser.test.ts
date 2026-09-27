import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PlaywrightSurfaceAdapter } from "../src/adapters/index.js";
import { startLegacyBankServer, type LegacyBankServer } from "../src/demo/legacy-bank-server.js";
import { CapabilityArtifactSchema, ReplayResultSchema } from "../src/contracts/index.js";
import { ReplayCoordinator, type ReplayOptions } from "../src/replay/index.js";
import fixture from "../examples/member-savings-balance.capability.json" with { type: "json" };

describe("saved artifact against the legacy proxy", () => {
  let server: LegacyBankServer | undefined;
  let evidenceDirectory: string | undefined;
  beforeAll(async () => {
    evidenceDirectory = await mkdtemp(join(tmpdir(), "replay-evidence-"));
    server = await startLegacyBankServer();
  });
  afterAll(async () => {
    await server?.close();
    if (evidenceDirectory) await rm(evidenceDirectory, { recursive: true, force: true });
  });
  function setup(scenario: string, options: ReplayOptions = {}) {
    const saved = CapabilityArtifactSchema.parse(fixture);
    saved.target.entryPoint = `${server!.baseUrl}/member-search?scenario=${scenario}`;
    saved.policy.allowedOrigins = [server!.baseUrl];
    const adapter = new PlaywrightSurfaceAdapter({ evidenceDirectory: evidenceDirectory! });
    const coordinator = new ReplayCoordinator(adapter, { allowDraft: true, captureRawEvidence: true, ...options });
    return { saved, adapter, coordinator };
  }

  it.each([
    ["success", "success", undefined],
    ["not-found", "business_outcome", "MEMBER_NOT_FOUND"],
    ["slow", "success", undefined],
    ["busy-always", "failure", "recovery_exhausted"],
    ["permission-denied", "failure", "permission_denied"],
  ] as const)("replays %s with the declared terminal semantics", async (scenario, status, code) => {
    const { saved, adapter, coordinator } = setup(scenario);
    const execute = vi.spyOn(adapter, "execute");
    const close = vi.spyOn(adapter, "close");
    const result = await coordinator.run(saved, { member_id: "12345" });
    expect(ReplayResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({ status, ...(code ? { code } : {}) });
    if (result.status === "success") expect(result.outputs.savings_balance).toBe(4321.09);
    expect(result.events).toContainEqual(expect.objectContaining({ type: "target_resolved", targetId: "member-id-input", strategyIndex: 2 }));
    const recoveries = result.events.filter((event) => event.type === "recoverable_condition");
    if (scenario === "slow") expect(recoveries.map((event) => event.condition.recovered)).toEqual([false, true]);
    if (scenario === "busy-always") {
      expect(recoveries.map((event) => event.condition.attempt)).toEqual([1, 2]);
      expect(execute).toHaveBeenCalledTimes(4); // fill, search, two declared retries
    }
    if (result.status === "failure") {
      expect(result.stepId).toBe("search-member");
      expect(result.evidence).toHaveLength(2);
      expect(result.evidence.every((item) => item.redacted === false)).toBe(true);
      expect(result.expected).toBeDefined();
      expect(result.observed).toBeDefined();
    }
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each(["intervention", "busy-always"])("retains the same live session for %s and permits explicit return/release", async (scenario) => {
    const { saved, adapter, coordinator } = setup(scenario, { recoveryExhaustion: "intervention" });
    const original = adapter.relinquishToHuman.bind(adapter);
    let before: ReturnType<typeof adapter.getSessionSnapshot> | undefined;
    vi.spyOn(adapter, "relinquishToHuman").mockImplementation(async (session, id) => {
      before = adapter.getSessionSnapshot(session);
      return original(session, id);
    });
    const result = await coordinator.run(saved, { member_id: "12345" });
    expect(result.status).toBe("intervention_required");
    if (result.status !== "intervention_required") throw new Error("Expected intervention");
    const handoff = coordinator.getHandoff(result.interventionId)!;
    try {
      expect(handoff.request.reason).toBe(scenario === "intervention" ? "unexpected_state" : "recovery_exhausted");
      expect(adapter.getSessionSnapshot(handoff.session)).toMatchObject({ pageIdentity: before!.pageIdentity, owner: "human", epoch: 2 });
      expect(await adapter.execute(handoff.session, { kind: "navigate", destination: saved.target.entryPoint }))
        .toMatchObject({ ok: false, error: { code: "session_not_owned" } });
      await adapter.reacquireFromHuman(handoff.session, result.interventionId);
      expect(adapter.getSessionSnapshot(handoff.session)).toMatchObject({ pageIdentity: before!.pageIdentity, owner: "automation", epoch: 4 });
    } finally { await coordinator.releaseHandoff(result.interventionId); }
    expect(coordinator.getHandoff(result.interventionId)).toBeUndefined();
  });

  it("applies runtime policy to recovery clicks too", async () => {
    let clicks = 0;
    const { saved, adapter, coordinator } = setup("slow", { policy: (request) => {
      if (request.action === "click" && ++clicks > 1) return { decision: "block", reason: "No recovery writes" };
      return { decision: "allow", reason: "Approved" };
    } });
    const execute = vi.spyOn(adapter, "execute");
    expect(await coordinator.run(saved, { member_id: "12345" })).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("has no model, browser or application imports inside generic replay", async () => {
    const directory = new URL("../src/replay/", import.meta.url);
    for (const file of await readdir(directory)) {
      const source = await readFile(new URL(file, directory), "utf8");
      const imports = [...source.matchAll(/(?:from\s+|import\s*\()["']([^"']+)["']/g)].map((match) => match[1]!);
      for (const dependency of imports) {
        expect(dependency.startsWith("node:") || dependency.startsWith("./") || dependency === "../contracts/index.js").toBe(true);
      }
    }
  });
});
