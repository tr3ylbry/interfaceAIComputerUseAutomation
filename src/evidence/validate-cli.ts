import { readFileSync } from "node:fs";
import { validatePublicDirectory } from "./bundle.js";
import { InventorySchema } from "./schemas.js";
import { PublicationError } from "./publication.js";

// Inventory arrives on stdin, never in public evidence or command-line arguments. No API calls.
try {
  if (process.argv.length !== 3 || process.stdin.isTTY) throw new PublicationError("usage_directory_and_private_inventory_stdin");
  const inventory = InventorySchema.parse(JSON.parse(readFileSync(0, "utf8")));
  if (process.env.OPENAI_API_KEY) inventory.secretValues.push(process.env.OPENAI_API_KEY);
  const files = await validatePublicDirectory(process.argv[2]!, inventory);
  console.log(JSON.stringify({ publicationSafe: true, files: files.map(file => file.filename), unchanged: true }));
} catch (error) {
  console.error(error instanceof PublicationError ? error.message : "Evidence publication validation failed; no content was written.");
  process.exitCode = 1;
}
