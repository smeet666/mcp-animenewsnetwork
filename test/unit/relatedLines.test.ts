/**
 * The "related" lines of the get_title text block.
 *
 * A related row is an id, a relation and a direction. The site states the
 * catalogue of the entry being read, and it states nothing about the catalogue
 * of the entry a related row points at: anime 4658 carries a related row whose
 * id 4199 belongs to the manga catalogue, while the anime catalogue answers
 * that id with no result at all. Anime ids and manga ids share one integer
 * range, so the id alone cannot say which catalogue holds it. The line
 * therefore carries the id and leaves the address to a caller who has resolved
 * the catalogue.
 */

import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLogger } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import type { AnnClient } from "../../src/ann/client.js";
import { runGetTitle } from "../../src/tools/getTitle.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const EM_DASH = "—";

const RELEASE_HREF = "https://www.animenewsnetwork.com/encyclopedia/releases.php?id=27681";
const NEWS_HREF = "https://www.animenewsnetwork.com/news/1998-09-21/placeholder-1";
const REVIEW_HREF = "https://www.animenewsnetwork.com/review/placeholder-1";

/**
 * An anime whose two related rows point one way each.
 *
 * The ids are the ones the live site exposes on this pair: 4199 is the manga
 * "Jinki: Extend" that the anime was adapted from, and the anime catalogue
 * holds no entry under it.
 */
const TITLE = {
  id: 4658,
  kind: "anime" as const,
  type: "TV",
  name: "Jinki:Extend",
  precision: "TV",
  vintage: "2005-01-07",
  plotSummary: "Un équipage de pilotes de robots.",
  altTitles: [],
  genres: [],
  themes: [],
  cast: [],
  staff: [],
  companies: [],
  episodes: [],
  episodeCount: null,
  releases: [{ name: "Complete Collection (Blu-ray)", date: "2014-12-16", href: RELEASE_HREF }],
  related: [
    { id: 4199, relation: "adapted from", direction: "prev" as const },
    { id: 7788, relation: "sequel", direction: "next" as const },
  ],
  news: [{ title: "News Headline Fixture 1", href: NEWS_HREF, date: "1998-09-21" }],
  reviews: [{ title: "Review Fixture Title 1", href: REVIEW_HREF, date: null }],
  ratings: null,
  sourceUrl: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=4658",
};

const ALL_SECTIONS = ["releases", "related", "news", "reviews"] as const;

const clientFor = (detail: unknown): AnnClient =>
  ({ getTitle: async () => ({ data: detail, cached: false }) }) as unknown as AnnClient;

async function render(
  overrides: Record<string, unknown> = {},
  sections: readonly string[] = ALL_SECTIONS,
  kind: "anime" | "manga" = "anime",
) {
  const result: any = await runGetTitle(clientFor({ ...TITLE, kind, ...overrides }), {
    id: TITLE.id,
    kind,
    sections: sections as string[],
    max_chars: 4000,
    offset: 0,
  } as any);
  return {
    text: result.content[0].text as string,
    structured: result.structuredContent as Record<string, unknown>,
  };
}

/**
 * The indented rows printed under one heading.
 *
 * Scoped to the section body because the credit line at the foot of every
 * answer carries an address of its own.
 */
function rowsUnder(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) {
    return [];
  }
  const rows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      break;
    }
    rows.push(line);
  }
  return rows;
}

