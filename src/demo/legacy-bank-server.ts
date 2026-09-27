import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

export type LegacyBankScenario =
  | "success"
  | "not-found"
  | "slow"
  | "busy-always"
  | "permission-denied"
  | "intervention";

export type LegacyBankServer = {
  baseUrl: string;
  close(): Promise<void>;
};

const VALID_SCENARIOS = new Set<LegacyBankScenario>([
  "success",
  "not-found",
  "slow",
  "busy-always",
  "permission-denied",
  "intervention",
]);

const MEMBERS: Record<string, { name: string; savings: string }> = {
  "12345": { name: "Jordan Example", savings: "$4,321.09" },
  "67890": { name: "Casey Sample", savings: "$8,765.43" },
};

export async function startLegacyBankServer(
  options: { port?: number; host?: string } = {},
): Promise<LegacyBankServer> {
  const host = options.host ?? "127.0.0.1";
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const scenario = parseScenario(url.searchParams.get("scenario"));

    response.setHeader("Content-Security-Policy", "default-src 'self'; frame-src 'self'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");

    if (url.pathname === "/" || url.pathname === "/member-search") {
      sendHtml(response, 200, searchPage(scenario));
      return;
    }

    if (url.pathname === "/members/lookup") {
      const memberId = url.searchParams.get("memberNumber")?.trim() ?? "";
      if (scenario === "permission-denied") {
        sendHtml(response, 403, permissionDeniedPage());
        return;
      }
      if (scenario === "not-found" || !Object.hasOwn(MEMBERS, memberId)) {
        sendHtml(response, 200, memberNotFoundPage(memberId));
        return;
      }
      if (scenario === "busy-always" || (scenario === "slow" && url.searchParams.get("recovered") !== "1")) {
        sendHtml(response, 503, busyInterstitialPage(memberId, scenario));
        return;
      }
      sendHtml(response, 200, memberDetailPage(scenario, memberId));
      return;
    }

    const accountMember = /^\/members\/(\d+)\/accounts$/.exec(url.pathname)?.[1];
    if (accountMember && Object.hasOwn(MEMBERS, accountMember)) {
      sendHtml(response, 200, accountsPage(scenario, accountMember));
      return;
    }

    const frameMember = /^\/frames\/accounts\/(\d+)$/.exec(url.pathname)?.[1];
    if (frameMember && Object.hasOwn(MEMBERS, frameMember)) {
      sendHtml(response, 200, accountFrame(frameMember));
      return;
    }

    sendHtml(response, 404, layout("Not found", "<h2>Page not found</h2>"));
  });

  await listen(server, options.port ?? 0, host);
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://${host}:${address.port}`,
    close: () => close(server),
  };
}

function parseScenario(value: string | null): LegacyBankScenario {
  return value && VALID_SCENARIOS.has(value as LegacyBankScenario)
    ? (value as LegacyBankScenario)
    : "success";
}

function searchPage(scenario: LegacyBankScenario): string {
  return layout(
    "Member Inquiry",
    `<table class="shell" cellspacing="0" cellpadding="6">
      <tr><td class="section-title">Member Search</td></tr>
      <tr><td>
        <form method="get" action="/members/lookup">
          <input type="hidden" name="scenario" value="${escapeHtml(scenario)}">
          <table class="form-table">
            <tr>
              <td><span>Member No.</span></td>
              <td><input name="memberNumber" size="18" autocomplete="off"></td>
            </tr>
            <tr>
              <td>Home branch</td>
              <td>
                <select name="branch">
                  <option value="all">All branches</option>
                  <option value="downtown">Downtown</option>
                </select>
              </td>
            </tr>
            <tr><td></td><td><input type="submit" value="Search"></td></tr>
          </table>
        </form>
      </td></tr>
    </table>`,
  );
}

function memberNotFoundPage(memberId: string): string {
  return layout(
    "Member Inquiry Result",
    `<table class="message-table"><tr><td class="warning">Member not found</td></tr></table>
     <p>No member matched number <strong>${escapeHtml(memberId || "(blank)")}</strong>.</p>
     <a href="/member-search?scenario=not-found">Return to search</a>`,
  );
}

