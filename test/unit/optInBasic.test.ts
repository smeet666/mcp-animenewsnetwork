/**
 * What get_title serves when 'basic' is left out of the sections asked for.
 *
 * The tool description says sections are opt-in and lists what 'basic' covers,
 * and the server instructions say the tool returns the sections it was asked
 * for. A caller asking for the news of an entry pays for genres, themes,
 * ratings, the opening themes and up to four thousand characters of plot
 * summary, and reads a note telling it to page a summary it never asked for.
 *
 * The identity of the entry stays, whatever was asked: the name and the link
 * are what a caller cites, and an answer that cannot be attributed is worth
 * less than the request that fetched it.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const logger = createLogger("silent");

interface CallResult {
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
}

/** The fields the description attributes to 'basic'. */
const BASIC_FIELDS = [
  "alt_titles",
  "genres",
  "themes",
  "episode_count",
  "running_time",
  "objectionable_content",
  "official_websites",
  "picture_url",
  "opening_themes",
  "ending_themes",
  "ratings",
  "plot_summary",
  "total_chars",
  "returned_chars",
  "offset",
  "next_offset",
  "truncated",
] as const;

async function getTitle(args: Record<string, unknown>): Promise<{
  structured: Record<string, unknown>;
  text: string;
}> {
  const server = createServer({ config: testConfig(), logger, fetchImpl: fixtureRouter().impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "opt-in-basic", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const result = (await client.callTool({
    name: "get_title",
    arguments: { id: 4241, kind: "anime", ...args },
  })) as CallResult;

  return {
    structured: result.structuredContent ?? {},
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
  };
}

describe("a request that names sections without 'basic'", () => {
  it("serves none of the fields 'basic' covers", async () => {
    const { structured } = await getTitle({ sections: ["news"] });

    for (const field of BASIC_FIELDS) {
      expect(Object.hasOwn(structured, field), `${field} was served unasked`).toBe(false);
    }
  });

  it("serves the section it was asked for", async () => {
    const { structured } = await getTitle({ sections: ["news"] });

    expect(Array.isArray(structured.news)).toBe(true);
  });

  it("keeps the identity of the entry and its link", async () => {
    const { structured } = await getTitle({ sections: ["news"] });
    const title = structured.title as { name: string; source_url: string };

    expect(title.name).toContain("Placeholder");
    expect(title.source_url).toContain("animenewsnetwork.com");
  });

  it("offers no page of a summary nobody asked for", async () => {
    // The note tells a caller to spend another request on an offset into text
    // this answer does not carry.
    const { structured } = await getTitle({ sections: ["news"] });

    expect((structured.notes as string[]).join(" ")).not.toMatch(/offset|plot summary/i);
  });

  it("writes none of those fields into the text block either", async () => {
    // A payload that withholds a field while the text block prints it has
    // withheld nothing.
    const { text } = await getTitle({ sections: ["news"] });

    expect(text).not.toMatch(/Genres:|Themes:|Rating:/);
    expect(text).not.toContain("Plot summary fixture sentence");
  });

  it("serves nothing beyond the entry itself for an empty list of sections", async () => {
    const { structured } = await getTitle({ sections: [] });

    for (const field of BASIC_FIELDS) {
      expect(Object.hasOwn(structured, field), `${field} was served unasked`).toBe(false);
    }
    expect(structured.title).toBeDefined();
  });
});

describe("a request that asks for 'basic'", () => {
  it("serves every field the description attributes to it", async () => {
    const { structured } = await getTitle({ sections: ["basic"] });

    for (const field of BASIC_FIELDS) {
      expect(Object.hasOwn(structured, field), `${field} is missing`).toBe(true);
    }
  });

  it("is what a caller gets by naming no sections at all", async () => {
    const { structured } = await getTitle({});

    for (const field of BASIC_FIELDS) {
      expect(Object.hasOwn(structured, field), `${field} is missing`).toBe(true);
    }
  });

  it("pages a long summary as it says it does", async () => {
    const { structured } = await getTitle({ sections: ["basic"], max_chars: 200 });

    expect(structured.truncated).toBe(true);
    expect(structured.next_offset).toBeGreaterThan(0);
  });
});

describe("the schema published for the tool", () => {
  it("declares as optional every field a request can leave out", async () => {
    // A schema that calls a field required while a branch omits it describes an
    // answer this tool does not always give.
    const server = createServer({ config: testConfig(), logger, fetchImpl: fixtureRouter().impl });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "opt-in-basic-schema", version: "0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const { tools } = await client.listTools();
    const schema = tools.find((tool) => tool.name === "get_title")?.outputSchema as {
      required?: string[];
    };

    for (const field of BASIC_FIELDS) {
      expect(schema.required ?? [], `${field} is declared required`).not.toContain(field);
    }
    expect(schema.required ?? []).toContain("title");
  });
});
