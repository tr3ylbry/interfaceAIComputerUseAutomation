import type { BrowserContext, CDPSession, Frame, Page } from "playwright";
import { NavigationPolicyError, type NavigationGuard } from "../contracts/index.js";

/** Chromium-specific request enforcement. A violation is sticky for the session. */
export class NavigationFirewall {
  private violation: NavigationPolicyError | undefined;
  private readonly attached = new Map<Page | Frame, Promise<void>>();
  private page: Page | undefined;
  private hasCommittedDocument = false;

  constructor(private readonly context: BrowserContext, private readonly entry: string, private readonly guard: NavigationGuard) {}

  assertAllowed(): void { if (this.violation) throw this.violation; }

  private permits(destination: string): boolean {
    if (this.violation) return false;
    const source = this.hasCommittedDocument ? this.page!.url() : this.entry;
    let decision;
    try { decision = this.guard(source, destination); }
    catch { decision = { decision: "block", reason: "navigation_evaluator_failed" }; }
    if (decision.decision === "allow") return true;
    this.violation = new NavigationPolicyError(source, destination, decision.reason);
    return false;
  }

  async install(): Promise<void> {
    // Playwright routes cover new pages/frames before a CDP session can be attached.
    await this.context.route("**/*", async (route) => {
      const request = route.request();
      if (!request.isNavigationRequest()) { await route.continue(); return; }
      if (!this.permits(request.url())) { await route.abort("blockedbyclient"); return; }
      try {
        const frame = request.frame();
        if (frame.page() !== this.page) {
          // This adapter owns one page. Never launch an unguarded auxiliary surface.
          this.violation = new NavigationPolicyError(this.entry, request.url(), "auxiliary_page_not_supported");
          await route.abort("blockedbyclient");
          return;
        }
        await this.attach(frame);
        await route.continue();
      } catch {
        this.violation ??= new NavigationPolicyError(this.entry, request.url(), "navigation_guard_unavailable");
        await route.abort("blockedbyclient").catch(() => undefined);
      }
    });
  }

  async protect(page: Page): Promise<void> {
    this.page = page;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) this.hasCommittedDocument = true;
    });
    await this.attach(page);
  }

  private attach(target: Page | Frame): Promise<void> {
    if (target === this.page?.mainFrame()) return this.attach(this.page!);
    let pending = this.attached.get(target);
    if (!pending) {
      pending = this.attachSession(target);
      this.attached.set(target, pending);
    }
    return pending;
  }

  private async attachSession(target: Page | Frame): Promise<void> {
    let session: CDPSession;
    try { session = await this.context.newCDPSession(target); }
    catch (error) {
      if (target !== this.page && error instanceof Error && error.message.includes("part of the parent frame's session")) {
        this.attached.delete(target); // It may become out-of-process on a later navigation.
        return;
      }
      throw error;
    }
    session.on("close", () => { this.attached.delete(target); });
    // Unlike Playwright routing, Fetch pauses EVERY redirect hop before network egress.
    session.on("Fetch.requestPaused", (event) => {
      const permitted = this.permits(event.request.url);
      void session.send(permitted ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId: event.requestId,
        ...(!permitted ? { errorReason: "BlockedByClient" as const } : {}),
      }).catch(() => {
        this.violation ??= new NavigationPolicyError(this.entry, event.request.url, "navigation_guard_unavailable");
      });
    });
    await session.send("Fetch.enable", { patterns: [{ resourceType: "Document", requestStage: "Request" }] });
  }
}
