/**
 * The episode list as a reader sees it.
 *
 * Many clients show the text block and nothing else, so a number missing there
 * is a number missing altogether. Printing the placeholder a language leaves
 * behind when a field is read under the wrong name is worse than printing
 * nothing, because it occupies the position of a real value and reads as one.
 */

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { createLogger } from "../../src/config.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const logger = createLogger("silent");

async function connect(): Promise<Client> {
  const server = createServer({ config: testConfig(), logger, fetchImpl: fixtureRouter().impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

const episodesOf = async () => {
  const client = await connect();
  const result = (await client.callTool({
    name: "get_title",
    arguments: { id: 1, kind: "anime", sections: ["episodes"] },
  })) as { content?: { text?: string }[]; structuredContent?: Record<string, unknown> };

  return {
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
    structured: result.structuredContent ?? {},
  };
};

describe("the episode list in the text block", () => {
  it("carries no placeholder where a number belongs", async () => {
    const { text } = await episodesOf();

    expect(text, "a literal 'undefined' reads as data").not.toMatch(/undefined/);
  });

  it("numbers each episode as the encyclopedia does", async () => {
    const { text } = await episodesOf();

    expect(text).toMatch(/1\. Episode Fixture Title One/);
    expect(text).toMatch(/2\. Episode Fixture Title Two/);
  });

  it("says the same thing as the structured payload", async () => {
    const { text, structured } = await episodesOf();
    const episodes = (structured.episodes ?? []) as Array<{ num: string }>;

    expect(episodes.length).toBeGreaterThan(0);
    for (const episode of episodes) {
      expect(text, `episode ${episode.num} missing from the text`).toContain(`${episode.num}. `);
    }
  });
});