function busyInterstitialPage(memberId: string, scenario: LegacyBankScenario): string {
  return layout(
    "Host Busy",
    `<div class="interstitial" role="status">
       <h2>Core host is temporarily busy</h2>
       <p>The inquiry can be retried safely.</p>
       <a class="legacy-button" href="/members/lookup?memberNumber=${encodeURIComponent(memberId)}&scenario=${scenario}&recovered=1">Retry inquiry</a>
     </div>`,
  );
}

function permissionDeniedPage(): string {
  return layout(
    "Access denied",
    `<h2>Permission denied</h2>
     <p class="fatal-error">Your operator role cannot access member account information.</p>`,
  );
}

function memberDetailPage(scenario: LegacyBankScenario, memberId: string): string {
  const dialog =
    scenario === "intervention"
      ? `<dialog open aria-label="Unexpected account warning">
           <h3>Unverified account warning</h3>
           <p>A risky account flag requires operator review before continuing.</p>
           <form method="dialog"><button>Operator reviewed</button></form>
         </dialog>`
      : "";
  return layout(
    "Member Detail",
    `${dialog}
     <table class="detail-grid" border="1" cellspacing="0" cellpadding="5">
       <tr><td>Member Number</td><td>${memberId}</td></tr>
       <tr><td>Name</td><td>${MEMBERS[memberId]!.name}</td></tr>
       <tr><td>Status</td><td>Active</td></tr>
     </table>
     <p><a href="/members/${memberId}/accounts?scenario=${escapeHtml(scenario)}">Account Information</a></p>`,
  );
}

function accountsPage(scenario: LegacyBankScenario, memberId: string): string {
  return layout(
    "Account Information",
    `<h2>Account Information</h2>
     <p>Member: ${memberId}</p>
     <iframe name="accountPane" src="/frames/accounts/${memberId}?scenario=${escapeHtml(scenario)}"></iframe>`,
  );
}

function accountFrame(memberId: string): string {
  return `<!doctype html>
  <html><head><meta charset="utf-8"><title>Accounts</title><style>${styles()}</style></head>
  <body>
    <table class="accounts" border="1" cellspacing="0" cellpadding="5">
      <tr><th>Type</th><th>Available Balance</th></tr>
      <tr><td>Savings</td><td><span class="balance-value">${MEMBERS[memberId]!.savings}</span></td></tr>
      <tr><td>Checking</td><td><span class="balance-value">$918.44</span></td></tr>
    </table>
  </body></html>`;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
  <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>${styles()}</style></head>
    <body>
      <table class="masthead"><tr><td><strong>LegacyCore Operations</strong></td><td align="right">Inquiry Terminal</td></tr></table>
      <main>${body}</main>
    </body>
  </html>`;
}

function styles(): string {
  return `
    body { margin: 0; background: #e7e9ec; color: #17202a; font: 14px Arial, sans-serif; }
    .masthead { width: 100%; padding: 10px 16px; color: white; background: #183a63; }
    main { max-width: 760px; margin: 24px auto; padding: 18px; background: white; border: 1px solid #aeb6bf; }
    .shell, .form-table, .message-table, .detail-grid, .accounts { width: 100%; }
    .section-title { color: white; background: #496b91; font-weight: bold; }
    .warning, .fatal-error { color: #8b1a1a; font-weight: bold; }
    input, select, button, .legacy-button { padding: 5px 8px; }
    iframe { width: 100%; min-height: 220px; border: 2px inset #aaa; }
    dialog { max-width: 440px; border: 3px solid #8b1a1a; }
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function sendHtml(response: import("node:http").ServerResponse, status: number, html: string): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const port = Number(process.env["PORT"] ?? "3000");
  const running = await startLegacyBankServer({ port });
  console.log(`Legacy bank proxy listening at ${running.baseUrl}/member-search`);
}
