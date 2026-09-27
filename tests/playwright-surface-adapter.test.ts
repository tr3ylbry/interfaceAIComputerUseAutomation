import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlaywrightSurfaceAdapter } from "../src/adapters/index.js";
import {
  startLegacyBankServer,
  type LegacyBankServer,
} from "../src/demo/legacy-bank-server.js";
import {
  memberIdTarget,
  runMemberSavingsLookup,
} from "../src/vertical-slice/member-savings.js";

describe("PlaywrightSurfaceAdapter", () => {
  let server: LegacyBankServer | undefined;
  let evidenceDirectory: string | undefined;

  beforeAll(async () => {
    server = await startLegacyBankServer();
    evidenceDirectory = await mkdtemp(join(tmpdir(), "interface-ai-evidence-"));
  });

  afterAll(async () => {
    await server?.close();
    if (evidenceDirectory) await rm(evidenceDirectory, { recursive: true, force: true });
  });

  function createAdapter(): PlaywrightSurfaceAdapter {
    return new PlaywrightSurfaceAdapter({
      headless: true,
      ...(evidenceDirectory ? { evidenceDirectory } : {}),
      actionTimeoutMs: 2_000,
    });
  }

  it("tries locator strategies in declared order and records the successful fallback", async () => {
    const adapter = createAdapter();
    const session = await adapter.open({
      surfaceKind: "web",
      entryPoint: `${requiredServer().baseUrl}/member-search`,
    });

    try {
      const resolved = await adapter.resolveTarget(session, memberIdTarget);
      expect(resolved.targetId).toBe("member-id-input");
      expect(resolved.strategyIndex).toBe(2);
    } finally {
      await adapter.close(session);
    }
  });

  it("fails deterministically after exhausting every target strategy", async () => {
    const adapter = createAdapter();
    const session = await adapter.open({
      surfaceKind: "web",
      entryPoint: `${requiredServer().baseUrl}/member-search`,
    });

    try {
      await expect(
        adapter.resolveTarget(session, {
          id: "missing-control",
          description: "A control that does not exist",
          strategies: [
            { kind: "text", text: "Definitely absent", exact: true },
            { kind: "selector", engine: "css", selector: ".also-absent" },
          ],
        }),
      ).rejects.toMatchObject({ code: "target_not_found" });
    } finally {
      await adapter.close(session);
    }
  });

  it("executes fill/select and evaluates value, text, URL, and composite checkpoints", async () => {
    const adapter = createAdapter();
    const session = await adapter.open({
      surfaceKind: "web",
      entryPoint: `${requiredServer().baseUrl}/member-search`,
    });

    try {
      const member = await adapter.resolveTarget(session, memberIdTarget);
      expect(
        await adapter.execute(session, {
          kind: "fill",
          targetRef: member.runtimeRef,
          value: "12345",
          clearFirst: true,
        }),
      ).toMatchObject({ ok: true });

      const branch = await adapter.resolveTarget(session, {
        id: "branch-select",
        description: "Home branch filter",
        strategies: [{ kind: "selector", engine: "css", selector: "select[name='branch']" }],
      });
      expect(
        await adapter.execute(session, {
          kind: "select",
          targetRef: branch.runtimeRef,
          value: "downtown",
        }),
      ).toMatchObject({ ok: true, value: ["downtown"] });

      await expect(
        adapter.evaluate(session, {
          kind: "all",
          conditions: [
            {
              kind: "value",
              targetId: "member-id-input",
              operator: "equals",
              expected: { source: "literal", value: "12345" },
              timeoutMs: 500,
            },
            {
              kind: "url",
              operator: "contains",
              expected: "/member-search",
              timeoutMs: 500,
            },
          ],
        }),
      ).resolves.toMatchObject({ matched: true });
    } finally {
      await adapter.close(session);
    }
  });

  it("transfers and reacquires the same live page without split ownership", async () => {
    const adapter = createAdapter();
    const session = await adapter.open({
      surfaceKind: "web",
      entryPoint: `${requiredServer().baseUrl}/member-search`,
    });

    try {
      const stale = await adapter.resolveTarget(session, memberIdTarget);
      const before = adapter.getSessionSnapshot(session);
      await adapter.relinquishToHuman(session, "intervention-1");
      const during = adapter.getSessionSnapshot(session);

      expect(during).toMatchObject({
        sessionId: before.sessionId,
        pageIdentity: before.pageIdentity,
        phase: "human_control",
        owner: "human",
        epoch: 2,
      });
      expect(
        await adapter.execute(session, {
          kind: "navigate",
          destination: `${requiredServer().baseUrl}/member-search`,
        }),
      ).toMatchObject({ ok: false, error: { code: "session_not_owned" } });
      await expect(adapter.reacquireFromHuman(session, "wrong-intervention")).rejects.toMatchObject({
        code: "intervention_mismatch",
      });

      await adapter.reacquireFromHuman(session, "intervention-1");
      expect(await adapter.execute(session, { kind: "fill", targetRef: stale.runtimeRef, value: "stale", clearFirst: true }))
        .toMatchObject({ ok: false, error: { code: "unknown_target_ref" } });
      const after = adapter.getSessionSnapshot(session);
      expect(after).toMatchObject({
        sessionId: before.sessionId,
        pageIdentity: before.pageIdentity,
        phase: "automation_running",
        owner: "automation",
        epoch: 4,
      });
      expect(after.controlHistory.map(({ phase }) => phase)).toEqual([
        "automation_running",
        "paused_for_intervention",
        "human_control",
        "resuming_automation",
        "automation_running",
      ]);
    } finally {
      await adapter.close(session);
    }
  });

  it("rejects handoff while an action is in flight", async () => {
    const adapter = createAdapter();
    const session = await adapter.open({ surfaceKind: "web", entryPoint: `${requiredServer().baseUrl}/member-search` });
    try {
      const target = await adapter.resolveTarget(session, memberIdTarget);
      const action = adapter.execute(session, { kind: "fill", targetRef: target.runtimeRef, value: "12345", clearFirst: true });
      await expect(adapter.relinquishToHuman(session, "overlap")).rejects.toMatchObject({ code: "session_busy" });
      expect(await action).toMatchObject({ ok: true });
      expect(adapter.getSessionSnapshot(session).owner).toBe("automation");
    } finally { await adapter.close(session); }
  });

  it("returns the savings balance through the iframe-backed success path", async () => {
    const result = await runMemberSavingsLookup(
      createAdapter(),
      requiredServer().baseUrl,
      "12345",
      "success",
    );
    expect(result).toMatchObject({ status: "success", savingsBalance: 4321.09 });
    if (result.status === "success") {
      expect(
        result.events.find(
          (event) => event.type === "target_resolved" && event.targetId === "member-id-input",
        ),
      ).toMatchObject({ strategyIndex: 2 });
    }
  });

  it("distinguishes business, recoverable, and hard outcomes", async () => {
    const notFound = await runMemberSavingsLookup(
      createAdapter(),
      requiredServer().baseUrl,
      "99999",
      "not-found",
    );
    expect(notFound).toMatchObject({ status: "business_outcome", code: "MEMBER_NOT_FOUND" });

    const recovered = await runMemberSavingsLookup(
      createAdapter(),
      requiredServer().baseUrl,
      "12345",
      "slow",
    );
    expect(recovered).toMatchObject({ status: "success", savingsBalance: 4321.09 });
    if (recovered.status === "success") {
      expect(recovered.events.some((event) => event.type === "recoverable_condition")).toBe(true);
    }

    const denied = await runMemberSavingsLookup(
      createAdapter(),
      requiredServer().baseUrl,
      "12345",
      "permission-denied",
    );
    expect(denied).toMatchObject({ status: "failure", code: "permission_denied" });
    if (denied.status === "failure") expect(denied.evidence).toHaveLength(2);
  });

  it("pauses the risky-dialog path while preserving the live session", async () => {
    const adapter = createAdapter();
    const result = await runMemberSavingsLookup(
      adapter,
      requiredServer().baseUrl,
      "12345",
      "intervention",
    );
    expect(result.status).toBe("intervention_required");
    if (result.status !== "intervention_required") return;

    try {
      expect(adapter.getSessionSnapshot(result.session)).toMatchObject({
        phase: "human_control",
        owner: "human",
      });
      await adapter.reacquireFromHuman(result.session, result.interventionId);
      expect(adapter.getSessionSnapshot(result.session)).toMatchObject({
        phase: "automation_running",
        owner: "automation",
      });
    } finally {
      await adapter.close(result.session);
    }
  });

  function requiredServer(): LegacyBankServer {
    if (!server) throw new Error("Legacy bank server did not start");
    return server;
  }
});
