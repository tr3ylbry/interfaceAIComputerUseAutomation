import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CapabilityArtifactSchema, InterventionRequestSchema, ReplayResultSchema,
  NavigationPolicyError,
  type CapabilityArtifact, type CapabilityStep, type Checkpoint, type EvidenceRef,
  type HumanControlHandle, type InterventionRequest, type JsonValue, type ReplayEvent,
  type ReplayResult, type SurfaceAction, type SurfaceAdapter, type SurfaceRuntimeContext,
  type SurfaceSession,
} from "../contracts/index.js";
import { evaluatePolicy, evaluateNavigation, locationAllowed, type PolicyEvaluator, type PolicyRequest } from "./policy.js";
import { bind, equalValues, matchesType, scalar, transform, validateInputs } from "./values.js";
import { validateReferences } from "./validation.js";

type FailureCode = Extract<ReplayResult, { status: "failure" }>["code"];
type RecoveryCode = "timeout" | "known_dialog" | "transient_load";
type Terminal =
  | { status: "success"; outputs: Record<string, JsonValue> }
  | { status: "business_outcome"; code: string; message: string; data: Record<string, JsonValue> }
  | { status: "failure"; code: FailureCode; message: string; expected?: JsonValue; observed?: JsonValue }
  | { status: "intervention_required"; interventionId: string; reason: string };

class Stop extends Error {
  constructor(readonly terminal: Terminal) { super(terminal.status); }
}
class Recover extends Error {
  constructor(readonly code: RecoveryCode, readonly conditionId: string) { super(code); }
}

export type ReplayOptions = {
  allowDraft?: boolean;
  recoveryExhaustion?: "failure" | "intervention";
  captureRawEvidence?: boolean;
  policy?: PolicyEvaluator;
  onEvent?: (event: ReplayEvent) => void;
  sleep?: (milliseconds: number) => Promise<void>;
  clock?: () => number;
};

export type ReplayHandoff = {
  request: InterventionRequest;
  session: SurfaceSession;
  handle: HumanControlHandle;
  context: SurfaceRuntimeContext;
  events: ReplayEvent[];
};

/** One invocation returns one serialized terminal result. Live handoffs remain explicitly owned. */
export class ReplayCoordinator {
  private readonly handoffs = new Map<string, ReplayHandoff>();
  constructor(private readonly adapter: SurfaceAdapter, private readonly options: ReplayOptions = {}) {}

  async run(artifact: unknown, inputs: unknown): Promise<ReplayResult> {
    return new Invocation(this.adapter, this.options, (handoff) => {
      this.handoffs.set(handoff.request.id, handoff);
    }).run(artifact, inputs);
  }

  getHandoff(interventionId: string): ReplayHandoff | undefined {
    const handoff = this.handoffs.get(interventionId);
    return handoff ? structuredClone(handoff) : undefined;
  }

  async releaseHandoff(interventionId: string): Promise<void> {
    const handoff = this.handoffs.get(interventionId);
    if (!handoff) throw new Error("Unknown intervention");
    try { await this.adapter.close(handoff.session); }
    catch (error) { if (!(error instanceof NavigationPolicyError)) throw error; }
    this.handoffs.delete(interventionId);
  }
}

class Invocation {
  private artifact!: CapabilityArtifact;
  private context: SurfaceRuntimeContext = { inputs: Object.create(null), outputs: Object.create(null) };
  private session: SurfaceSession | undefined;
  private stepId: string | undefined;
  private readonly events: ReplayEvent[] = [];
  private readonly evidence: EvidenceRef[] = [];
  private readonly runId = randomUUID();
  private readonly started = Date.now();
  private transferred = false;
  private evidenceStatus = "not_requested";

  constructor(
    private readonly adapter: SurfaceAdapter,
    private readonly options: ReplayOptions,
    private readonly retain: (handoff: ReplayHandoff) => void,
  ) {}

