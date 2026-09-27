import { randomUUID } from "node:crypto";
import type { ElementHandle, Frame, Locator, Page } from "playwright";
import type { LocatorStrategy, SurfaceAction, SurfaceActionResult, SurfaceObservation, TargetDescriptor } from "../contracts/index.js";

type Control = { element: ElementHandle<HTMLElement | SVGElement>; snapshot: SurfaceObservation["elements"][number]; framePath: string[]; selector: string; fingerprint: string };

function fingerprint(node: Element): string {
  const input = node as HTMLInputElement;
  const form = node.closest("form");
  // Ignore instrumentation/style attributes; compare only control identity and action semantics.
  return JSON.stringify([node.tagName, node.getAttribute("role"), node.getAttribute("aria-label"), node.getAttribute("aria-labelledby"),
    node.getAttribute("name"), node.getAttribute("type"), node.getAttribute("href"), node.getAttribute("formaction"),
    input.disabled, input.value, node.textContent?.trim(), form?.getAttribute("action"), form?.getAttribute("method")]);
}

// Fixed adapter code, never model-generated code. Not exposed as an action tool.
function structuralSelector(node: Element): string {
  if (node.id) return `#${CSS.escape(node.id)}`;
  const name = node.getAttribute("name");
  if (name) return `${node.tagName.toLowerCase()}[name=${JSON.stringify(name)}]`;
  const parts: string[] = [];
  for (let current: Element | null = node; current; current = current.parentElement) {
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement ? Array.from(current.parentElement.children).filter(child => child.tagName === current!.tagName) : [current];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
  }
  return parts.join(" > ");
}

/** Exact node handles prevent an old index/selector from silently targeting a replacement control. */
export class DiscoveryObservation {
  private readonly controls = new Map<string, Control>();
  constructor(private readonly page: Page, private readonly timeout: number) {}

  async clear(): Promise<void> {
    const controls = [...this.controls.values()];
    this.controls.clear();
    await Promise.all(controls.map(control => control.element.dispose().catch(() => undefined)));
  }

  async observe(): Promise<SurfaceObservation> {
    await this.clear();
    const id = `observation-${randomUUID()}`;
    const elements: SurfaceObservation["elements"] = [];
    for (const frame of this.page.frames().slice(0, 8)) {
      const framePath = await this.framePath(frame);
      const handles = await frame.locator("input:not([type=hidden]), button, select, a, output, td, span, [role], h1, h2, h3, dialog").elementHandles() as ElementHandle<HTMLElement | SVGElement>[];
      for (const element of handles) {
        if (elements.length >= 120 || !await element.isVisible()) { await element.dispose(); continue; }
        const data = await element.evaluate(node => {
          const tag = node.tagName.toLowerCase();
          if (["td", "span"].includes(tag) && node.querySelector("input, button, select, a, span, output")) return null;
          const input = node as HTMLInputElement;
          const label = Array.from(input.labels ?? []).map(label => label.textContent?.trim()).filter(Boolean).join(" ");
          const labelledBy = (node.getAttribute("aria-labelledby") ?? "").split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
          const text = (node.textContent ?? "").trim().slice(0, 300);
          const role = node.getAttribute("role") ?? (tag === "input" ? (["submit", "button"].includes(input.type) ? "button" : "textbox")
            : tag === "a" ? "link" : tag === "select" ? "combobox" : tag === "td" ? "cell" : tag);
          const name = node.getAttribute("aria-label") || labelledBy || label || (["button", "link"].includes(role) ? (input.value || text) : "") || node.getAttribute("title") || "";
          return { role, name: name.slice(0, 200), label: label.slice(0, 200), text,
            value: "value" in input && input.type !== "password" ? input.value.slice(0, 300) : "",
            contextText: node.closest("tr")?.querySelector("td, th")?.textContent?.trim().slice(0, 200) ?? "" };
        });
        if (!data) { await element.dispose(); continue; }
        const bounds = await element.boundingBox();
        const ref = `${id}-element-${elements.length}`;
        const snapshot = { ref, ...data, visible: true, enabled: await element.isEnabled(), ...(bounds ? { bounds } : {}) };
        this.controls.set(ref, { element, snapshot, framePath, selector: await element.evaluate(structuralSelector), fingerprint: await element.evaluate(fingerprint) });
        elements.push(snapshot);
      }
    }
    return { id, capturedAt: new Date().toISOString(), urlOrLocation: this.page.url(), title: await this.page.title(), elements,
      image: { mimeType: "image/png", base64: (await this.page.screenshot({ fullPage: false, timeout: this.timeout })).toString("base64"), redacted: false } };
  }

