import { PlaywrightSurfaceAdapter } from "../adapters/index.js";
import { startLegacyBankServer } from "../demo/legacy-bank-server.js";
import { runMemberSavingsLookup } from "./member-savings.js";

const server = await startLegacyBankServer();
try {
  const adapter = new PlaywrightSurfaceAdapter({ headless: true });
  const result = await runMemberSavingsLookup(adapter, server.baseUrl, "12345", "success");
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "success") process.exitCode = 1;
} finally {
  await server.close();
}
