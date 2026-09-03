/**
 * An argument written as nothing at all.
 *
 * A restriction sent as an empty string, or as spaces, carries no restriction.
 * Reading it as "no filter given" answers a different question from the one
 * that was asked, and the answer looks like a filtered one. So it is refused
 * before a request goes out, in the vocabulary every other refusal uses.
 *
 * Everything here goes over the protocol, because the refusal is the server's
 * answer to a client rather than an internal check.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const logger = createLogger("silent");

interface CallResult {
  isError?: boolean;
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
}

async function connect(stub = fixtureRouter()): Promise<{ client: Client; stub: typeof stub }> {
  const server = createServer({ config: testConfig(), logger, fetchImpl: stub.impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "blank-arguments", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, stub };
}

/** What a caller is told, whichever path refused. */
async function refusalOf(name: string, args: Record<string, unknown>): Promise<string> {
  const { client } = await connect();
  try {
    const result = (await client.callTool({ name, arguments: args })) as CallResult;
    if (result.isError !== true) {
      // The sentence carries neither the code nor an argument name, so a call
      // that was accepted cannot satisfy an assertion looking for either.
      return "the call was accepted and answered";
    }
    return (result.content ?? []).map((part) => part.text ?? "").join("\n");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("a category written as nothing", () => {
  it("is refused when it holds only spaces", async () => {
    expect(await refusalOf("get_news", { category: "   " })).toContain("[invalid_input]");
  });

  it("is refused when it is the empty string", async () => {
    expect(await refusalOf("get_news", { category: "" })).toContain("[invalid_input]");
  });

  it("names the argument that was refused", async () => {
    expect(await refusalOf("get_news", { category: "" })).toContain("category");
  });

  it("sends no request to the site", async () => {
    // A refusal that costs the site a round trip is a refusal that arrived too
    // late to be one.
    const { client, stub } = await connect();
    await client.callTool({ name: "get_news", arguments: { category: "  " } }).catch(() => null);

    expect(stub.calls).toHaveLength(0);
  });
});

describe("a starting letter written as nothing", () => {
  it("is refused when it is the empty string", async () => {
    expect(await refusalOf("list_recent", { kind: "anime", starts_with: "" })).toContain(
      "[invalid_input]",
    );
  });

  it("still refuses the browse on a catalogue it does not apply to", async () => {
    // The empty value slipping through would take the call down the recent
    // listing path, where that refusal is never reached, and answer a question
    // about people while the caller asked for an alphabetical browse.
    const refusal = await refusalOf("list_recent", { kind: "person", starts_with: "" });

    expect(refusal).toContain("[invalid_input]");
  });
});

describe("what a value with content still does", () => {
  it("filters on a category written with surrounding spaces", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "get_news",
      arguments: { category: " Anime ", limit: 5 },
    })) as CallResult;

    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as { items: { categories: string[] }[] };
    expect(structured.items.length).toBeGreaterThan(0);
    for (const item of structured.items) {
      expect(item.categories.map((one) => one.toLowerCase())).toContain("anime");
    }
  });

  it("reads the whole feed when no category is given", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "get_news",
      arguments: { limit: 5 },
    })) as CallResult;

    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as { items: unknown[] };
    expect(structured.items.length).toBeGreaterThan(0);
  });

  it("browses titles on a single letter", async () => {
    const { client } = await connect();
    const result = (await client.callTool({
      name: "list_recent",
      arguments: { kind: "anime", starts_with: "P", limit: 5 },
    })) as CallResult;

    expect(result.isError ?? false).toBe(false);
    expect((result.structuredContent as { mode: string }).mode).toBe("browse");
  });
});
