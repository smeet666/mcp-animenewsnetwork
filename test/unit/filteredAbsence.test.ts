/**
 * What search_titles says when its own restriction empties the answer.
 *
 * The encyclopedia matched rows and the server removed them, so the two facts
 * a caller needs are that the restriction did it and what the rows actually
 * were. An answer that reports the emptied set as an unmatched query sends a
 * model on to tell a user the encyclopedia holds nothing under that name.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const logger = createLogger("silent");

interface ToolCallResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

interface SearchOut {
  results: { kind: string }[];
  total_available: number;
  notes: string[];
}

async function connect(fetchImpl: typeof fetch): Promise<Client> {
  const server = createServer({ config: testConfig(), logger, fetchImpl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** A search the encyclopedia answers with three anime and no manga. */
async function searchOneCatalogue(args: Record<string, unknown>): Promise<{
  structured: SearchOut;
  text: string;
}> {
  const client = await connect(
    fixtureRouter({ "api.xml?title=": "search-results-anime-only.xml" }).impl,
  );
  const result = (await client.callTool({
    name: "search_titles",
    arguments: args,
  })) as ToolCallResult;

  return {
    structured: result.structuredContent as unknown as SearchOut,
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
  };
}

describe("a kind restriction that removes every row the site returned", () => {
  it("says the restriction is what emptied the answer", async () => {
    const { structured } = await searchOneCatalogue({ query: "placeholder", kind: "manga" });

    expect(structured.results).toEqual([]);
    expect(structured.notes.join(" ")).toMatch(/kind|restrict|filter/i);
  });

  it("says how many rows the encyclopedia did return", async () => {
    // The count the caller needs is the one before the restriction, since that
    // is the number the site answered with.
    const { structured } = await searchOneCatalogue({ query: "placeholder", kind: "manga" });

    expect(structured.notes.join(" ")).toContain("3");
  });

  it("names the catalogue those rows belong to", async () => {
    // A caller told which kind the matches are can drop the restriction or set
    // it to that kind, and get an answer on the next call.
    const { structured } = await searchOneCatalogue({ query: "placeholder", kind: "manga" });

    expect(structured.notes.join(" ")).toContain("anime");
  });

  it("stops attributing the absence to the title matching of the site", async () => {
    // That note answers a different question, a query the encyclopedia itself
    // matched nothing for, and it sends a caller to shorten a query that was
    // never the problem.
    const { structured } = await searchOneCatalogue({ query: "placeholder", kind: "manga" });

    expect(structured.notes.join(" ")).not.toMatch(/shorter fragment/i);
  });

  it("words the summary as a restriction that matched nothing", async () => {
    const { text } = await searchOneCatalogue({ query: "placeholder", kind: "manga" });

    expect(text).toMatch(/manga/i);
    expect(text).not.toMatch(/No encyclopedia entry matched/i);
  });
});

describe("what the same restriction leaves alone", () => {
  it("answers a search of the catalogue the rows are in", async () => {
    const { structured } = await searchOneCatalogue({ query: "placeholder", kind: "anime" });

    expect(structured.results).toHaveLength(3);
    expect(structured.total_available).toBe(3);
    expect(structured.notes.join(" ")).not.toMatch(/kind|restrict|filter/i);
  });

  it("answers an unrestricted search with every row", async () => {
    const { structured } = await searchOneCatalogue({ query: "placeholder", kind: "both" });

    expect(structured.results.map((row) => row.kind)).toEqual(["anime", "anime", "anime"]);
    expect(structured.notes.join(" ")).not.toMatch(/kind|restrict|filter/i);
  });

  it("keeps blaming the title matching when the site matched nothing at all", async () => {
    // The site answers an empty search with its warning element, so no row was
    // removed by anything this server did.
    const client = await connect(
      fixtureRouter({ "api.xml?title=": "warning-no-search-results.xml" }).impl,
    );
    const result = (await client.callTool({
      name: "search_titles",
      arguments: { query: "zzqq", kind: "manga" },
    })) as ToolCallResult;
    const structured = result.structuredContent as unknown as SearchOut;

    expect(structured.results).toEqual([]);
    expect(structured.total_available).toBe(0);
    expect(structured.notes.join(" ")).toMatch(/shorter fragment|title only/i);
  });
});
