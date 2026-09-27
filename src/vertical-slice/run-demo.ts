import { PlaywrightSurfaceAdapter } from "../adapters/index.js";
import { startLegacyBankServer } from "../demo/legacy-bank-server.js";
import { ReplayCoordinator } from "../replay/index.js";
import fixture from "../../examples/member-savings-balance.capability.json" with { type: "json" };

const scenario = process.argv[2] ?? "success";
if (!["success", "not-found", "slow", "busy-always", "permission-denied", "intervention"].includes(scenario)) {
  throw new Error("Unknown demo scenario");
}
const server = await startLegacyBankServer();
const adapter = new PlaywrightSurfaceAdapter({ headless: true });
const coordinator = new ReplayCoordinator(adapter, { allowDraft: true, captureRawEvidence: true });
try {
  const artifact = structuredClone(fixture);
  artifact.target.entryPoint = `${server.baseUrl}/member-search?scenario=${scenario}`;
  artifact.policy.allowedOrigins = [server.baseUrl];
  const result = await coordinator.run(artifact, { member_id: "12345" });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "intervention_required") {
    const handoff = coordinator.getHandoff(result.interventionId)!;
    const before = adapter.getSessionSnapshot(handoff.session);
    await adapter.reacquireFromHuman(handoff.session, handoff.request.id);
    const after = adapter.getSessionSnapshot(handoff.session);
    console.log(JSON.stringify({ samePage: before.pageIdentity === after.pageIdentity,
      ownerBefore: before.owner, ownerAfter: after.owner, epochBefore: before.epoch, epochAfter: after.epoch }));
    await coordinator.releaseHandoff(result.interventionId);
  }
  const expected = scenario === "not-found" ? "business_outcome"
    : scenario === "permission-denied" || scenario === "busy-always" ? "failure"
    : scenario === "intervention" ? "intervention_required" : "success";
  if (result.status !== expected) process.exitCode = 1;
} finally {
  await server.close();
}
