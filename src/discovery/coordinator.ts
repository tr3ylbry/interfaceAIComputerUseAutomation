import { randomUUID } from "node:crypto";
import { NavigationPolicyError, SurfaceObservationSchema, InterventionRequestSchema,
  type SurfaceAdapter, type SurfaceSession, type SurfaceAction, type SurfaceObservation, type HumanControlHandle } from "../contracts/index.js";
import { evaluateNavigation, evaluatePolicy, locationAllowed, type PolicyEvaluator } from "../replay/policy.js";
import { validateInputs, matchesType, transform } from "../replay/values.js";
import { DiscoveryRequestSchema, DiscoveryError, parseDecision, type DiscoveryRequest, type DiscoveryModel, type DiscoveryRun, type DiscoveryAction } from "./contracts.js";
import { discoveryPolicy } from "./policy.js";

export function outputTransform(type: DiscoveryRequest["outputs"][number]["type"]) {
  return type === "currency" ? "currency_to_number" : type === "integer" ? "integer" : type === "number" ? "number" : "trim";
}

export type DiscoveryHandoff = { session: SurfaceSession; handle: HumanControlHandle; run: DiscoveryRun };
export class DiscoveryCoordinator {
  private readonly handoffs = new Map<string, DiscoveryHandoff>();
  constructor(private readonly adapter: SurfaceAdapter, private readonly model: DiscoveryModel,
    private readonly options: { policy?: PolicyEvaluator; clock?: () => number } = {}) {}

  getHandoff(id: string): DiscoveryHandoff | undefined {
    const handoff = this.handoffs.get(id);
    return handoff ? structuredClone(handoff) : undefined;
  }

  async releaseHandoff(id: string): Promise<void> {
    const handoff = this.handoffs.get(id);
    if (!handoff) throw new Error("Unknown discovery handoff");
    try { await this.adapter.close(handoff.session); }
    catch (error) { if (!(error instanceof NavigationPolicyError)) throw error; }
    this.handoffs.delete(id);
  }

