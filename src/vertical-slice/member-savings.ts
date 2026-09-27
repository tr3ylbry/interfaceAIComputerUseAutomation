import type {
  EvidenceRef,
  ReplayEvent,
  SurfaceAdapter,
  SurfaceSession,
  TargetDescriptor,
} from "../contracts/index.js";

export type MemberSavingsResult =
  | {
      status: "success";
      savingsBalance: number;
      events: ReplayEvent[];
    }
  | {
      status: "business_outcome";
      code: "MEMBER_NOT_FOUND";
      events: ReplayEvent[];
    }
  | {
      status: "intervention_required";
      interventionId: string;
      session: SurfaceSession;
      events: ReplayEvent[];
    }
  | {
      status: "failure";
      code: "permission_denied" | "checkpoint_failed" | "surface_error";
      message: string;
      evidence: EvidenceRef[];
      events: ReplayEvent[];
    };

export type LookupScenario =
  | "success"
  | "not-found"
  | "slow"
  | "permission-denied"
  | "intervention";

export const memberIdTarget: TargetDescriptor = {
  id: "member-id-input",
  description: "Legacy member-number search field",
  strategies: [
    { kind: "accessibility", role: "textbox", name: "Member ID", exact: true },
    { kind: "label", label: "Member ID", exact: true },
    { kind: "selector", engine: "css", selector: "input[name='memberNumber']" },
  ],
};

export const searchButtonTarget: TargetDescriptor = {
  id: "member-search-button",
  description: "Member search submit control",
  strategies: [
    { kind: "accessibility", role: "button", name: "Search", exact: true },
    { kind: "selector", engine: "css", selector: "input[type='submit']" },
  ],
};

export const accountInformationTarget: TargetDescriptor = {
  id: "account-information-link",
  description: "Account information navigation link",
  strategies: [
    { kind: "accessibility", role: "link", name: "Account Information", exact: true },
    { kind: "text", text: "Account Information", exact: true },
  ],
};

export const savingsBalanceTarget: TargetDescriptor = {
  id: "savings-balance-value",
  description: "Savings available balance in the legacy account frame",
  framePath: ["iframe[name='accountPane']"],
  strategies: [
    {
      kind: "relative",
      anchorText: "Savings",
      relation: "nearest",
      controlHint: "value",
      ordinal: 1,
    },
    {
      kind: "selector",
      engine: "xpath",
      selector: "//tr[td[normalize-space()='Savings']]//span[contains(@class, 'balance-value')]",
    },
  ],
};

