import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type FrameLocator,
  type Locator,
  type Page,
} from "playwright";
import type {
  AtomicCheckpoint,
  Checkpoint,
  CheckpointEvaluation,
  EvidenceRef,
  HumanControlHandle,
  Identifier,
  LocatorStrategy,
  ResolvedTarget,
  SurfaceAction,
  SurfaceActionResult,
  SurfaceAdapter,
  SurfaceObservation,
  SurfaceSession,
  SurfaceTarget,
  SurfaceOpenOptions,
  TargetDescriptor,
  ValueExpression,
} from "../contracts/index.js";
import { NavigationPolicyError } from "../contracts/index.js";
import { NavigationFirewall } from "./navigation-firewall.js";

type ControlOwner = "automation" | "human" | "none";
type ControlPhase =
  | "automation_running"
  | "paused_for_intervention"
  | "human_control"
  | "resuming_automation"
  | "closed";

type RuntimeTarget =
  | { kind: "locator"; locator: Locator }
  | { kind: "coordinate"; x: number; y: number };

type PlaywrightSessionState = {
  session: SurfaceSession;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  pageIdentity: string;
  targetsByRef: Map<string, RuntimeTarget>;
  targetRefsById: Map<string, string>;
  owner: ControlOwner;
  phase: ControlPhase;
  epoch: number;
  interventionId?: string;
  controlHistory: Array<{ phase: ControlPhase; owner: ControlOwner; epoch: number }>;
  traceActive: boolean;
  actionInFlight: boolean;
  navigation: NavigationFirewall | undefined;
};

type LocatorRoot = {
  locator(selector: string): Locator;
  getByRole(
    role: Parameters<Page["getByRole"]>[0],
    options?: { name?: string; exact?: boolean },
  ): Locator;
  getByLabel(text: string, options?: { exact?: boolean }): Locator;
  getByText(text: string, options?: { exact?: boolean }): Locator;
  frameLocator(selector: string): FrameLocator;
};

export type PlaywrightSurfaceAdapterOptions = {
  headless?: boolean;
  evidenceDirectory?: string;
  actionTimeoutMs?: number;
};

export class PlaywrightSurfaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlaywrightSurfaceError";
  }
}

export class PlaywrightSurfaceAdapter implements SurfaceAdapter {
  readonly kind = "web" as const;
  readonly supportsNavigationGuard = true;

  private readonly sessions = new Map<string, PlaywrightSessionState>();
  private readonly headless: boolean;
  private readonly evidenceDirectory: string;
  private readonly actionTimeoutMs: number;

  constructor(options: PlaywrightSurfaceAdapterOptions = {}) {
    this.headless = options.headless ?? true;
    this.evidenceDirectory = resolve(options.evidenceDirectory ?? "evidence/runtime");
    this.actionTimeoutMs = options.actionTimeoutMs ?? 5_000;
  }