  async run(candidate: unknown): Promise<DiscoveryRun> {
    let request: DiscoveryRequest;
    try {
      request = DiscoveryRequestSchema.parse(candidate);
      validateInputs(request, Object.fromEntries(request.inputs.map(input => [input.name, input.discoveryValue])));
      if (new Set(request.inputs.map(input => input.name)).size !== request.inputs.length
        || new Set(request.outputs.map(output => output.name)).size !== request.outputs.length
        || request.inputs.some(input => input.discoveryValue === null)
        || request.outputs.some(output => output.type === "boolean")) throw new Error("Unsupported contract");
    } catch { throw new DiscoveryError("invalid_request"); }
    const clock = this.options.clock ?? Date.now;
    const deadline = clock() + request.limits.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.limits.timeoutMs);
    const checkTime = () => { if (controller.signal.aborted || clock() >= deadline) throw new DiscoveryError("timeout"); };
    const bounded = async <T>(operation: Promise<T>): Promise<T> => {
      // Attach rejection handling even if the deadline has just elapsed.
      void operation.catch(() => undefined);
      checkTime();
      let abort!: () => void;
      const expired = new Promise<never>((_resolve, reject) => {
        abort = () => reject(new DiscoveryError("timeout"));
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      try { const value = await Promise.race([operation, expired]); checkTime(); return value; }
      finally { controller.signal.removeEventListener("abort", abort); }
    };
    const run: DiscoveryRun = { id: randomUUID(), request, model: { ...this.model.identity }, startedAt: new Date().toISOString(),
      finishedAt: "", redacted: false, status: "failure", observations: [], actions: [], decisions: [], outputs: Object.create(null), successChecks: [] };
    let session: SurfaceSession | undefined;
    let transferred = false;
    const observe = async (): Promise<SurfaceObservation> => {
      checkTime();
      const observation = SurfaceObservationSchema.parse(await bounded(this.adapter.observe(session!, { discovery: true })));
      if (!observation.id || !observation.image) throw new DiscoveryError("hybrid_observation_required");
      if (!locationAllowed(request.policy, observation.urlOrLocation ?? "")) throw new DiscoveryError("policy_violation");
      run.observations.push(observation);
      return observation;
    };
    const intervene = async (reason: "agent_stuck" | "risky_action_requires_confirmation" | "unexpected_state") => {
      checkTime();
      const intervention = InterventionRequestSchema.parse({ id: randomUUID(), runId: run.id, goal: request.goal, reason,
        explanation: "Discovery paused for operator review", createdAt: new Date().toISOString(), evidence: [] });
      const handle = await this.adapter.relinquishToHuman(session!, intervention.id);
      run.intervention = intervention; run.status = "intervention_required";
      transferred = true;
      this.handoffs.set(intervention.id, { session: session!, handle, run });
    };
    try {
      if (!request.approval.allowModelProcessing) throw new DiscoveryError("model_processing_not_approved");
      if (request.target.surfaceKind !== this.adapter.kind || !this.adapter.describeTarget
        || (this.adapter.kind === "web" && !this.adapter.supportsNavigationGuard)) throw new DiscoveryError("unsupported_surface");
      const open = { action: "open" as const, risk: "read_only" as const, location: request.target.entryPoint };
      if (evaluatePolicy(request.policy, open).decision !== "allow"
        || (this.options.policy && this.options.policy(open).decision !== "allow")) throw new DiscoveryError("policy_violation");
      session = await bounded(this.adapter.open(request.target, { navigationGuard: (source, destination) => evaluateNavigation(request.policy, source, destination) })
        .then(async opened => {
          session = opened;
          if (controller.signal.aborted || clock() >= deadline) {
            try { await this.adapter.close(opened); } finally { session = undefined; }
            throw new DiscoveryError("timeout");
          }
          return opened;
        }));
      let observation = await observe();
      for (let turn = 0; turn < request.limits.maxSteps; turn++) {
        checkTime();
        if (observation.elements.some(element => element.visible && ["dialog", "alertdialog"].includes(element.role ?? ""))) {
          await intervene("unexpected_state"); break;
        }
        let decision;
        const proposal = await bounded(this.model.decide(structuredClone(observation),
          structuredClone({ request, actions: run.actions, outputs: run.outputs }), controller.signal));
        try { decision = parseDecision(proposal); } catch { throw new DiscoveryError("invalid_model_decision"); }
        run.decisions.push({ observationId: observation.id!, decision });
        if (decision.kind === "request_human") { await intervene("agent_stuck"); break; }
        if (decision.kind === "finish_discovery") {
          if (!run.actions.some(action => action.executed) || !Object.keys(run.outputs).length) throw new DiscoveryError("success_unverified");
          for (const output of request.outputs) {
            const candidate = run.outputs[output.name];
            if (!candidate) { if (output.required) throw new DiscoveryError("success_unverified"); continue; }
            if (!matchesType(candidate.value, output.type)) throw new DiscoveryError("success_unverified");
            checkTime();
            await bounded(this.adapter.resolveTarget(session!, candidate.target));
            const checkpoint = { kind: candidate.extraction, targetId: candidate.target.id, operator: "equals" as const,
              expected: { source: "literal" as const, value: candidate.rawValue }, timeoutMs: Math.max(1, Math.min(1_000, deadline - clock())) };
            if (!(await bounded(this.adapter.evaluate(session!, checkpoint))).matched) throw new DiscoveryError("success_unverified");
            run.successChecks.push(checkpoint);
          }
          run.status = "success"; break;
        }
        const policy = discoveryPolicy(request, decision, observation);
        if (policy.decision === "allow" && this.options.policy) {
          const extra = this.options.policy({ action: decision.kind === "ui_read" ? "extract" : decision.kind.slice(3) as "click" | "fill" | "select" | "navigate",
            risk: policy.risk, location: observation.urlOrLocation!, ...(decision.kind === "ui_navigate" ? { destination: decision.destination } : {}) });
          if (!["allow", "block", "require_human"].includes(extra.decision)) throw new DiscoveryError("policy_violation");
          policy.decision = extra.decision; policy.reason = "runtime_policy";
        }
        const record: DiscoveryAction = { index: run.actions.length, decision, policy, beforeId: observation.id!, executed: false };
        run.actions.push(record);
        if (policy.decision === "block") throw new DiscoveryError("policy_violation");
        if (policy.decision === "require_human") { await intervene("risky_action_requires_confirmation"); break; }
        if ("targetRef" in decision) {
          record.control = observation.elements.find(element => element.ref === decision.targetRef)!;
          checkTime();
          record.target = await bounded(this.adapter.describeTarget(session!, decision.targetRef));
          record.target.id = `discovered-target-${record.index}`;
        }
        if (decision.kind === "ui_read" && !request.outputs.some(output => output.name === decision.outputName)) throw new DiscoveryError("unknown_output");
        const action: SurfaceAction = decision.kind === "ui_navigate" ? { kind: "navigate", destination: decision.destination }
          : decision.kind === "ui_click" ? { kind: "click", targetRef: decision.targetRef }
          : decision.kind === "ui_fill" ? { kind: "fill", targetRef: decision.targetRef, value: decision.value, clearFirst: true }
          : decision.kind === "ui_select" ? { kind: "select", targetRef: decision.targetRef, value: decision.value }
          : { kind: "read", targetRef: decision.targetRef, extraction: decision.extraction };
        checkTime();
        const result = await bounded(this.adapter.execute(session!, action));
        if (!result.ok) throw new DiscoveryError(result.error?.code === "policy_violation" ? "policy_violation" : "surface_error");
        record.executed = true;
        if (decision.kind === "ui_read") {
          const definition = request.outputs.find(output => output.name === decision.outputName)!;
          let value;
          try { value = transform(result.value, outputTransform(definition.type)); }
          catch { throw new DiscoveryError("invalid_output"); }
          if (!matchesType(value, definition.type) || result.value === undefined) throw new DiscoveryError("invalid_output");
          record.rawValue = result.value;
          run.outputs[decision.outputName] = { value, rawValue: result.value, actionIndex: record.index, target: record.target!, extraction: decision.extraction };
        }
        observation = await observe();
        record.afterId = observation.id!;
      }
      if (run.status === "failure") run.code = "max_steps";
    } catch (error) {
      run.status = "failure";
      run.code = error instanceof NavigationPolicyError ? "policy_violation" : error instanceof DiscoveryError ? error.code : "discovery_error";
    } finally {
      controller.abort(); clearTimeout(timer);
      if (session && !transferred) {
        try { await this.adapter.close(session); }
        catch (error) { run.status = "failure"; run.code = error instanceof NavigationPolicyError ? "policy_violation" : "cleanup_failed"; }
      }
      run.finishedAt = new Date().toISOString();
    }
    return structuredClone(run);
  }
}
