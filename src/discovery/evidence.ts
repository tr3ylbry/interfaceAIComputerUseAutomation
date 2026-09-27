import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoveryRun } from "./contracts.js";

/** Explicit raw persistence for the fake-data integration CLI, never called by normal replay/tests. */
export async function writeDiscoveryEvidence(run: DiscoveryRun, directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const observations = [];
  for (const [index, observation] of run.observations.entries()) {
    const { image, ...snapshot } = observation;
    const screenshotPath = `observation-${index}.png`;
    if (image) await writeFile(join(directory, screenshotPath), Buffer.from(image.base64, "base64"), { mode: 0o600 });
    observations.push({ ...snapshot, ...(image ? { screenshotPath, redacted: false } : {}) });
  }
  await writeFile(join(directory, "discovery-run.raw.json"), JSON.stringify({ ...run, observations }, null, 2), { mode: 0o600 });
  // No arguments, goal, control text, values, URLs, provider body or hidden reasoning.
  const trace = { runId: run.id, model: run.model, redacted: true, status: run.status,
    turns: run.decisions.map((decision, index) => ({ turn: index + 1, tool: decision.decision.kind, observationId: decision.observationId })),
    actions: run.actions.map(action => ({ index: action.index, tool: action.decision.kind, policy: action.policy.decision, executed: action.executed })) };
  await writeFile(join(directory, "tool-trace.sanitized.json"), JSON.stringify(trace, null, 2), { mode: 0o600 });
}
