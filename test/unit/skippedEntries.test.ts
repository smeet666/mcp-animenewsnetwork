/**
 * What a caller is told about entries the site sent and this server could not
 * read.
 *
 * A page answered with twenty entries of which five are unreadable holds
 * fifteen rows, and reporting fifteen as what the site answered with states a
 * number nobody measured. The gap belongs in the answer, beside the rows.
 *
 * The count travels with the data through the cache. A gap reported on the
 * first read and silent on every read served from memory afterwards is the same
 * defect entered by a second door.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { AnnClient } from "../../src/ann/client.js";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const logger = createLogger("silent");

interface CallResult {
  isError?: boolean;
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
}

interface Listing {
  notes: string[];
  total_available: number;
}

const ROUTES = {
  "api.xml?title=": "title-missing-attrs.xml",
  "rss.xml": "feed-partial.xml",
} as const;

async function connect(fetchImpl: typeof fetch): Promise<Client> {
  const server = createServer({ config: testConfig(), logger, fetchImpl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "skipped-entries", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function callOnPartialData(
  name: string,
  args: Record<string, unknown>,
): Promise<{ structured: Listing; text: string }> {
  const client = await connect(fixtureRouter(ROUTES).impl);
  const result = (await client.callTool({ name, arguments: args })) as CallResult;

  return {
    structured: result.structuredContent as unknown as Listing,
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
  };
}

describe("the read layer, on a page it could only partly read", () => {
  it("counts the news entries the wire published and it could not read", async () => {
    const client = new AnnClient({
      config: testConfig(),
      logger,
      fetchImpl: fixtureRouter(ROUTES).impl,
    });
    const outcome = await client.getNews("all", "us");

    expect(outcome.data).toHaveLength(3);
    expect(outcome.skipped).toBe(2);
  });

  it("counts the search records the encyclopedia sent and it could not read", async () => {
    const client = new AnnClient({
      config: testConfig(),
      logger,
      fetchImpl: fixtureRouter(ROUTES).impl,
    });
    const outcome = await client.searchTitles("placeholder");

    expect(outcome.data).toHaveLength(1);
    expect(outcome.skipped).toBe(2);
  });

  it("carries no count for a page it read whole", async () => {
    // An absent count and a count of zero say the same thing, and only one of
    // them makes a reader wonder what was measured.
    const client = new AnnClient({
      config: testConfig(),
      logger,
      fetchImpl: fixtureRouter().impl,
    });
    const outcome = await client.getNews("all", "us");

    expect(outcome.skipped).toBeUndefined();
  });

  it("reports the same gap on a read served from the cache", async () => {
    const client = new AnnClient({
      config: testConfig({ newsCacheTtlMs: 60_000, cacheMaxEntries: 10 }),
      logger,
      fetchImpl: fixtureRouter(ROUTES).impl,
    });

    const first = await client.getNews("all", "us");
    const second = await client.getNews("all", "us");

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.skipped, "the gap left the answer once it came from memory").toBe(first.skipped);
  });
});

describe("what get_news tells a caller about the gap", () => {
  it("names how many entries could not be read", async () => {
    const { structured } = await callOnPartialData("get_news", { limit: 20 });

    expect(structured.notes.join(" ")).toMatch(/2 .*could not be read|could not be read.*2/i);
  });

  it("says nothing about a gap on a feed it read whole", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = (await client.callTool({
      name: "get_news",
      arguments: { limit: 20 },
    })) as CallResult;
    const structured = result.structuredContent as unknown as Listing;

    expect(structured.notes.join(" ")).not.toMatch(/could not be read/i);
  });
});

describe("what search_titles tells a caller about the gap", () => {
  it("names how many records could not be read", async () => {
    const { structured } = await callOnPartialData("search_titles", { query: "placeholder" });

    expect(structured.notes.join(" ")).toMatch(/2 .*could not be read|could not be read.*2/i);
  });

  it("keeps counting what the answer holds", async () => {
    // The figure stays the one the rows support. The gap is stated beside it
    // rather than folded into it, so neither number is a guess.
    const { structured } = await callOnPartialData("search_titles", { query: "placeholder" });

    expect(structured.total_available).toBe(1);
  });

  it("says nothing about a gap on a response it read whole", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = (await client.callTool({
      name: "search_titles",
      arguments: { query: "placeholder" },
    })) as CallResult;
    const structured = result.structuredContent as unknown as Listing;

    expect(structured.notes.join(" ")).not.toMatch(/could not be read/i);
  });
});
