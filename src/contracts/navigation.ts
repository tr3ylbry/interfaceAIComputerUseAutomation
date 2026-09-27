/** Runtime-only policy seam; no browser request objects cross this boundary. */
export type NavigationDecision = { decision: "allow" | "block"; reason: string };
/** Synchronous, side-effect-free evaluator. A thrown evaluator error must fail closed. */
export type NavigationGuard = (source: string, destination: string) => NavigationDecision;
export type SurfaceOpenOptions = { navigationGuard?: NavigationGuard };

export class NavigationPolicyError extends Error {
  readonly code = "policy_violation";
  readonly source: string;
  readonly destination: string;
  constructor(source: string, destination: string, readonly reason: string) {
    super("Navigation blocked by policy");
    this.name = "NavigationPolicyError";
    this.source = navigationDiagnostic(source);
    this.destination = navigationDiagnostic(destination);
  }
}

/** URLs may carry identifiers in paths as well as secrets in queries/fragments. */
export function navigationDiagnostic(url: string): string {
  try { return `${new URL(url).origin}/[redacted]`; }
  catch { return "[redacted]"; }
}