  async open(target: SurfaceTarget, options: SurfaceOpenOptions = {}): Promise<SurfaceSession> {
    if (target.surfaceKind !== "web") {
      throw new PlaywrightSurfaceError(
        "unsupported_surface",
        `Playwright only supports web targets, received '${target.surfaceKind}'`,
      );
    }

    const browser = await chromium.launch({ headless: this.headless });
    let navigation: NavigationFirewall | undefined;
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      if (options.navigationGuard) {
        navigation = new NavigationFirewall(context, target.entryPoint, options.navigationGuard);
        await navigation.install();
      }
      const page = await context.newPage();
      await navigation?.protect(page);
      page.setDefaultTimeout(this.actionTimeoutMs);
      page.setDefaultNavigationTimeout(this.actionTimeoutMs);
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      await page.goto(target.entryPoint, { waitUntil: "domcontentloaded" });
      navigation?.assertAllowed();

      const session: SurfaceSession = { id: randomUUID(), kind: "web" };
      const state: PlaywrightSessionState = {
        session,
        browser,
        context,
        page,
        pageIdentity: randomUUID(),
        targetsByRef: new Map(),
        targetRefsById: new Map(),
        owner: "automation",
        phase: "automation_running",
        epoch: 0,
        controlHistory: [{ phase: "automation_running", owner: "automation", epoch: 0 }],
        traceActive: true,
        actionInFlight: false,
        navigation,
      };
      this.sessions.set(session.id, state);
      return session;
    } catch (error) {
      await browser.close().catch(() => undefined);
      navigation?.assertAllowed();
      throw error;
    }
  }

  async observe(session: SurfaceSession): Promise<SurfaceObservation> {
    const state = this.getState(session);
    try { return await this.observePage(session); }
    finally { state.navigation?.assertAllowed(); }
  }

  private async observePage(session: SurfaceSession): Promise<SurfaceObservation> {
    const state = this.getState(session);
    state.navigation?.assertAllowed();
    const elements: SurfaceObservation["elements"] = [];

    for (const [frameIndex, frame] of state.page.frames().entries()) {
      const observed = await frame
        .locator("input, button, select, a, [role], td")
        .evaluateAll((nodes) =>
          nodes.slice(0, 100).map((node) => {
            const element = node as HTMLElement;
            const input = node as HTMLInputElement;
            const rect = element.getBoundingClientRect();
            return {
              role: element.getAttribute("role") ?? element.tagName.toLowerCase(),
              name:
                element.getAttribute("aria-label") ??
                element.getAttribute("title") ??
                undefined,
              text: element.textContent?.trim() || undefined,
              value: "value" in input ? input.value : undefined,
              enabled: !(node as HTMLButtonElement).disabled,
              visible: rect.width > 0 && rect.height > 0,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            };
          }),
        );

      for (const [elementIndex, element] of observed.entries()) {
        elements.push({
          ref: `observation-${frameIndex}-${elementIndex}`,
          ...(element.role ? { role: element.role } : {}),
          ...(element.name ? { name: element.name } : {}),
          ...(element.text ? { text: element.text } : {}),
          ...(element.value !== undefined ? { value: element.value } : {}),
          enabled: element.enabled,
          visible: element.visible,
          bounds: element.bounds,
        });
      }
    }

    return {
      capturedAt: new Date().toISOString(),
      urlOrLocation: state.page.url(),
      title: await state.page.title(),
      elements,
      textSummary: (await state.page.locator("body").innerText()).slice(0, 4_000),
    };
  }

  async resolveTarget(
    session: SurfaceSession,
    descriptor: TargetDescriptor,
  ): Promise<ResolvedTarget> {
    const state = this.getState(session);
    try { return await this.resolvePageTarget(session, descriptor); }
    finally { state.navigation?.assertAllowed(); }
  }

  private async resolvePageTarget(session: SurfaceSession, descriptor: TargetDescriptor): Promise<ResolvedTarget> {
    const state = this.getAutomationState(session);
    const epoch = state.epoch;
    const root = this.rootForDescriptor(state.page, descriptor);
    const attempted: string[] = [];

    for (const [strategyIndex, strategy] of descriptor.strategies.entries()) {
      attempted.push(strategy.kind);
      const target = await this.tryStrategy(state.page, root, strategy);
      if (!target) continue;

      if (state.epoch !== epoch || state.owner !== "automation") {
        throw new PlaywrightSurfaceError("stale_operation", "Control changed during target resolution");
      }

      const runtimeRef = `target-${randomUUID()}`;
      state.targetsByRef.set(runtimeRef, target);
      state.targetRefsById.set(descriptor.id, runtimeRef);
      return { targetId: descriptor.id, runtimeRef, strategyIndex };
    }

    throw new PlaywrightSurfaceError(
      "target_not_found",
      `Unable to resolve target '${descriptor.id}' using ordered strategies: ${attempted.join(", ")}`,
    );
  }

  async execute(
    session: SurfaceSession,
    action: SurfaceAction,
  ): Promise<SurfaceActionResult> {
    let state: PlaywrightSessionState;
    try {
      state = this.getAutomationState(session);
      if (state.actionInFlight) throw new PlaywrightSurfaceError("session_busy", "An action is already in flight");
    } catch (error) {
      return this.actionError(error);
    }

    state.actionInFlight = true;
    try {
      if (action.kind === "navigate") {
        await state.page.goto(new URL(action.destination, state.page.url()).href, { waitUntil: "domcontentloaded" });
        return { ok: true, observedState: { url: state.page.url() } };
      }

      const target = state.targetsByRef.get(action.targetRef);
      if (!target) {
        throw new PlaywrightSurfaceError(
          "unknown_target_ref",
          `No resolved target exists for runtime reference '${action.targetRef}'`,
        );
      }

      if (target.kind === "coordinate") {
        if (action.kind !== "click") {
          throw new PlaywrightSurfaceError(
            "unsupported_coordinate_action",
            `Coordinate targets only support click, not '${action.kind}'`,
          );
        }
        await state.page.mouse.click(target.x, target.y);
        return { ok: true };
      }

      const locator = target.locator;
      switch (action.kind) {
        case "click":
          await locator.click();
          return { ok: true };
        case "fill":
          if (action.clearFirst) {
            await locator.fill(action.value);
          } else {
            await locator.pressSequentially(action.value);
          }
          return { ok: true, observedState: { value: await locator.inputValue() } };
        case "select": {
          const selected = await locator.selectOption(action.value);
          return { ok: true, value: selected };
        }
        case "read": {
          if (action.extraction === "text") {
            return { ok: true, value: (await locator.textContent()) ?? "" };
          }
          if (action.extraction === "value") {
            return { ok: true, value: await locator.inputValue() };
          }
          if (!action.attributeName) {
            throw new PlaywrightSurfaceError(
              "invalid_action",
              "Attribute extraction requires attributeName",
            );
          }
          return {
            ok: true,
            value: (await locator.getAttribute(action.attributeName)) ?? "",
          };
        }
      }
      throw new PlaywrightSurfaceError("unsupported_action", "Unsupported surface action");
    } catch (error) {
      return this.actionError(error);
    } finally {
      state.actionInFlight = false;
      state.navigation?.assertAllowed();
    }
  }

  async evaluate(
    session: SurfaceSession,
    checkpoint: Checkpoint,
  ): Promise<CheckpointEvaluation> {
    const state = this.getState(session);
    try { return await this.evaluatePage(session, checkpoint); }
    finally { state.navigation?.assertAllowed(); }
  }

  private async evaluatePage(session: SurfaceSession, checkpoint: Checkpoint): Promise<CheckpointEvaluation> {
    let state: PlaywrightSessionState;
    try {
      state = this.getAutomationState(session);
    } catch (error) {
      if (error instanceof NavigationPolicyError) throw error;
      return { matched: false, message: this.errorMessage(error) };
    }

    if (checkpoint.kind === "all") {
      const evaluations = await Promise.all(
        checkpoint.conditions.map((condition) => this.evaluate(session, condition)),
      );
      return {
        matched: evaluations.every((evaluation) => evaluation.matched),
        observed: evaluations.map((evaluation) => evaluation.observed ?? null),
        message: evaluations.find((evaluation) => !evaluation.matched)?.message,
      };
    }

    if (checkpoint.kind === "any") {
      const evaluations = await Promise.all(
        checkpoint.conditions.map((condition) => this.evaluate(session, condition)),
      );
      return {
        matched: evaluations.some((evaluation) => evaluation.matched),
        observed: evaluations.map((evaluation) => evaluation.observed ?? null),
        message: evaluations.every((evaluation) => !evaluation.matched)
          ? evaluations.map((evaluation) => evaluation.message).filter(Boolean).join("; ")
          : undefined,
      };
    }

    return this.evaluateAtomic(state, checkpoint);
  }

  async captureEvidence(
    session: SurfaceSession,
    kinds: Array<"screenshot" | "trace" | "dom_snapshot" | "accessibility_snapshot">,
  ): Promise<EvidenceRef[]> {
    const state = this.getState(session);
    await mkdir(this.evidenceDirectory, { recursive: true });
    const capturedAt = new Date().toISOString();
    const stem = `${session.id}-${Date.now()}`;
    const evidence: EvidenceRef[] = [];

    for (const kind of [...new Set(kinds)]) {
      let path: string;
      if (kind === "screenshot") {
        path = resolve(this.evidenceDirectory, `${stem}.png`);
        await state.page.screenshot({ path, fullPage: true });
      } else if (kind === "dom_snapshot") {
        path = resolve(this.evidenceDirectory, `${stem}.html`);
        await writeFile(path, await state.page.content(), "utf8");
      } else if (kind === "accessibility_snapshot") {
        path = resolve(this.evidenceDirectory, `${stem}.aria.yml`);
        await writeFile(path, await state.page.locator("body").ariaSnapshot(), "utf8");
      } else {
        path = resolve(this.evidenceDirectory, `${stem}.trace.zip`);
        if (!state.traceActive) {
          await state.context.tracing.start({ screenshots: true, snapshots: true });
        }
        await state.context.tracing.stop({ path });
        state.traceActive = false;
        await state.context.tracing.start({ screenshots: true, snapshots: true });
        state.traceActive = true;
      }
      evidence.push({ kind, path, capturedAt, redacted: false });
    }

    return evidence;
  }

  async relinquishToHuman(
    session: SurfaceSession,
    interventionId: Identifier,
  ): Promise<HumanControlHandle> {
    const state = this.getAutomationState(session);
    if (state.actionInFlight) throw new PlaywrightSurfaceError("session_busy", "Cannot transfer control during an action");
    state.targetsByRef.clear();
    state.targetRefsById.clear();
    this.transition(state, "paused_for_intervention", "none");
    state.interventionId = interventionId;
    this.transition(state, "human_control", "human");
    return {
      interventionId,
      instructions: "Continue in the existing browser window, then return control when finished.",
    };
  }

  async reacquireFromHuman(
    session: SurfaceSession,
    interventionId: Identifier,
  ): Promise<void> {
    const state = this.getState(session);
    state.navigation?.assertAllowed();
    if (state.phase !== "human_control" || state.owner !== "human") {
      throw new PlaywrightSurfaceError("invalid_control_state", "Session is not under human control");
    }
    if (state.interventionId !== interventionId) {
      throw new PlaywrightSurfaceError(
        "intervention_mismatch",
        `Intervention '${interventionId}' does not own this session`,
      );
    }
    this.transition(state, "resuming_automation", "none");
    this.transition(state, "automation_running", "automation");
    delete state.interventionId;
  }

  async close(session: SurfaceSession): Promise<void> {
    const state = this.sessions.get(session.id);
    if (!state) return;
    if (state.traceActive) {
      await state.context.tracing.stop().catch(() => undefined);
      state.traceActive = false;
    }
    this.transition(state, "closed", "none");
    await state.browser.close();
    this.sessions.delete(session.id);
    state.navigation?.assertAllowed();
  }

  getSessionSnapshot(session: SurfaceSession): {
    sessionId: string;
    pageIdentity: string;
    url: string;
    phase: ControlPhase;
    owner: ControlOwner;
    epoch: number;
    controlHistory: ReadonlyArray<{ phase: ControlPhase; owner: ControlOwner; epoch: number }>;
  } {
    const state = this.getState(session);
    return {
      sessionId: state.session.id,
      pageIdentity: state.pageIdentity,
      url: state.page.url(),
      phase: state.phase,
      owner: state.owner,
      epoch: state.epoch,
      controlHistory: [...state.controlHistory],
    };
  }

  private rootForDescriptor(page: Page, descriptor: TargetDescriptor): LocatorRoot {
    let root: LocatorRoot = page;
    for (const frameSelector of descriptor.framePath ?? []) {
      root = root.frameLocator(frameSelector);
    }
    return root;
  }

  private async tryStrategy(
    page: Page,
    root: LocatorRoot,
    strategy: LocatorStrategy,
  ): Promise<RuntimeTarget | undefined> {
    if (strategy.kind === "coordinate") {
      if (strategy.referenceFrame !== "viewport") return undefined;
      const viewport = page.viewportSize();
      if (!viewport || strategy.x > viewport.width || strategy.y > viewport.height) return undefined;
      if (strategy.expectedWidth && strategy.expectedWidth !== viewport.width) return undefined;
      if (strategy.expectedHeight && strategy.expectedHeight !== viewport.height) return undefined;
      return { kind: "coordinate", x: strategy.x, y: strategy.y };
    }

    const locator = this.locatorForStrategy(root, strategy);
    return (await locator.count()) === 1 ? { kind: "locator", locator } : undefined;
  }

  private locatorForStrategy(
    root: LocatorRoot,
    strategy: Exclude<LocatorStrategy, { kind: "coordinate" }>,
  ): Locator {
    switch (strategy.kind) {
      case "accessibility":
        if (strategy.role) {
          return root.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
            ...(strategy.name ? { name: strategy.name } : {}),
            exact: strategy.exact,
          });
        }
        return root.locator(`[aria-label=${JSON.stringify(strategy.name)}]`);
      case "label":
        return root.getByLabel(strategy.label, { exact: strategy.exact });
      case "text":
        return root.getByText(strategy.text, { exact: strategy.exact });
      case "selector":
        return root.locator(
          strategy.engine === "xpath" ? `xpath=${strategy.selector}` : strategy.selector,
        );
      case "relative": {
        const anchor = root.getByText(strategy.anchorText, { exact: true }).nth(strategy.ordinal - 1);
        const controlSelector = this.relativeControlSelector(strategy.controlHint);
        if (strategy.relation === "within") {
          return anchor.locator(`xpath=descendant::*[${controlSelector}][1]`);
        }
        if (strategy.relation === "following") {
          return anchor.locator(`xpath=following::*[${controlSelector}][1]`);
        }
        if (strategy.relation === "preceding") {
          return anchor.locator(`xpath=preceding::*[${controlSelector}][1]`);
        }
        return anchor
          .locator("xpath=ancestor::*[self::tr or self::div or self::fieldset][1]")
          .locator(`xpath=descendant::*[${controlSelector}][1]`);
      }
    }
  }

  private relativeControlSelector(controlHint?: string): string {
    if (controlHint === "value") {
      return "self::output or self::input or contains(@class, 'value') or @data-value";
    }
    if (controlHint === "button") return "self::button or @role='button'";
    if (controlHint === "link") return "self::a or @role='link'";
    return "self::input or self::select or self::button or self::a or self::output";
  }

  private async evaluateAtomic(
    state: PlaywrightSessionState,
    checkpoint: AtomicCheckpoint,
  ): Promise<CheckpointEvaluation> {
    if (checkpoint.kind === "output") {
      return {
        matched: false,
        message: "Output checkpoints are evaluated by replay, not by the surface adapter",
      };
    }

    if (checkpoint.kind === "url") {
      const observed = state.page.url();
      return this.compare(observed, checkpoint.operator, checkpoint.expected);
    }

    const runtimeRef = state.targetRefsById.get(checkpoint.targetId);
    const target = runtimeRef ? state.targetsByRef.get(runtimeRef) : undefined;
    if (!target || target.kind !== "locator") {
      return {
        matched: false,
        message: `Target '${checkpoint.targetId}' has not been resolved to an element`,
      };
    }

    try {
      if (checkpoint.kind === "element_state") {
        // Replay uses a one-millisecond probe budget and owns the outer wait loop.
        // A waitFor deadline this small can expire before reading an already-visible node.
        if (checkpoint.timeoutMs === 1) {
          const attached = await target.locator.count() > 0;
          let matched: boolean;
          if (checkpoint.state === "attached") matched = attached;
          else if (checkpoint.state === "detached") matched = !attached;
          else if (checkpoint.state === "visible") matched = attached && await target.locator.isVisible();
          else if (checkpoint.state === "hidden") matched = !attached || await target.locator.isHidden();
          else matched = attached && (await target.locator.isEnabled()) === (checkpoint.state === "enabled");
          return { matched, observed: matched ? checkpoint.state : "not_matched" };
        }
        if (["visible", "hidden", "attached", "detached"].includes(checkpoint.state)) {
          await target.locator.waitFor({
            state: checkpoint.state as "visible" | "hidden" | "attached" | "detached",
            timeout: checkpoint.timeoutMs,
          });
          return { matched: true, observed: checkpoint.state };
        }
        const enabled = await target.locator.isEnabled({ timeout: checkpoint.timeoutMs });
        const expectedEnabled = checkpoint.state === "enabled";
        return {
          matched: enabled === expectedEnabled,
          observed: enabled ? "enabled" : "disabled",
        };
      }

      const observed =
        checkpoint.kind === "text"
          ? ((await target.locator.textContent({ timeout: checkpoint.timeoutMs })) ?? "")
          : await target.locator.inputValue({ timeout: checkpoint.timeoutMs });
      return this.compare(
        observed,
        checkpoint.operator,
        this.literalString(checkpoint.expected),
      );
    } catch (error) {
      return { matched: false, message: this.errorMessage(error) };
    }
  }

  private compare(
    observed: string,
    operator: "equals" | "contains" | "matches",
    expected: string,
  ): CheckpointEvaluation {
    let matched = false;
    try {
      matched =
        operator === "equals"
          ? observed === expected
          : operator === "contains"
            ? observed.includes(expected)
            : new RegExp(expected).test(observed);
    } catch (error) {
      return { matched: false, observed, message: this.errorMessage(error) };
    }
    return {
      matched,
      observed,
      ...(!matched ? { message: `Expected '${observed}' to ${operator} '${expected}'` } : {}),
    };
  }

  private literalString(expression: ValueExpression): string {
    if (expression.source !== "literal") {
      throw new PlaywrightSurfaceError(
        "unbound_value_expression",
        "Surface checkpoints require replay to bind input/output expressions first",
      );
    }
    return String(expression.value);
  }

  private transition(state: PlaywrightSessionState, phase: ControlPhase, owner: ControlOwner): void {
    state.epoch += 1;
    state.phase = phase;
    state.owner = owner;
    state.controlHistory.push({ phase, owner, epoch: state.epoch });
  }

  private getAutomationState(session: SurfaceSession): PlaywrightSessionState {
    const state = this.getState(session);
    state.navigation?.assertAllowed();
    if (state.phase !== "automation_running" || state.owner !== "automation") {
      throw new PlaywrightSurfaceError(
        "session_not_owned",
        `Automation cannot act while session is '${state.phase}' and owned by '${state.owner}'`,
      );
    }
    return state;
  }

  private getState(session: SurfaceSession): PlaywrightSessionState {
    const state = this.sessions.get(session.id);
    if (!state || state.session.kind !== session.kind) {
      throw new PlaywrightSurfaceError("session_not_found", `Unknown surface session '${session.id}'`);
    }
    return state;
  }

  private actionError(error: unknown): SurfaceActionResult {
    if (error instanceof NavigationPolicyError) throw error;
    return {
      ok: false,
      error: {
        code: error instanceof PlaywrightSurfaceError ? error.code : "surface_error",
        message: this.errorMessage(error),
      },
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