describe("a related line in the text block", () => {
  describe("the address it withholds", () => {
    it("carries no address for a related entry", async () => {
      // The catalogue of the related entry is unstated, so any address would
      // be built by guessing between two catalogues that share one id range.
      const { text } = await render();

      for (const row of rowsUnder(text, "Related:")) {
        expect(row, "a related line offers an address the row never stated").not.toMatch(
          /https?:\/\//,
        );
      }
    });

    it("carries no page of the catalogue the request named", async () => {
      // anime.php?id=4199 reaches nothing on the live site, and reaches an
      // unrelated work wherever the anime catalogue happens to hold that
      // integer.
      const { text } = await render();

      for (const row of rowsUnder(text, "Related:")) {
        expect(row).not.toContain("anime.php");
        expect(row).not.toContain("encyclopedia/");
      }
    });

    it("carries no page of the other catalogue either", async () => {
      // Reading a manga does not settle the catalogue of what it relates to.
      const { text } = await render({}, ALL_SECTIONS, "manga");

      for (const row of rowsUnder(text, "Related:")) {
        expect(row).not.toMatch(/manga\.php|anime\.php/);
      }
    });
  });

  describe("what it carries instead", () => {
    it("prints the relation the site wrote", async () => {
      const { text } = await render();
      const [fromIt, outOfIt] = rowsUnder(text, "Related:") as [string, string];

      expect(fromIt).toContain("adapted from");
      expect(outOfIt).toContain("sequel");
    });

    it("prints the id a caller needs to read the related entry", async () => {
      // Naming the number as an id is what lets a caller pass it to get_title
      // once the catalogue is settled.
      const { text } = await render();
      const [fromIt, outOfIt] = rowsUnder(text, "Related:") as [string, string];

      expect(fromIt, "the id reached the reader unnamed").toMatch(/\bid:? ?4199\b/);
      expect(outOfIt).toMatch(/\bid:? ?7788\b/);
    });

    it("says the direction in words a reader understands", async () => {
      const { text } = await render();
      const [fromIt, outOfIt] = rowsUnder(text, "Related:") as [string, string];

      expect(fromIt, "the stored token reached the reader as the direction").not.toMatch(
        /(^|\W)prev(\W|$)/,
      );
      expect(outOfIt).not.toMatch(/(^|\W)next(\W|$)/);
    });

    it("tells what this entry came from apart from what came out of it", async () => {
      const { text } = await render({
        related: [
          { id: 4199, relation: "adapted from", direction: "prev" },
          { id: 7788, relation: "adapted from", direction: "next" },
        ],
      });
      const [fromIt, outOfIt] = rowsUnder(text, "Related:") as [string, string];
      const strip = (row: string) => row.replace(/4199|7788/g, "id");

      expect(
        strip(fromIt),
        "two rows sharing a relation read the same when the direction is dropped",
      ).not.toBe(strip(outOfIt));
    });

    it("keeps the raw row object out of the block a reader is shown", async () => {
      const { text } = await render();

      for (const row of rowsUnder(text, "Related:")) {
        expect(
          row,
          "a serialised row spends the text budget on what the payload holds",
        ).not.toMatch(/\{"/);
      }
      expect(text).not.toContain('"direction"');
    });
  });

  describe("the sections whose rows do carry an address", () => {
    it("prints the address the site published for a release", async () => {
      const { text } = await render();

      expect(rowsUnder(text, "Releases:")[0]).toContain(RELEASE_HREF);
    });

    it("prints the address of a news item beside its headline", async () => {
      const { text } = await render();

      expect(rowsUnder(text, "News:")[0]).toContain(NEWS_HREF);
    });

    it("prints the address of a review beside its headline", async () => {
      const { text } = await render();

      expect(rowsUnder(text, "Reviews:")[0]).toContain(REVIEW_HREF);
    });
  });

  describe("the punctuation of every line", () => {
    it("joins the parts of a row without an em dash", async () => {
      const { text } = await render();

      for (const heading of ["Releases:", "Related:", "News:", "Reviews:"]) {
        for (const row of rowsUnder(text, heading)) {
          expect(row, `${heading} carries a character the house style forbids`).not.toContain(
            EM_DASH,
          );
        }
      }
    });
  });

  describe("the structured payload", () => {
    it("carries the related rows as the parser read them", async () => {
      const { structured } = await render();

      expect(structured.related).toEqual([
        { id: 4199, relation: "adapted from", direction: "prev" },
        { id: 7788, relation: "sequel", direction: "next" },
      ]);
    });

    it("adds no address and no catalogue to a related row", async () => {
      const { structured } = await render();
      const related = (structured.related ?? []) as Record<string, unknown>[];

      for (const row of related) {
        expect(
          Object.keys(row).sort(),
          "the payload states something about the related entry the site did not",
        ).toEqual(["direction", "id", "relation"]);
      }
    });
  });
});

describe("a related entry of a served record", () => {
  async function connect(): Promise<Client> {
    const server = createServer({
      config: testConfig(),
      logger: createLogger("silent"),
      fetchImpl: fixtureRouter().impl,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
  }

  async function served() {
    const client = await connect();
    const result = (await client.callTool({
      name: "get_title",
      arguments: { id: 1, kind: "anime", sections: [...ALL_SECTIONS] },
    })) as { content?: { text?: string }[]; structuredContent?: Record<string, unknown> };
    return {
      client,
      text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
      structured: result.structuredContent ?? {},
    };
  }

  it("names the id of each related entry in the text block", async () => {
    const { text, structured } = await served();
    const related = (structured.related ?? []) as Array<{ id: number }>;
    const rows = rowsUnder(text, "Related:");

    expect(related.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(related.length);
    for (const [index, entry] of related.entries()) {
      expect(rows[index]).toMatch(new RegExp(`\\bid:? ?${entry.id}\\b`));
    }
  });

  it("sends a reader to no page for a related entry", async () => {
    const { text, structured } = await served();
    const related = (structured.related ?? []) as Array<{ id: number }>;

    expect(related.length).toBeGreaterThan(0);
    for (const row of rowsUnder(text, "Related:")) {
      expect(row, "an address was built over an unstated catalogue").not.toMatch(/https?:\/\//);
    }
  });

  it("declares the related row with the three fields the site gives it", async () => {
    const { client } = await served();
    const tools = await client.listTools();
    const getTitle = tools.tools.find((tool) => tool.name === "get_title");
    const related = (getTitle?.outputSchema as any)?.properties?.related;
    // An optional array is published either directly or wrapped in a union
    // with the absent case, so the row shape is read from whichever branch
    // carries it.
    const item = related?.items ?? related?.anyOf?.map((branch: any) => branch.items).find(Boolean);

    expect(Object.keys(item?.properties ?? {}).sort()).toEqual(["direction", "id", "relation"]);
  });
});