  async run(candidate: unknown, inputs: unknown): Promise<ReplayResult> {
    let terminal: Terminal;
    try {
      const parsed = CapabilityArtifactSchema.safeParse(candidate);
      if (!parsed.success) this.fail("unexpected_state", "Artifact validation failed");
      this.artifact = parsed.data;
      try { validateReferences(this.artifact); this.context.inputs = validateInputs(this.artifact, inputs); }
      catch { this.fail("unexpected_state", "Artifact references or invocation inputs are invalid"); }
      if (this.artifact.capability.approvalState !== "approved" && !this.options.allowDraft) {
        this.fail("policy_violation", "Draft capability requires explicit development opt-in");
      }
      if (this.adapter.kind !== this.artifact.target.surfaceKind) this.fail("surface_error", "Surface kind mismatch");
      await this.approve({ action: "open", risk: "read_only", location: this.artifact.target.entryPoint });
      if (this.adapter.kind === "web" && !this.adapter.supportsNavigationGuard) {
        this.fail("policy_violation", "Adapter cannot enforce navigation policy before requests");
      }
      this.session = await this.adapter.open(this.artifact.target, {
        navigationGuard: (source, destination) => evaluateNavigation(this.artifact.policy, source, destination),
      });
      for (const step of this.artifact.steps) {
        this.stepId = step.id;
        this.emit({ type: "step_started", at: this.now(), stepId: step.id });
        await this.runStep(step);
        this.emit({ type: "step_completed", at: this.now(), stepId: step.id });
      }
      await this.inspect();
      if (!await this.waitCheckpoint(this.artifact.successCondition)) this.fail("checkpoint_failed", "Final success checkpoint did not match");
      for (const output of this.artifact.outputs) {
        if (!Object.hasOwn(this.context.outputs, output.name)) {
          if (output.required) this.fail("checkpoint_failed", "Required output missing");
        } else if (!matchesType(this.context.outputs[output.name], output.type)) {
          this.fail("checkpoint_failed", "Output type mismatch");
        }
      }
      terminal = { status: "success", outputs: this.context.outputs };
    } catch (error) {
      terminal = error instanceof NavigationPolicyError ? this.navigationFailure(error) : error instanceof Stop ? error.terminal : {
        status: "failure", code: error instanceof Recover ? "recovery_exhausted" : "surface_error",
        message: error instanceof Recover ? "No eligible recovery policy for observed condition" : "Replay operation failed",
      };
    }

    if (terminal.status === "failure") {
      await this.capture();
      terminal.observed = { ...(typeof terminal.observed === "object" && terminal.observed !== null ? terminal.observed : {}),
        evidence: this.evidenceStatus,
        recoveryAttempted: this.events.some((event) => event.type === "recoverable_condition") };
    }
    if (this.session && !this.transferred) {
      try { await this.adapter.close(this.session); }
      catch (error) {
        if (error instanceof NavigationPolicyError) {
          if (terminal.status !== "failure" || terminal.code !== "policy_violation") terminal = this.navigationFailure(error);
        } else if (terminal.status === "failure") terminal.message += "; session cleanup failed";
        else terminal = { status: "failure", code: "surface_error", message: "Session cleanup failed" };
      }
    }
    return ReplayResultSchema.parse({
      runId: this.runId, capabilityId: this.artifact?.capability.id ?? "invalid-artifact",
      capabilityVersion: this.artifact?.capability.version ?? "unknown",
      startedAt: new Date(this.started).toISOString(), finishedAt: this.now(),
      durationMs: Math.max(0, Date.now() - this.started), events: this.events, evidence: this.evidence,
      ...(this.stepId ? { stepId: this.stepId } : {}), ...terminal,
    });
  }

