/**
 * A story the wire tags several ways at once.
 *
 * Anime News Network tags roughly one story in ten with more than one category,
 * and reading the first tag alone hides the rest. A filter matched against that
 * one tag drops stories the wire really did tag the way that was asked for, and
 * the answer reports the remainder as the whole.
 *
 * The sharpest form is the note: a feed carrying stories under a category can
 * answer that no story is tagged that way, while listing the categories it
 * claims to carry with that very one missing.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { parseFeed } from "../../src/ann/parseFeed.js";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fixtureRouter, fixtureText, testConfig } from "./_helpers.js";

const logger = createLogger("silent");
const feed = fixtureText("feed.xml");
const FEED_URL = "https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us";

interface CallResult {
  content?: { text?: string }[];
  structuredContent?: Record<string, unknown>;
}

interface NewsOut {
  items: { title: string; categories: string[] }[];
  total_available: number;
  notes: string[];
}

async function getNews(args: Record<string, unknown>): Promise<{
  structured: NewsOut;
  text: string;
}> {
  const server = createServer({ config: testConfig(), logger, fetchImpl: fixtureRouter().impl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "news-categories", version: "0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const result = (await client.callTool({ name: "get_news", arguments: args })) as CallResult;

  return {
    structured: result.structuredContent as unknown as NewsOut,
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
  };
}

describe("the tags a feed entry carries", () => {
  const items = parseFeed(feed, FEED_URL);

  it("keeps every one of them", () => {
    const many = items.find((item) => item.title.endsWith("8"));

    expect(many?.categories).toEqual(["Anime", "Manga", "Events"]);
  });

  it("keeps the single tag of a story carrying one", () => {
    expect(items[0]?.categories).toEqual(["Manga"]);
  });

  it("reports a story the wire tagged nowhere as an empty list", () => {
    // An empty list and an absence say the same thing about tags, and the list
    // spares every reader a null check on a field that is always a list.
    expect(items[2]?.categories).toEqual([]);
  });
});

describe("a filter on a category the wire tags a story with second", () => {
  it("keeps a story tagged that way behind another tag", async () => {
    // Two stories in this feed carry Events, and neither carries it first.
    const { structured } = await getNews({ category: "Events", limit: 50 });

    expect(structured.items).toHaveLength(2);
  });

  it("counts those stories in what it reports as available", async () => {
    const { structured } = await getNews({ category: "Events", limit: 50 });

    expect(structured.total_available).toBe(2);
  });

  it("matches a tag whatever its position, case for case", async () => {
    const { structured } = await getNews({ category: "manga", limit: 50 });

    expect(structured.items).toHaveLength(5);
    for (const item of structured.items) {
      expect(item.categories.map((one) => one.toLowerCase())).toContain("manga");
    }
  });

  it("names every category the feed carries when nothing matches", async () => {
    const { structured } = await getNews({ category: "Nonesuch", limit: 50 });

    const note = structured.notes.join(" ");
    expect(note).toContain("Events");
    expect(note).toContain("People");
  });
});

describe("what the truncation note counts", () => {
  it("says the count it measured is the one the category matched", async () => {
    // Five stories carry Manga and the feed holds eight. Calling five the
    // number of stories in the feed states a figure nobody measured, and a
    // model reading it stops widening a search that had more to give.
    const { structured } = await getNews({ category: "Manga", limit: 2 });

    const note = structured.notes.find((one) => one.includes("2"));
    expect(note, "no note reported the truncation").toBeDefined();
    expect(note).not.toMatch(/5 stories are in the feed/);
    expect(note).toMatch(/match|tagged/i);
  });

  it("keeps counting the feed itself when no category was asked for", async () => {
    const { structured } = await getNews({ limit: 2 });

    expect(structured.notes.join(" ")).toContain("8");
  });
});
