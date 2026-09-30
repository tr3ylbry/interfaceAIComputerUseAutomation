import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { PlaywrightSurfaceAdapter } from "../adapters/index.js";
import { CapabilityArtifactSchema, type ReplayEvent } from "../contracts/index.js";
import { startLegacyBankServer } from "../demo/legacy-bank-server.js";
import { ReplayCoordinator } from "../replay/index.js";
import { handoffProjection, validatePublicEvidence } from "../evidence/publication.js";
import { publishEvidenceBundle } from "../evidence/bundle.js";
import { assertPrivateEvidenceDestination } from "../evidence/private-destination.js";
import { completeBankHandoff } from "./handoff-completion.js";
import fixture from "../../examples/member-savings-balance.capability.json" with { type: "json" };

if (!stdin.isTTY) throw new Error("Run demo:handoff in an interactive terminal with a graphical desktop");
const terminal = createInterface({ input: stdin, output: stdout });
const server = await startLegacyBankServer();
const adapter = new PlaywrightSurfaceAdapter({ headless: false });
const coordinator = new ReplayCoordinator(adapter, { allowDraft: true });
let interventionId: string | undefined;
let directory: string | undefined;
const raw: Record<string, unknown> = { redacted: false, acceptance: "operator_reported_manual", modelCalls: 0 };
const signal = new AbortController();
terminal.on("SIGINT", () => signal.abort());
const question = (prompt: string) => terminal.question(prompt, { signal: signal.signal });
function controlSnapshot(snapshot: ReturnType<PlaywrightSurfaceAdapter["getSessionSnapshot"]>) {
  // Even private handoff records do not copy operator-controlled URL paths/queries.
  return { sessionId: snapshot.sessionId, pageIdentity: snapshot.pageIdentity, phase: snapshot.phase,
    owner: snapshot.owner, epoch: snapshot.epoch, controlHistory: snapshot.controlHistory };
}
try {
  const artifact = CapabilityArtifactSchema.parse(fixture);
  artifact.target.entryPoint = `${server.baseUrl}/member-search?scenario=intervention`;
  artifact.policy.allowedOrigins = [server.baseUrl];
  const result = await coordinator.run(artifact, { member_id: "12345" });
  if (result.status === "intervention_required") interventionId = result.interventionId;
  raw.interventionResult = result;
  const destination = join("evidence/runtime/handoff", result.runId);
  await assertPrivateEvidenceDestination(destination);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  directory = destination;
  if (result.status !== "intervention_required") throw new Error("Expected operator intervention");
  interventionId = result.interventionId;
  const handoff = coordinator.getHandoff(interventionId)!;
  const before = adapter.getSessionSnapshot(handoff.session);
  raw.before = controlSnapshot(before);
  raw.phase = "waiting_for_human";
  console.log("Automation paused. In the SAME browser, personally click ‘Operator reviewed’.\nDo not navigate away or click Account Information; automation will complete that work. No API calls occur.");
  const answer = await question("After your manual click, type return and press Enter to hand control back (anything else aborts): ");
  if (answer.trim() !== "return") throw new Error("Operator aborted");
  const handbackAt = new Date().toISOString();
  raw.handbackAt = handbackAt;
  raw.phase = "reacquiring";
  raw.recording = adapter.getHumanRecording(handoff.session, interventionId);
  await adapter.reacquireFromHuman(handoff.session, interventionId);
  const recording = adapter.getHumanRecording(handoff.session, interventionId);
  if (!recording.actions.length || recording.incomplete) throw new Error("No complete manual action record");
  const after = adapter.getSessionSnapshot(handoff.session);
  raw.after = controlSnapshot(after);
  const events: ReplayEvent[] = [];
  raw.completionEvents = events;
  raw.phase = "verifying_and_completing";
  const balance = await completeBankHandoff(adapter, handoff, artifact.policy, events);
  raw.savingsBalance = balance;
  if (balance !== 4321.09) throw new Error("Unexpected fixture balance");
  const finishedAt = new Date().toISOString();
  raw.status = "success";
  raw.phase = "completed";
  const candidate = handoffProjection({ runId: result.runId, requestedAt: handoff.request.createdAt, handbackAt, finishedAt,
    acceptance: "operator_reported_manual", recording, control: [...after.controlHistory], events, outputVerified: true,
    sameSession: before.sessionId === after.sessionId, samePage: before.pageIdentity === after.pageIdentity });
  const inventory = { sensitiveValues: ["12345", 4321.09, "$4,321.09"], secretValues: process.env.OPENAI_API_KEY ? [process.env.OPENAI_API_KEY] : [] };
  const checked = validatePublicEvidence(candidate, inventory);
  const utf8 = JSON.stringify(raw, null, 2);
  await writeFile(join(directory, "handoff.raw.json"), utf8, { mode: 0o600 });
  await writeFile(join(directory, checked.filename), checked.utf8, { mode: 0o600 });
  console.log(`Completion SUCCESS: savings_balance = ${balance}; same page/session; zero model calls.\nPrivate evidence: ${directory}\nValidated value-free candidate follows:\n${checked.utf8}`);
  await coordinator.releaseHandoff(interventionId);
  interventionId = undefined;
  if ((await question("Review the candidate above. Type publish and Enter to publish only those safe fields, or Enter to keep private: ")).trim() === "publish") {
    const published = await publishEvidenceBundle(process.cwd(), { runId: result.runId, reviewedAt: new Date().toISOString(), files: [candidate],
      sources: [{ file: "handoff.raw.json", bytes: Buffer.byteLength(utf8), sha256: createHash("sha256").update(utf8).digest("hex"), withheld: true }] }, inventory);
    console.log(`Published: ${relative(process.cwd(), published)} (not committed). Report your personal acceptance result before marking the requirement proven.`);
  }
} catch {
  raw.status = "failure_or_aborted";
  console.error("Handoff acceptance stopped. No success claim. Private evidence retained where a run started.");
  process.exitCode = 1;
} finally {
  try {
    if (interventionId) {
      const retained = coordinator.getHandoff(interventionId);
      if (retained) {
        raw.recording = adapter.getHumanRecording(retained.session, interventionId);
        raw.finalControl = controlSnapshot(adapter.getSessionSnapshot(retained.session));
      }
      await coordinator.releaseHandoff(interventionId);
    }
    if (directory) await writeFile(join(directory, "handoff.raw.json"), JSON.stringify(raw, null, 2), { mode: 0o600 });
  } finally {
    terminal.close();
    await server.close();
  }
}