  private async runStep(step: CapabilityStep): Promise<void> {
    let actionCompleted = false;
    let attempts = 0;
    let pending: Recover | undefined;
    const recovery = this.artifact.recoveryPolicies.find((policy) => policy.id === step.recoveryPolicyId);
    while (true) {
      try {
        await this.inspect();
        if (!actionCompleted) {
          await this.perform(step);
          actionCompleted = true;
        }
        await this.inspect();
        if (step.checkpoint && !await this.waitCheckpoint(step.checkpoint)) {
          if (recovery?.appliesTo.includes("timeout")) throw new Recover("timeout", "step-checkpoint");
          this.fail("checkpoint_failed", "Step checkpoint did not match", { checkpoint: "required_match" }, { matched: false });
        }
        if (pending && recovery) this.recoveryEvent(pending, attempts, recovery.maxAttempts, true);
        return;
      } catch (error) {
        if (!(error instanceof Recover)) {
          if (pending && error instanceof Stop && error.terminal.status === "business_outcome" && recovery) {
            this.recoveryEvent(pending, attempts, recovery.maxAttempts, true);
          }
          throw error;
        }
        if (!recovery || !recovery.appliesTo.includes(error.code) || attempts >= recovery.maxAttempts) {
          if (this.options.recoveryExhaustion === "intervention") await this.intervene("recovery_exhausted");
          this.fail("recovery_exhausted", "Recovery unavailable or budget exhausted",
            { condition: error.conditionId, maxAttempts: recovery?.maxAttempts ?? 0 }, { attempts });
        }
        attempts += 1;
        pending = error;
        this.recoveryEvent(error, attempts, recovery.maxAttempts, false);
        await (this.options.sleep ?? delay)(recovery.backoffMs);
        // Never reissue a failed/uncertain step action. Recovery only uses the declared control.
        if (recovery.dismissTargetId && error.code !== "timeout") {
          const synthetic: CapabilityStep = {
            id: step.id, description: "Declared recovery action", action: "click",
            risk: "reversible_write", targetId: recovery.dismissTargetId,
          };
          await this.perform(synthetic);
        }
      }
    }
  }

  private navigationFailure(error: NavigationPolicyError): Terminal {
    try {
      this.emit({ type: "policy_decision", at: this.now(), action: "navigate", decision: "block",
        reason: error.reason, ...(this.stepId ? { stepId: this.stepId } : {}) });
    } catch { /* A diagnostic sink cannot replace a known safety denial. The event is retained. */ }
    return { status: "failure", code: "policy_violation", message: "Navigation blocked by policy",
      expected: { navigation: "allowed_origin_and_path" },
      observed: { source: error.source, destination: error.destination, reason: error.reason,
        evidence: this.evidenceStatus, recoveryAttempted: this.events.some((event) => event.type === "recoverable_condition") } };
  }

  private async perform(step: CapabilityStep): Promise<void> {
    const observation = await this.adapter.observe(this.session!);
    const destination = step.action === "navigate" ? scalar(bind(step.destination, this.context)) : undefined;
    await this.approve({ action: step.action, risk: step.risk, location: observation.urlOrLocation ?? "",
      ...(destination !== undefined ? { destination } : {}) });
    if (step.action === "wait") return;
    let action: SurfaceAction;
    if (step.action === "navigate") action = { kind: "navigate", destination: destination! };
    else {
      const resolved = await this.resolve(step.targetId);
      if (step.action === "click") action = { kind: "click", targetRef: resolved.runtimeRef };
      else if (step.action === "fill") action = { kind: "fill", targetRef: resolved.runtimeRef,
        value: scalar(bind(step.value, this.context)), clearFirst: step.clearFirst };
      else if (step.action === "select") action = { kind: "select", targetRef: resolved.runtimeRef,
        value: scalar(bind(step.value, this.context)) };
      else action = { kind: "read", targetRef: resolved.runtimeRef, extraction: step.extraction,
        ...(step.attributeName ? { attributeName: step.attributeName } : {}) };
    }
    const result = await this.adapter.execute(this.session!, action);
    if (!result.ok) {
      if (result.error?.code === "policy_violation") {
        this.fail("policy_violation", "Navigation blocked by policy", { action: step.action }, result.observedState);
      }
      // A click timeout can occur after dispatch; never assume it is safe to repeat.
      if (result.error?.code === "permission_denied") this.fail("permission_denied", "Surface denied the action");
      this.fail("surface_error", "Surface action failed; execution state may be uncertain",
        { action: step.action }, { ok: false });
    }
    if (step.action === "extract") {
      const value = transform(result.value, step.transform);
      const definition = this.artifact.outputs.find((output) => output.name === step.outputName)!;
      if (!matchesType(value, definition.type)) this.fail("checkpoint_failed", "Extracted output has invalid type");
      this.context.outputs[step.outputName] = value;
    }
  }

