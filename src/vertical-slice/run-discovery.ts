import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PlaywrightSurfaceAdapter } from "../adapters/index.js";
import { startLegacyBankServer } from "../demo/legacy-bank-server.js";
import { DiscoveryCoordinator } from "../discovery/coordinator.js";
import { OpenAIDiscoveryModel } from "../discovery/openai-model.js";
import { compileDiscovery } from "../discovery/compiler.js";
import { writeDiscoveryEvidence } from "../discovery/evidence.js";
import { DiscoveryError, type DiscoveryModel } from "../discovery/contracts.js";
import { ReplayCoordinator } from "../replay/index.js";
import { memberSavingsDiscoveryRequest } from "./discovery-request.js";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
if (!process.env.OPENAI_API_KEY) {
  console.error("Live discovery not run: OPENAI_API_KEY is unavailable. No discovery evidence was fabricated.");
  process.exitCode = 1;
} else {
  const server = await startLegacyBankServer();
  const provider = new OpenAIDiscoveryModel({ apiKey: process.env.OPENAI_API_KEY });
  let modelCalls = 0;
  const model: DiscoveryModel = { identity: provider.identity, decide: (...args) => { modelCalls++; return provider.decide(...args); } };
  const coordinator = new DiscoveryCoordinator(new PlaywrightSurfaceAdapter(), model);
  let interventionId: string | undefined;
  try {
    // One real discovery attempt; no hand-authored capability or scripted-model fallback.
    const run = await coordinator.run(memberSavingsDiscoveryRequest(server.baseUrl));
    interventionId = run.intervention?.id;
    const directory = resolve("evidence/runtime/discovery", run.id);
    await writeDiscoveryEvidence(run, directory);
    console.log(`Discovery evidence (raw, ignored): ${directory}`);
    if (run.status !== "success") throw new DiscoveryError(run.code ?? "intervention_required");
    const artifact = compileDiscovery(run);
    const artifactPath = resolve(directory, "capability.json");
    const serialized = JSON.stringify(artifact, null, 2);
    await writeFile(artifactPath, serialized, { mode: 0o600 });
    const callsBeforeReplay = modelCalls;
    const replay = await new ReplayCoordinator(new PlaywrightSurfaceAdapter(), { allowDraft: true }).run(JSON.parse(serialized), { member_id: "67890" });
    await writeFile(resolve(directory, "replay.raw.json"), JSON.stringify({ redacted: false, invocationInputs: { member_id: "67890" }, result: replay }, null, 2), { mode: 0o600 });
    const verified = replay.status === "success" && replay.outputs.savings_balance === 8765.43 && modelCalls === callsBeforeReplay;
    const summary = { provider: model.identity, genuineApiDiscovery: true, discoveryRunId: run.id,
      discoveryActions: run.actions.map(action => action.decision.kind), modelTurns: modelCalls,
      artifactPath, replayStatus: replay.status, replayModelCalls: modelCalls - callsBeforeReplay, verified,
      rawEvidence: ["discovery-run.raw.json", "observation-*.png", "replay.raw.json"], sanitizedEvidence: ["tool-trace.sanitized.json"] };
    await writeFile(resolve(directory, "manifest.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(summary, null, 2));
    if (!verified) process.exitCode = 1;
  } catch (error) {
    console.error(`Discovery proof stopped: ${error instanceof DiscoveryError ? error.code : "integration_error"}. No automatic retry was attempted.`);
    process.exitCode = 1;
  } finally {
    // This smoke CLI has no operator UI. Library callers may retain the same live handoff instead.
    if (interventionId) await coordinator.releaseHandoff(interventionId);
    await server.close();
  }
}
