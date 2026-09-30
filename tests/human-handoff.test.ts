import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HumanActionRecorder } from "../src/adapters/human-action-recorder.js";
import { PlaywrightSurfaceAdapter } from "../src/adapters/index.js";
import { CapabilityArtifactSchema, type ReplayEvent } from "../src/contracts/index.js";
import { startLegacyBankServer } from "../src/demo/legacy-bank-server.js";
import { ReplayCoordinator } from "../src/replay/coordinator.js";
import { evaluateNavigation } from "../src/replay/policy.js";
import { completeBankHandoff } from "../src/vertical-slice/handoff-completion.js";
import { handoffProjection, validatePublicEvidence } from "../src/evidence/publication.js";
import { publishEvidenceBundle, validatePublicDirectory, validateBundle } from "../src/evidence/bundle.js";
import fixture from "../examples/member-savings-balance.capability.json" with { type: "json" };

// These are browser-event simulations, NEVER genuine-human acceptance evidence.
describe("human ownership browser-event recorder (simulation)", () => {
  let browser: Browser;
  let page: Page;
  let recorder: HumanActionRecorder;
  let epoch = 2;
  let human = false;
  const interventionId = randomUUID();
  const server = createServer();
  let base: string;
  beforeAll(async () => {
    // Avoid recursive iframe fixtures.
    server.on("request", (request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end('<button>PRIVATE_CONTROL_TEXT</button><input aria-label="Private label"><select><option>a</option><option>SECRET_SELECTED_VALUE</option></select>'
        + (request.url === "/frame" ? "" : '<iframe src="/frame"></iframe>'));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    browser = await chromium.launch();
  });
  afterAll(async () => { await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto(base);
    human = false; epoch = 2;
    recorder = new HumanActionRecorder(page, value => human && value === epoch);
    await recorder.start(interventionId, epoch);
  });
  afterEach(async () => { recorder.stop(); await page.context().close(); });
  const actions = () => recorder.snapshot(interventionId).actions;

  it("ignores events without human ownership", async () => {
    await page.getByRole("button").click();
    recorder.accept({ epoch: 2, kind: "click", targetSummary: "button" });
    expect(actions()).toEqual([]);
  });
  it("records clicks with fixed safe semantics and intervention/epoch association", async () => {
    human = true;
    await page.getByRole("button").click();
    await expect.poll(() => actions().length).toBe(1);
    expect(recorder.snapshot(interventionId)).toMatchObject({ interventionId, epoch: 2,
      actions: [{ kind: "click", targetSummary: "button", redacted: true }] });
    expect(JSON.stringify(actions())).not.toContain("PRIVATE_CONTROL_TEXT");
  });
  it("records typing without reading/persisting the value or label", async () => {
    human = true;
    await page.getByRole("textbox").fill("SENSITIVE_TYPED_SECRET_4321");
    await expect.poll(() => actions().some(action => action.kind === "type")).toBe(true);
    expect(JSON.stringify(actions())).not.toMatch(/SENSITIVE|4321|Private label/);
    expect(actions().every(action => action.valueSummary === undefined && action.redacted)).toBe(true);
  });
  it("records selection without the chosen option", async () => {
    human = true;
    // A visible option avoids platform-specific native popup behavior in headless tests.
    await page.locator("select").evaluate(node => { node.setAttribute("size", "2"); });
    await page.getByRole("option", { name: "SECRET_SELECTED_VALUE" }).click();
    expect(await page.getByRole("listbox").inputValue()).toBe("SECRET_SELECTED_VALUE");
    await expect.poll(() => actions().some(action => action.kind === "select")).toBe(true);
    expect(JSON.stringify(actions())).not.toContain("SECRET_SELECTED_VALUE");
  });
  it("records child-frame clicks", async () => {
    human = true;
    await page.frameLocator("iframe").getByRole("button").click();
    await expect.poll(() => actions().some(action => action.kind === "click")).toBe(true);
  });
  it("does not attribute script-dispatched clicks to native input", async () => {
    human = true;
    await page.getByRole("button").dispatchEvent("click");
    expect(actions()).toHaveLength(0);
  });
  it("survives navigation without persisting destination query values", async () => {
    human = true;
    await page.goto(`${base}/next?private=SENSITIVE_URL_VALUE`);
    await page.getByRole("button").click();
    await expect.poll(() => actions().some(action => action.kind === "click")).toBe(true);
    expect(actions()).toContainEqual(expect.objectContaining({ kind: "navigate", targetSummary: "main-document" }));
    expect(JSON.stringify(actions())).not.toMatch(/SENSITIVE_URL|\/next|private=/);
    expect(actions().find(action => action.kind === "navigate")?.valueSummary).toBe(`${base}/[redacted]`);
  });
  it("ignores stale events and stops before automation ownership", async () => {
    human = true;
    recorder.accept({ epoch: 1, kind: "click", targetSummary: "button" });
    expect(actions()).toHaveLength(0);
    recorder.stop(); epoch = 4; human = false;
    recorder.accept({ epoch: 2, kind: "type", targetSummary: "input" });
    await page.getByRole("button").click();
    expect(actions()).toHaveLength(0);
  });
  it("rejects old events even during a subsequent human epoch", async () => {
    recorder.stop(); epoch = 6; human = true;
    const next = randomUUID();
    await recorder.start(next, epoch);
    recorder.accept({ epoch: 2, kind: "click", targetSummary: "button" });
    expect(recorder.snapshot(next).actions).toHaveLength(0);
    await page.getByRole("button").click();
    await expect.poll(() => recorder.snapshot(next).actions.length).toBe(1);
  });
  it("marks overflow incomplete instead of claiming complete evidence", () => {
    human = true;
    for (let index = 0; index < 1001; index++) recorder.accept({ epoch, kind: "type", targetSummary: "input" });
    expect(recorder.snapshot(interventionId)).toMatchObject({ incomplete: true });
    expect(actions()).toHaveLength(1000);
  });
});

describe("same-session explicit bank completion (simulation)", () => {
  it.each([true, false])("verifies manual resolution=%s before any completion action", async resolved => {
    const server = await startLegacyBankServer();
    const saved = CapabilityArtifactSchema.parse(fixture);
    saved.target.entryPoint = `${server.baseUrl}/member-search?scenario=intervention`;
    saved.policy.allowedOrigins = [server.baseUrl];
    const adapter = new PlaywrightSurfaceAdapter();
    const coordinator = new ReplayCoordinator(adapter, { allowDraft: true });
    const originalLaunch = chromium.launch.bind(chromium);
    let browser: Browser | undefined;
    const spy = vi.spyOn(chromium, "launch").mockImplementation(async options => browser = await originalLaunch(options));
    let id: string | undefined;
    try {
      const result = await coordinator.run(saved, { member_id: "12345" });
      expect(result.status).toBe("intervention_required");
      if (result.status !== "intervention_required") throw new Error("Expected intervention");
      id = result.interventionId;
      const handoff = coordinator.getHandoff(id)!;
      const before = adapter.getSessionSnapshot(handoff.session);
      const context = browser!.contexts()[0]!;
      const page = context.pages()[0]!;
      expect(await adapter.execute(handoff.session, { kind: "navigate", destination: saved.target.entryPoint }))
        .toMatchObject({ ok: false, error: { code: "session_not_owned" } });
      if (resolved) {
        await page.getByRole("button", { name: "Operator reviewed" }).click();
        await expect.poll(() => adapter.getHumanRecording(handoff.session, id!).actions.length).toBe(1);
        expect(adapter.getSessionSnapshot(handoff.session).owner).toBe("human"); // A click is not handback.
      }
      const handbackAt = new Date().toISOString();
      await adapter.reacquireFromHuman(handoff.session, id);
      const execute = vi.spyOn(adapter, "execute");
      const events: ReplayEvent[] = [];
      if (!resolved) {
        await expect(completeBankHandoff(adapter, handoff, saved.policy, events)).rejects.toThrow("checkpoint failed");
        expect(execute).not.toHaveBeenCalled();
      } else {
        expect(await completeBankHandoff(adapter, handoff, saved.policy, events)).toBe(4321.09);
        expect(execute.mock.calls.map(call => call[1].kind)).toEqual(["click", "read"]);
        const after = adapter.getSessionSnapshot(handoff.session);
        expect(after).toMatchObject({ sessionId: before.sessionId, pageIdentity: before.pageIdentity, epoch: 4, owner: "automation" });
        expect(browser!.contexts()[0]).toBe(context);
        expect(context.pages()[0]).toBe(page);
        const recording = adapter.getHumanRecording(handoff.session, id);
        expect(recording.actions).toHaveLength(1); // Post-handback automation was NOT recorded.
        const candidate = handoffProjection({ runId: result.runId, requestedAt: handoff.request.createdAt, handbackAt,
          finishedAt: new Date().toISOString(), acceptance: "automated_simulation", recording, samePage: true, sameSession: true,
          control: [...after.controlHistory], events, outputVerified: true });
        const inventory = { sensitiveValues: ["12345", 4321.09, "$4,321.09"], secretValues: [] };
        expect(validatePublicEvidence(candidate, inventory).classification).toBe("public");
        expect(validateBundle([candidate], inventory)).toHaveLength(1);
        const temporary = await mkdtemp(join(tmpdir(), "handoff-publication-test-"));
        try {
          const directory = await publishEvidenceBundle(temporary, { runId: result.runId,
            reviewedAt: new Date().toISOString(), files: [candidate], sources: [] }, inventory);
          expect((await validatePublicDirectory(directory, inventory)).map(file => file.filename).sort())
            .toEqual(["handoff.sanitized.json", "publication-manifest.json"]);
          await expect(publishEvidenceBundle(temporary, { runId: randomUUID(),
            reviewedAt: new Date().toISOString(), files: [candidate], sources: [] }, inventory)).rejects.toThrow("inconsistent_bundle");
        } finally { await rm(temporary, { recursive: true, force: true }); }
        const incomplete = JSON.parse(candidate.utf8);
        incomplete.recordingComplete = false;
        expect(() => validatePublicEvidence({ ...candidate, utf8: JSON.stringify(incomplete, null, 2) }, inventory)).toThrow("unapproved_schema");
        const invalidEpoch = JSON.parse(candidate.utf8);
        invalidEpoch.control[3].epoch = 2;
        expect(() => validatePublicEvidence({ ...candidate, utf8: JSON.stringify(invalidEpoch, null, 2) }, inventory)).toThrow("unapproved_schema");
        const data = JSON.parse(candidate.utf8);
        expect(data.runId).toBe(handoff.request.runId);
        expect(data.control.map((entry: { phase: string }) => entry.phase)).toEqual([
          "automation_running", "paused_for_intervention", "human_control", "resuming_automation", "automation_running"]);
        data.actions[0].value = "SENSITIVE_TYPED_SECRET_4321";
        expect(() => validatePublicEvidence({ ...candidate, utf8: JSON.stringify(data, null, 2) }, inventory)).toThrow("unapproved_schema");
      }
    } finally {
      spy.mockRestore();
      if (id) await coordinator.releaseHandoff(id);
      await browser?.close();
      await server.close();
    }
  }, 15000);

  it("blocks forbidden navigation during human control before any destination hit", async () => {
    let hits = 0;
    const forbidden = createServer((_req, res) => { hits++; res.end("forbidden"); });
    await new Promise<void>(resolve => forbidden.listen(0, "127.0.0.1", resolve));
    const server = await startLegacyBankServer();
    const saved = CapabilityArtifactSchema.parse(fixture);
    saved.policy.allowedOrigins = [server.baseUrl];
    const adapter = new PlaywrightSurfaceAdapter();
    const originalLaunch = chromium.launch.bind(chromium);
    let browser: Browser | undefined;
    const spy = vi.spyOn(chromium, "launch").mockImplementation(async options => browser = await originalLaunch(options));
    let session: Awaited<ReturnType<typeof adapter.open>> | undefined;
    try {
      session = await adapter.open({ surfaceKind: "web", entryPoint: `${server.baseUrl}/member-search` }, {
        navigationGuard: (source, destination) => evaluateNavigation(saved.policy, source, destination) });
      const id = randomUUID();
      await adapter.relinquishToHuman(session, id);
      await browser!.contexts()[0]!.pages()[0]!.goto(`http://127.0.0.1:${(forbidden.address() as { port: number }).port}/blocked`).catch(() => {});
      expect(hits).toBe(0);
      await expect(adapter.reacquireFromHuman(session, id)).rejects.toMatchObject({ code: "policy_violation" });
    } finally {
      spy.mockRestore();
      if (session) await adapter.close(session).catch(() => {});
      await browser?.close(); await server.close();
      await new Promise<void>(resolve => forbidden.close(() => resolve()));
    }
  });
});
