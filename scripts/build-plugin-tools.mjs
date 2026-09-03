/**
 * Writes into lhm.plugin.json the tools the built server declares.
 *
 * The plugin manifest carries a whole copy of every argument schema and every
 * result schema, because the directory reading it renders a form from the first
 * and some hosts validate an answer against the second. A copy written by hand
 * states a second time what the server already states, and the two drift until
 * a host rejects an answer the server gave correctly.
 *
 * So the three fields a tool shares with the server come from the server. What
 * belongs to the directory alone, the display title, the hints and how it runs,
 * is left as it is written here.
 *
 * usage: node scripts/build-plugin-tools.mjs   (after npm run build)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(import.meta.dirname, "..");
const pluginPath = join(root, "lhm.plugin.json");

const client = new Client({ name: "build-plugin-tools", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({ command: "node", args: [join(root, "dist", "index.js")] }),
);
const { tools } = await client.listTools();
await client.close();

const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
const written = new Map((plugin.tools ?? []).map((tool) => [tool.name, tool]));

plugin.tools = tools.map((tool) => {
  const existing = written.get(tool.name);
  if (!existing) {
    process.stderr.write(`${tool.name}: new to this file, give it a title and its hints by hand\n`);
  }
  return {
    ...(existing ?? {}),
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
  };
});

for (const name of written.keys()) {
  if (!tools.some((tool) => tool.name === name)) {
    process.stderr.write(`${name}: dropped, the server no longer registers it\n`);
  }
}

writeFileSync(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);
process.stderr.write(`${plugin.tools.length} tools written\n`);
process.exit(0);