  private async approve(request: PolicyRequest): Promise<void> {
    let decision = evaluatePolicy(this.artifact.policy, request);
    if (decision.decision === "allow" && this.options.policy) {
      const extra = this.options.policy(Object.freeze({ ...request }));
      if (!["allow", "block", "require_human"].includes(extra.decision)) throw new Error("Invalid policy result");
      decision = { decision: extra.decision, reason: "Runtime policy evaluated" };
    }
    this.emit({ type: "policy_decision", at: this.now(), action: request.action, ...decision,
      ...(this.stepId ? { stepId: this.stepId } : {}) });
    if (decision.decision === "block") this.fail("policy_violation", decision.reason);
    if (decision.decision === "require_human") {
      if (!this.session) this.fail("policy_violation", "Opening requires approval before a live session exists");
      await this.intervene("risky_action_requires_confirmation");
    }
  }

  private async inspect(): Promise<void> {
    const observation = await this.adapter.observe(this.session!);
    if (!locationAllowed(this.artifact.policy, observation.urlOrLocation ?? "")) {
      this.fail("policy_violation", "Observed location outside allowed origins or paths");
    }
    // Safety conditions outrank recoverable conditions and legitimate business outcomes.
    const guards = [...this.artifact.runtimeConditions].sort((a, b) =>
      Number(a.disposition.kind === "recoverable") - Number(b.disposition.kind === "recoverable"));
    for (const condition of guards) {
      if (!await this.check(condition.when)) continue;
      const disposition = condition.disposition;
      if (disposition.kind === "failure") this.fail(disposition.code, "Declared failure condition matched",
        { condition: condition.id }, { matched: true });
      if (disposition.kind === "intervention") await this.intervene(disposition.reason);
      if (disposition.kind === "recoverable") throw new Recover(disposition.code, condition.id);
    }
    for (const outcome of this.artifact.businessOutcomes) {
      if (!await this.check(outcome.when)) continue;
      const data: Record<string, JsonValue> = Object.create(null);
      for (const [key, expression] of Object.entries(outcome.data ?? {})) data[key] = bind(expression, this.context);
      throw new Stop({ status: "business_outcome", code: outcome.code, message: outcome.description, data });
    }
  }

  private async check(checkpoint: Checkpoint): Promise<boolean> {
    const matched = await this.checkValue(checkpoint);
    this.emit({ type: "checkpoint_evaluated", at: this.now(), matched,
      ...(this.stepId ? { stepId: this.stepId } : {}) });
    return matched;
  }

  private async waitCheckpoint(checkpoint: Checkpoint): Promise<boolean> {
    const clock = this.options.clock ?? Date.now;
    const budget = (value: Checkpoint): number => value.kind === "all" || value.kind === "any"
      ? Math.max(...value.conditions.map(budget)) : value.kind === "output" ? 0 : value.timeoutMs;
    const deadline = clock() + budget(checkpoint);
    do {
      if (await this.check(checkpoint)) return true;
      await this.inspect();
      const remaining = deadline - clock();
      if (remaining <= 0) return false;
      await (this.options.sleep ?? delay)(Math.min(25, remaining));
    } while (clock() <= deadline);
    return false;
  }

