import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { z } from "zod";
import type { HumanActionRecord, HumanActionRecording } from "../contracts/intervention.js";
import { navigationDiagnostic } from "../contracts/navigation.js";

const message = z.strictObject({ epoch: z.number().int(), kind: z.enum(["click", "type", "select"]),
  targetSummary: z.enum(["button", "link", "input", "select", "editable", "element"]) });
export type HumanRecording = HumanActionRecording;

// Fixed adapter instrumentation, not an action API. Never reads text, labels or input values.
function install({ binding, key }: { binding: string; key: string }): void {
  const scope = window as unknown as Record<string, unknown>;
  if (scope[key]) return;
  const send = scope[binding] as (payload: unknown) => Promise<number | null>;
  const state = { epoch: null as number | null };
  scope[key] = state;
  for (const type of ["click", "input", "change"]) document.addEventListener(type, event => {
    if (state.epoch === null || !event.isTrusted || !(event.target instanceof Element)) return;
    const node = event.target.closest("button,a,input,select,textarea,[contenteditable]") ?? event.target;
    const tag = node.tagName.toLowerCase();
    if (type === "input" && tag === "select") return; // change records selection once.
    if (type === "change" && !["select", "input"].includes(tag)) return;
    if (type === "change" && tag === "input" && !["checkbox", "radio"].includes((node as HTMLInputElement).type)) return;
    const kind = type === "click" ? "click" : type === "change" ? "select" : "type";
    const targetSummary = tag === "button" ? "button" : tag === "a" ? "link"
      : tag === "select" ? "select" : ["input", "textarea"].includes(tag) ? "input"
      : node.hasAttribute("contenteditable") ? "editable" : "element";
    void send({ epoch: state.epoch, kind, targetSummary }).catch(() => { /* Node rejects disconnected/stale events. */ });
  }, true);
  void send(null).then(epoch => { state.epoch = epoch; }).catch(() => {});
}

/** Receipt-scoped metadata, not a trusted-human attestation or a keylogger. */
export class HumanActionRecorder {
  private readonly binding = `handoff_${randomUUID().replaceAll("-", "")}`;
  private readonly key = `${this.binding}_state`;
  private active: HumanRecording | undefined;
  private readonly recordings = new Map<string, HumanRecording>();
  private installed = false;
  constructor(private readonly page: Page, private readonly owns: (epoch: number) => boolean) {}

  async start(interventionId: string, epoch: number): Promise<void> {
    if (!this.installed) {
      await this.page.exposeBinding(this.binding, ({ page }, payload: unknown) => {
        if (page !== this.page) return null;
        if (payload === null) return this.active?.epoch ?? null;
        const parsed = message.safeParse(payload);
        if (parsed.success) this.accept(parsed.data);
        return null;
      });
      await this.page.addInitScript(install, { binding: this.binding, key: this.key });
      this.page.on("framenavigated", frame => {
        const active = this.active;
        if (active && this.owns(active.epoch)) this.append({ at: new Date().toISOString(), kind: "navigate",
          targetSummary: frame === this.page.mainFrame() ? "main-document" : "child-document",
          valueSummary: navigationDiagnostic(frame.url()), redacted: true });
      });
      this.installed = true;
    }
    const recording: HumanRecording = { interventionId, epoch, actions: [], incomplete: false };
    this.recordings.set(interventionId, recording);
    this.active = recording;
    for (const frame of this.page.frames()) {
      await frame.evaluate(install, { binding: this.binding, key: this.key });
      await frame.evaluate(({ key, epoch }) => {
        const scope = window as unknown as Record<string, { epoch: number }>;
        scope[key]!.epoch = epoch;
      }, { key: this.key, epoch });
    }
  }

  /** Node gate closes synchronously, before ownership is restored; old browser tokens are inert. */
  stop(): void { this.active = undefined; }

  accept(payload: z.infer<typeof message>): void {
    const parsed = message.safeParse(payload);
    if (!parsed.success || !this.active || parsed.data.epoch !== this.active.epoch || !this.owns(parsed.data.epoch)) return;
    this.append({ at: new Date().toISOString(), kind: parsed.data.kind,
      targetSummary: parsed.data.targetSummary, redacted: true });
  }

  snapshot(interventionId: string): HumanRecording {
    const recording = this.recordings.get(interventionId);
    if (!recording) throw new Error("Unknown human recording");
    return structuredClone(recording);
  }

  private append(action: HumanActionRecord): void {
    if (!this.active) return;
    if (this.active.actions.length >= 1000) { this.active.incomplete = true; return; }
    this.active.actions.push(action);
  }
}