export async function runMemberSavingsLookup(
  adapter: SurfaceAdapter,
  baseUrl: string,
  memberId: string,
  scenario: LookupScenario = "success",
): Promise<MemberSavingsResult> {
  const events: ReplayEvent[] = [];
  const session = await adapter.open({
    surfaceKind: "web",
    entryPoint: `${baseUrl}/member-search?scenario=${encodeURIComponent(scenario)}`,
  });
  let keepSessionOpen = false;

  try {
    const memberInput = await resolve(adapter, session, memberIdTarget, "fill-member-id", events);
    assertAction(
      await adapter.execute(session, {
        kind: "fill",
        targetRef: memberInput.runtimeRef,
        value: memberId,
        clearFirst: true,
      }),
    );

    const searchButton = await resolve(
      adapter,
      session,
      searchButtonTarget,
      "search-member",
      events,
    );
    assertAction(
      await adapter.execute(session, { kind: "click", targetRef: searchButton.runtimeRef }),
    );

    let observation = await adapter.observe(session);
    if (observation.textSummary?.includes("Core host is temporarily busy")) {
      const maxAttempts = 2;
      const retryTarget: TargetDescriptor = {
        id: "retry-inquiry",
        description: "Known host-busy recovery action",
        strategies: [{ kind: "text", text: "Retry inquiry", exact: true }],
      };
      const retry = await resolve(adapter, session, retryTarget, "recover-host-busy", events);
      assertAction(await adapter.execute(session, { kind: "click", targetRef: retry.runtimeRef }));
      events.push({
        type: "recoverable_condition",
        at: now(),
        condition: {
          classification: "recoverable",
          code: "transient_load",
          stepId: "search-member",
          attempt: 1,
          maxAttempts,
          message: "Known host-busy interstitial was retried",
          recovered: true,
        },
      });
      observation = await adapter.observe(session);
    }

    if (observation.textSummary?.includes("Member not found")) {
      const notFoundTarget: TargetDescriptor = {
        id: "member-not-found-message",
        description: "Member-not-found business message",
        strategies: [{ kind: "text", text: "Member not found", exact: true }],
      };
      await resolve(adapter, session, notFoundTarget, "detect-member-not-found", events);
      const checkpoint = await adapter.evaluate(session, {
        kind: "element_state",
        targetId: notFoundTarget.id,
        state: "visible",
        timeoutMs: 1_000,
      });
      if (checkpoint.matched) return { status: "business_outcome", code: "MEMBER_NOT_FOUND", events };
    }

    if (observation.textSummary?.includes("Permission denied")) {
      const evidence = await adapter.captureEvidence(session, ["screenshot", "dom_snapshot"]);
      return {
        status: "failure",
        code: "permission_denied",
        message: "The target application denied access to member account information",
        evidence,
        events,
      };
    }

    if (observation.textSummary?.includes("Unverified account warning")) {
      const interventionId = `intervention-${Date.now()}`;
      events.push({
        type: "human_control",
        at: now(),
        interventionId,
        phase: "requested",
      });
      await adapter.relinquishToHuman(session, interventionId);
      events.push({
        type: "human_control",
        at: now(),
        interventionId,
        phase: "granted",
      });
      keepSessionOpen = true;
      return { status: "intervention_required", interventionId, session, events };
    }

    const accountsLink = await resolve(
      adapter,
      session,
      accountInformationTarget,
      "open-account-information",
      events,
    );
    assertAction(
      await adapter.execute(session, { kind: "click", targetRef: accountsLink.runtimeRef }),
    );

    const balance = await resolve(
      adapter,
      session,
      savingsBalanceTarget,
      "read-savings-balance",
      events,
    );
    const checkpoint = await adapter.evaluate(session, {
      kind: "text",
      targetId: savingsBalanceTarget.id,
      operator: "matches",
      expected: { source: "literal", value: "^\\$[0-9,]+\\.[0-9]{2}$" },
      timeoutMs: 2_000,
    });
    events.push({
      type: "checkpoint_evaluated",
      at: now(),
      stepId: "read-savings-balance",
      matched: checkpoint.matched,
      ...(checkpoint.message ? { message: checkpoint.message } : {}),
    });
    if (!checkpoint.matched) {
      const evidence = await adapter.captureEvidence(session, ["screenshot", "dom_snapshot"]);
      return {
        status: "failure",
        code: "checkpoint_failed",
        message: checkpoint.message ?? "Savings balance checkpoint failed",
        evidence,
        events,
      };
    }

    const read = await adapter.execute(session, {
      kind: "read",
      targetRef: balance.runtimeRef,
      extraction: "text",
    });
    assertAction(read);
    const savingsBalance = Number(String(read.value).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(savingsBalance)) {
      throw new Error(`Unable to parse savings balance '${String(read.value)}'`);
    }
    return { status: "success", savingsBalance, events };
  } catch (error) {
    const evidence = await adapter
      .captureEvidence(session, ["screenshot", "dom_snapshot"])
      .catch(() => []);
    return {
      status: "failure",
      code: "surface_error",
      message: error instanceof Error ? error.message : String(error),
      evidence,
      events,
    };
  } finally {
    if (!keepSessionOpen) await adapter.close(session);
  }
}

async function resolve(
  adapter: SurfaceAdapter,
  session: SurfaceSession,
  target: TargetDescriptor,
  stepId: string,
  events: ReplayEvent[],
) {
  const resolved = await adapter.resolveTarget(session, target);
  events.push({
    type: "target_resolved",
    at: now(),
    stepId,
    targetId: target.id,
    strategyIndex: resolved.strategyIndex,
  });
  return resolved;
}

function assertAction(result: Awaited<ReturnType<SurfaceAdapter["execute"]>>): void {
  if (!result.ok) {
    throw new Error(result.error?.message ?? "Surface action failed");
  }
}

function now(): string {
  return new Date().toISOString();
}
