import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CapabilityArtifactSchema } from "../src/contracts/index.js";
import { PlaywrightSurfaceAdapter } from "../src/adapters/index.js";
import { ReplayCoordinator } from "../src/replay/index.js";
import fixture from "../examples/member-savings-balance.capability.json" with { type: "json" };

describe("navigation request egress", () => {
  const servers: Server[] = [];
  const hits = new Map<string, number>();
  let origin: string;
  let other: string;
  async function start(): Promise<string> {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      hits.set(url.href, (hits.get(url.href) ?? 0) + 1);
      const destination = url.searchParams.get("to") ?? `${origin}/ok`;
      const escaped = destination.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      res.setHeader("content-type", "text/html");
      if (url.pathname === "/redirect") { res.writeHead(302, { location: destination }); res.end(); return; }
      if (url.pathname === "/post-redirect") { res.writeHead(307, { location: destination }); res.end(); return; }
      let body = "<div id='ready'>Ready</div>";
      switch (url.pathname) {
        case "/link": body = `<a id="go" href="${escaped}">Continue</a>`; break;
        case "/form": body = `<form method="post" action="${escaped}"><input name="fake" value="fixture"><button id="go">Continue</button></form>`; break;
        case "/script": body = `<button id="go" onclick="location.href=this.dataset.to" data-to="${escaped}">Continue</button>`; break;
        case "/popup": body = `<a id="go" href="${escaped}" target="_blank">Continue</a>`; break;
        case "/frame": body += `<iframe src="${escaped}"></iframe>`; break;
        case "/resource": body += `<script src="${escaped}"></script>`; break;
        case "/script.js": res.setHeader("content-type", "application/javascript"); body = "document.body.dataset.resource='loaded'"; break;
      }
      res.end(`<!doctype html><html><body>${body}</body></html>`);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    return `http://127.0.0.1:${address.port}`;
  }
  beforeAll(async () => { origin = await start(); other = await start(); });
  afterAll(async () => { await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections();
  }))); });

  function setup(entry: string, click = true) {
    const artifact = CapabilityArtifactSchema.parse(fixture);
    artifact.target.entryPoint = entry;
    artifact.policy.allowedOrigins = [origin];
    artifact.policy.allowedPathPatterns = ["/link", "/form", "/script", "/popup", "/frame", "/resource", "/redirect", "/post-redirect", "/ok"];
    artifact.policy.allowedActions = ["click", "navigate", "wait"];
    artifact.inputs = []; artifact.outputs = []; artifact.businessOutcomes = []; artifact.runtimeConditions = []; artifact.recoveryPolicies = [];
    artifact.targets = [{ id: "go", description: "Fixture control", strategies: [{ kind: "selector", engine: "css", selector: "#go" }] },
      { id: "ready", description: "Loaded document", strategies: [{ kind: "selector", engine: "css", selector: "#ready" }] }];
    artifact.steps = click ? [{ id: "follow", description: "Follow fixture navigation", risk: "read_only", action: "click", targetId: "go" }]
      : [{ id: "settled", description: "Wait for fixture document", risk: "read_only", action: "wait", checkpoint: { kind: "element_state", targetId: "ready", state: "visible", timeoutMs: 200 } }];
    artifact.successCondition = { kind: "element_state", targetId: "ready", state: "visible", timeoutMs: 200 };
    const adapter = new PlaywrightSurfaceAdapter();
    return { artifact, adapter, run: () => new ReplayCoordinator(adapter, { allowDraft: true }).run(artifact, {}) };
  }
  const entry = (path: string, to: string) => `${origin}${path}?to=${encodeURIComponent(to)}`;
  const count = (url: string) => hits.get(url) ?? 0;

  it.each(["/link", "/form", "/script"])("allows %s document requests", async (path) => {
    const destination = `${origin}/ok?case=allowed-${path.slice(1)}`;
    expect(await setup(entry(path, destination)).run()).toMatchObject({ status: "success" });
    expect(count(destination)).toBe(1);
  });

  it.each(["/link", "/form", "/script"])("blocks cross-origin %s before server receipt", async (path) => {
    const destination = `${other}/private?secret=blocked-${path.slice(1)}`;
    const result = await setup(entry(path, destination)).run();
    expect(result).toMatchObject({ status: "failure", code: "policy_violation", stepId: "follow" });
    expect(result.events).toContainEqual(expect.objectContaining({ type: "policy_decision", decision: "block", action: "navigate" }));
    expect(JSON.stringify(result)).not.toContain("secret=");
    expect(count(destination)).toBe(0);
  });

  it("blocks same-origin paths before route-handler receipt", async () => {
    const destination = `${origin}/forbidden?case=path`;
    expect(await setup(entry("/link", destination)).run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(destination)).toBe(0);
  });

  it("allows frame documents under the same navigation allowlist", async () => {
    const destination = `${origin}/ok?case=frame`;
    expect(await setup(entry("/frame", destination), false).run()).toMatchObject({ status: "success" });
    expect(count(destination)).toBe(1);
  });

  it("blocks frame documents before destination receipt", async () => {
    const destination = `${other}/private?case=frame`;
    expect(await setup(entry("/frame", destination), false).run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(destination)).toBe(0);
  });

  it.each(["/link", "/form", "/frame"])("blocks forbidden redirect hops from %s", async (path) => {
    const destination = `${other}/private?case=redirect-${path.slice(1)}`;
    const second = entry("/redirect", destination);
    const first = entry(path === "/form" ? "/post-redirect" : "/redirect", second);
    expect(await setup(entry(path, first), path !== "/frame").run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(first)).toBe(1); expect(count(second)).toBe(1);
    expect(count(destination)).toBe(0);
  });

  it("allows a fully permitted redirect chain", async () => {
    const destination = `${origin}/ok?case=redirect-allowed`;
    const second = entry("/redirect", destination);
    const first = entry("/redirect", second);
    expect(await setup(entry("/link", first)).run()).toMatchObject({ status: "success" });
    expect(count(first)).toBe(1); expect(count(second)).toBe(1); expect(count(destination)).toBe(1);
  });

  it("guards redirects during initial session opening", async () => {
    const destination = `${other}/private?case=open`;
    const initial = entry("/redirect", destination);
    expect(await setup(initial, false).run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(initial)).toBe(1); expect(count(destination)).toBe(0);
  });

  it("rejects explicit navigation before adapter execution", async () => {
    const destination = `${other}/private?case=explicit`;
    const { artifact, adapter, run } = setup(`${origin}/ok`, false);
    artifact.steps = [{ id: "explicit", description: "Explicit forbidden destination", risk: "read_only", action: "navigate", destination: { source: "literal", value: destination } }];
    const execute = vi.spyOn(adapter, "execute");
    expect(await run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(execute).not.toHaveBeenCalled(); expect(count(destination)).toBe(0);
  });

  it("resolves allowed explicit relative navigation against the current page", async () => {
    const { artifact, run } = setup(`${origin}/ok`, false);
    artifact.steps = [{ id: "explicit", description: "Relative destination", risk: "read_only", action: "navigate", destination: { source: "literal", value: "/ok?case=relative" } }];
    expect(await run()).toMatchObject({ status: "success" });
    expect(count(`${origin}/ok?case=relative`)).toBe(1);
  });

  it("does not block ordinary cross-origin scripts", async () => {
    const destination = `${other}/script.js?case=resource`;
    expect(await setup(entry("/resource", destination), false).run()).toMatchObject({ status: "success" });
    expect(count(destination)).toBe(1);
  });

  it("guards redirect chains initiated inside an already cross-site frame", async () => {
    const crossSite = other.replace("127.0.0.1", "localhost");
    const destination = `${origin}/forbidden?case=cross-site-frame`;
    const redirect = `${crossSite}/redirect?to=${encodeURIComponent(destination)}`;
    const frame = `${crossSite}/link?to=${encodeURIComponent(redirect)}`;
    const { artifact, run } = setup(entry("/frame", frame));
    artifact.policy.allowedOrigins.push(crossSite);
    artifact.targets[0]!.framePath = ["iframe"];
    expect(await run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(frame)).toBe(1); expect(count(redirect)).toBe(1); expect(count(destination)).toBe(0);
  });

  it("guards redirect chains during cross-site frame creation", async () => {
    const crossSite = other.replace("127.0.0.1", "localhost");
    const destination = `${origin}/forbidden?case=initial-cross-site-frame`;
    const redirect = `${crossSite}/redirect?to=${encodeURIComponent(destination)}`;
    const { artifact, run } = setup(entry("/frame", redirect), false);
    artifact.policy.allowedOrigins.push(crossSite);
    expect(await run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(redirect)).toBe(1); expect(count(destination)).toBe(0);
  });

  it("blocks auxiliary popup documents before request egress", async () => {
    const destination = `${other}/private?case=popup`;
    expect(await setup(entry("/popup", destination)).run()).toMatchObject({ status: "failure", code: "policy_violation" });
    expect(count(destination)).toBe(0);
  });
});
