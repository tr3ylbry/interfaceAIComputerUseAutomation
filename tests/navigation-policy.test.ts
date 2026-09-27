import { describe, expect, it } from "vitest";
import { evaluateNavigation } from "../src/replay/policy.js";
import { navigationDiagnostic, CapabilityArtifactSchema } from "../src/contracts/index.js";
import fixture from "../examples/member-savings-balance.capability.json" with { type: "json" };

describe("surface-independent navigation policy", () => {
  const policy = { ...CapabilityArtifactSchema.parse(fixture).policy,
    allowedOrigins: ["https://EXAMPLE.test:443"], allowedPathPatterns: ["/allowed", "/allowed/*"] };
  const source = "https://example.test/allowed";
  it.each([
    ["/allowed", "allow"], ["/allowed/child", "allow"], ["/allowed/child?q=anything#fragment", "allow"],
    ["https://example.test:443/allowed", "allow"], ["https://example.test:444/allowed", "block"],
    ["child", "block"], ["./allowed/child", "allow"], ["//elsewhere.test/allowed", "block"],
    ["/allowed/%63hild", "allow"], ["/allowed/%2Fother", "block"], ["/allowed/%255cother", "block"],
    ["/allowed/%2e%2e/forbidden", "block"], ["/allowed/../forbidden", "block"],
    ["/allowed/file%2ename", "block"], ["/allowed/%", "block"],
    ["https://user:secret@example.test/allowed", "block"], ["data:text/html,hi", "block"], ["file:///allowed", "block"],
  ])("normalizes %s to %s", (destination, decision) => {
    expect(evaluateNavigation(policy, source, destination).decision).toBe(decision);
  });
  it("requires an allowed source context", () => {
    expect(evaluateNavigation(policy, "https://elsewhere.test/allowed", source)).toMatchObject({ decision: "block", reason: "source_not_allowed" });
  });
  it("matches literal paths exactly, including trailing slashes and regex characters", () => {
    const literal = { ...policy, allowedPathPatterns: ["/allowed", "/allowed/a+b"] };
    expect(evaluateNavigation(literal, source, "/allowed/").decision).toBe("block");
    expect(evaluateNavigation(literal, source, "/allowed/a+b").decision).toBe("allow");
    expect(evaluateNavigation(literal, source, "/allowed/ab").decision).toBe("block");
  });
  it("does not interpret configured full URLs as origin-only rules", () => {
    expect(evaluateNavigation({ ...policy, allowedOrigins: ["https://example.test/allowed"] }, source, source).decision).toBe("block");
  });
  it("omits credentials, path identifiers, query and fragment from diagnostics", () => {
    expect(navigationDiagnostic("https://user:secret@example.test/member/12345?token=private#secret")).toBe("https://example.test/[redacted]");
    expect(navigationDiagnostic("not a url")).toBe("[redacted]");
  });
});
