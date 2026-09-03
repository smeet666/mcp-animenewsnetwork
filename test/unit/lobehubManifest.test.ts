/**
 * The plugin manifest, held against the server it describes.
 *
 * A host reads this file to learn what the tools take and what they answer
 * with, and some validate a response against the schema it publishes. The file
 * is written by hand and carries the whole of both schemas, so it is the second
 * place the same thing is stated, and two statements of one thing drift until
 * neither can settle the other.
 *
 * The agreement is asserted rather than the values, so it survives the day a
 * tool gains an argument.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const ROOT = join(import.meta.dirname, "..", "..");

interface ManifestTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

const manifest = JSON.parse(readFileSync(join(ROOT, "lhm.plugin.json"), "utf8")) as {
  tools: ManifestTool[];
};

let served: Awaited<ReturnType<Client["listTools"]>>["tools"];

beforeAll(async () => {
  const server = createServer({
    config: testConfig(),
    logger: createLogger("silent"),
    fetchImpl: fixtureRouter().impl,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "lobehub-manifest", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  served = (await client.listTools()).tools;
});

describe("the tools the manifest announces", () => {
  it("are the ones the server registers, in the same order", () => {
    expect(manifest.tools.map((tool) => tool.name)).toEqual(served.map((tool) => tool.name));
  });

  it("describe each tool in the server's own words", () => {
    for (const tool of served) {
      const announced = manifest.tools.find((one) => one.name === tool.name);
      expect(announced?.description, tool.name).toBe(tool.description);
    }
  });
});

describe("the schemas the manifest publishes", () => {
  it("take what the server takes", () => {
    for (const tool of served) {
      const announced = manifest.tools.find((one) => one.name === tool.name);
      expect(announced?.inputSchema, `${tool.name} inputSchema`).toEqual(tool.inputSchema);
    }
  });

  it("answer with what the server answers with", () => {
    // A field the manifest calls required while a branch of the tool omits it
    // makes a validating host reject an answer the server gave correctly.
    for (const tool of served) {
      const announced = manifest.tools.find((one) => one.name === tool.name);
      expect(announced?.outputSchema, `${tool.name} outputSchema`).toEqual(tool.outputSchema);
    }
  });
});