  private async checkValue(checkpoint: Checkpoint): Promise<boolean> {
    if (checkpoint.kind === "all" || checkpoint.kind === "any") {
      for (const condition of checkpoint.conditions) {
        const matched = await this.checkValue(condition);
        if (checkpoint.kind === "all" && !matched) return false;
        if (checkpoint.kind === "any" && matched) return true;
      }
      return checkpoint.kind === "all";
    }
    if (checkpoint.kind === "output") {
      if (!Object.hasOwn(this.context.outputs, checkpoint.outputName)) return false;
      return checkpoint.operator === "defined" || equalValues(this.context.outputs[checkpoint.outputName], bind(checkpoint.expected!, this.context));
    }
    if ("targetId" in checkpoint) {
      try { await this.resolve(checkpoint.targetId); }
      catch (error) {
        if (error instanceof Stop && error.terminal.status === "failure" && error.terminal.code === "target_not_found") {
          return checkpoint.kind === "element_state" && ["hidden", "detached"].includes(checkpoint.state);
        }
        throw error;
      }
    }
    const bound = checkpoint.kind === "text" || checkpoint.kind === "value"
      ? { ...checkpoint, expected: { source: "literal" as const, value: bind(checkpoint.expected, this.context) } }
      : checkpoint;
    return (await this.adapter.evaluate(this.session!, { ...bound, timeoutMs: 1 })).matched;
  }

  private async resolve(targetId: string) {
    const descriptor = this.artifact.targets.find((target) => target.id === targetId)!;
    try {
      const target = await this.adapter.resolveTarget(this.session!, descriptor);
      this.emit({ type: "target_resolved", at: this.now(), stepId: this.stepId ?? "initial-state",
        targetId, strategyIndex: target.strategyIndex });
      return target;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "target_not_found") {
        this.fail("target_not_found", "Declared target could not be resolved", { targetId }, { resolved: false });
      }
      throw error;
    }
  }

  private async intervene(reason: InterventionRequest["reason"]): Promise<never> {
    const id = randomUUID();
    await this.capture();
    const request = InterventionRequestSchema.parse({ id, runId: this.runId,
      capabilityId: this.artifact.capability.id, stepId: this.stepId, reason,
      explanation: "Replay paused for explicit human review", createdAt: this.now(), evidence: this.evidence });
    this.emit({ type: "human_control", at: this.now(), interventionId: id, phase: "requested" });
    const handle = await this.adapter.relinquishToHuman(this.session!, id);
    this.transferred = true;
    // Retain ownership before a user-provided event sink can fail.
    const granted: ReplayEvent = { type: "human_control", at: this.now(), interventionId: id, phase: "granted" };
    this.events.push(granted);
    this.retain({ request, session: this.session!, handle, context: structuredClone(this.context), events: structuredClone(this.events) });
    try { this.options.onEvent?.(structuredClone(granted)); } catch { /* ownership already transferred */ }
    throw new Stop({ status: "intervention_required", interventionId: id, reason });
  }

  private async capture(): Promise<void> {
    if (!this.session || !this.options.captureRawEvidence || this.evidenceStatus !== "not_requested") return;
    try {
      this.evidence.push(...await this.adapter.captureEvidence(this.session, ["screenshot", "dom_snapshot"]));
      this.evidenceStatus = "captured";
    } catch { this.evidenceStatus = "capture_failed"; }
  }

  private recoveryEvent(condition: Recover, attempt: number, maxAttempts: number, recovered: boolean): void {
    this.emit({ type: "recoverable_condition", at: this.now(), condition: {
      classification: "recoverable", code: condition.code, stepId: this.stepId!, attempt, maxAttempts,
      message: recovered ? "Recovery verified" : "Recovery attempt started", recovered,
    } });
  }
  private emit(event: ReplayEvent): void {
    this.events.push(event);
    this.options.onEvent?.(structuredClone(event));
  }
  private now(): string { return new Date().toISOString(); }
  private fail(code: FailureCode, message: string, expected?: JsonValue, observed?: JsonValue): never {
    throw new Stop({ status: "failure", code, message,
      ...(expected !== undefined ? { expected } : {}), ...(observed !== undefined ? { observed } : {}) });
  }
}