  has(ref: string): boolean { return this.controls.has(ref); }

  async describe(ref: string, locatorFor: (descriptor: TargetDescriptor) => Locator): Promise<TargetDescriptor> {
    const control = this.required(ref);
    await this.assertFresh(control);
    const { snapshot } = control;
    const candidates: LocatorStrategy[] = [];
    if (snapshot.role && snapshot.name) candidates.push({ kind: "accessibility", role: snapshot.role, name: snapshot.name, exact: true });
    if (snapshot.label) candidates.push({ kind: "label", label: snapshot.label, exact: true });
    if (snapshot.contextText) candidates.push({ kind: "relative", anchorText: snapshot.contextText, relation: "nearest", ordinal: 1,
      controlHint: ["textbox", "combobox"].includes(snapshot.role ?? "") ? "input" : "value" });
    if (snapshot.text) candidates.push({ kind: "text", text: snapshot.text, exact: true });
    candidates.push({ kind: "selector", engine: "css", selector: control.selector });
    const descriptor: TargetDescriptor = { id: "observed-control", description: "Verified observed control", framePath: control.framePath, strategies: [] };
    for (const candidate of candidates) {
      const locator = locatorFor({ ...descriptor, strategies: [candidate] });
      if (await locator.count() !== 1) continue;
      const resolved = await locator.elementHandle();
      try {
        if (resolved && await control.element.evaluate((node, other) => node === other && node.isConnected, resolved)) descriptor.strategies.push(candidate);
      } finally { await resolved?.dispose(); }
    }
    if (!descriptor.strategies.length) throw new Error("No verified locator strategy");
    return descriptor;
  }

  async execute(action: Exclude<SurfaceAction, { kind: "navigate" }>): Promise<SurfaceActionResult> {
    const control = this.required(action.targetRef);
    await this.assertFresh(control);
    const element = control.element;
    const options = { timeout: this.timeout };
    switch (action.kind) {
      case "click": await element.click(options); return { ok: true };
      case "fill":
        if (!action.clearFirst) throw new Error("Discovery only supports replacement fills");
        await element.fill(action.value, options); return { ok: true };
      case "select": return { ok: true, value: await element.selectOption(action.value, options) };
      case "read": return { ok: true, value: action.extraction === "value" ? await element.inputValue(options)
        : action.extraction === "attribute" ? await element.getAttribute(action.attributeName!) : await element.textContent() };
    }
  }

  private required(ref: string): Control {
    const control = this.controls.get(ref);
    if (!control) throw new Error("Unknown or stale observation ref");
    return control;
  }

  private async assertFresh(control: Control): Promise<void> {
    if (!await control.element.evaluate(node => node.isConnected) || await control.element.evaluate(fingerprint) !== control.fingerprint) {
      throw new Error("Observed control changed; a new observation is required");
    }
  }

  private async framePath(frame: Frame): Promise<string[]> {
    if (!frame.parentFrame()) return [];
    const element = await frame.frameElement();
    try { return [...await this.framePath(frame.parentFrame()!), await element.evaluate(structuralSelector)]; }
    finally { await element.dispose(); }
  }
}
