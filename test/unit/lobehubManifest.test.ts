/**
 * The plugin manifest, held against the server it describes.
 *
 * A host reads this file to learn what the tools take and what they answer
 * with, and some validate a response against the schema it publishes. The file
 * carries the whole of both schemas, so it is the second place the same thing is
 * stated, and two statements of one thing drift until neither can settle the
 * other.
 *
 * What is asserted is the agreement, the names and what each schema calls
 * required, rather than the JSON the serialiser writes them in. A nullable field
 * has been spelled `anyOf` and `type: [..., "null"]` by two versions of that
 * serialiser, and both say the same thing about the answer. Pinning the spelling
 * would fail on a dependency bump while catching nothing a host would notice.
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

interface Schema {
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: unknown;
}

interface ManifestTool {
  name: string;
  description: string;
  inputSchema: Schema;
  outputSchema: Schema;
}

const manifest = JSON.parse(readFileSync(join(ROOT, "lhm.plugin.json"), "utf8")) as {
  tools: ManifestTool[];
};

/** The names a schema declares, and the ones it says an answer always carries. */
function shapeOf(schema: Schema | undefined): { properties: string[]; required: string[] } {
  return {
    properties: Object.keys(schema?.properties ?? {}).sort(),
    required: [...(schema?.required ?? [])].sort(),
  };
}

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
  it("take the arguments the server takes, and require the same ones", () => {
    for (const tool of served) {
      const announced = manifest.tools.find((one) => one.name === tool.name);
      expect(shapeOf(announced?.inputSchema), `${tool.name} inputSchema`).toEqual(
        shapeOf(tool.inputSchema as Schema),
      );
    }
  });

  it("refuse an undeclared argument wherever the server does", () => {
    for (const tool of served) {
      const announced = manifest.tools.find((one) => one.name === tool.name);
      expect(announced?.inputSchema.additionalProperties, tool.name).toBe(
        (tool.inputSchema as Schema).additionalProperties,
      );
    }
  });

  it("answer with the fields the server answers with, required the same way", () => {
    // A field the manifest calls required while a branch of the tool omits it
    // makes a validating host reject an answer the server gave correctly.
    for (const tool of served) {
      const announced = manifest.tools.find((one) => one.name === tool.name);
      expect(shapeOf(announced?.outputSchema), `${tool.name} outputSchema`).toEqual(
        shapeOf(tool.outputSchema as Schema),
      );
    }
  });
});
