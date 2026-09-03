/**
 * The releases, related, news and reviews sections as a reader sees them.
 *
 * Many clients show the text block and nothing else, so an address missing
 * there is an address missing altogether, and the site asks for a link in
 * return for its data. Each of the four sections carries rows of its own
 * shape: a release has a name, a date and an href; a news item and a review
 * carry a headline and an href; a related entry carries an id, a relation and
 * a direction, and its line names the id, since the site states no catalogue
 * for the entry that id belongs to.
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
 * A record whose four listed sections each hold rows, including a release with
 * neither date nor href, which the release shape allows.
 */
const TITLE = {
  id: 13,
  kind: "anime" as const,
  type: "TV",
  name: "Cowboy Bebop",
  precision: "TV",
  vintage: "1998-04-03",
  plotSummary: "Un équipage de chasseurs de primes.",
  altTitles: [],
  genres: [],
  themes: [],
  cast: [],
  staff: [],
  companies: [],
  episodes: [],
  episodeCount: null,
  releases: [
    { name: "Complete Collection (Blu-ray)", date: "2014-12-16", href: RELEASE_HREF },
    { name: "Remastered Box", date: null, href: null },
  ],
  related: [
    { id: 9001, relation: "sequel of", direction: "next" as const },
    { id: 9101, relation: "sequel of", direction: "prev" as const },
  ],
  news: [{ title: "News Headline Fixture 1", href: NEWS_HREF, date: "1998-09-21" }],
  reviews: [{ title: "Review Fixture Title 1", href: REVIEW_HREF, date: null }],
  ratings: null,
  sourceUrl: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=13",
};

const ALL_SECTIONS = ["releases", "related", "news", "reviews"] as const;

const clientFor = (detail: unknown): AnnClient =>
  ({ getTitle: async () => ({ data: detail, cached: false }) }) as unknown as AnnClient;

const textOf = (result: any) => result.content[0].text as string;

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
  return { text: textOf(result), structured: result.structuredContent as Record<string, unknown> };
}

/**
 * The indented rows printed under one heading.
 *
 * Scoped to the section body because the credit line at the foot of every
 * answer belongs to another writer.
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

describe("the listed sections in the text block", () => {
  describe("releases", () => {
    it("prints the address the site published for a release", async () => {
      const { text } = await render();
      const rows = rowsUnder(text, "Releases:");

      expect(rows[0], "the release name reached the reader without its page").toContain(
        RELEASE_HREF,
      );
    });

    it("prints the release date the row carries", async () => {
      const { text } = await render();

      expect(rowsUnder(text, "Releases:")[0]).toContain("2014-12-16");
    });

    it("names a release the site published no date and no address for", async () => {
      const { text } = await render();
      const bare = rowsUnder(text, "Releases:")[1] as string;

      expect(bare).toContain("Remastered Box");
      expect(bare, "an absent field was rendered as a value").not.toMatch(/null|undefined/);
    });
  });

  describe("news and reviews", () => {
    it("prints the address of a news item beside its headline", async () => {
      const { text } = await render();
      const row = rowsUnder(text, "News:")[0] as string;

      expect(row).toContain("News Headline Fixture 1");
      expect(row, "a headline with no link cannot be credited or opened").toContain(NEWS_HREF);
    });

    it("prints the address of a review beside its headline", async () => {
      const { text } = await render();
      const row = rowsUnder(text, "Reviews:")[0] as string;

      expect(row).toContain("Review Fixture Title 1");
      expect(row, "a headline with no link cannot be credited or opened").toContain(REVIEW_HREF);
    });
  });

  describe("related entries", () => {
    it("prints the relation the site recorded", async () => {
      const { text } = await render();

      for (const row of rowsUnder(text, "Related:")) {
        expect(row).toContain("sequel of");
      }
    });

    it("names the id of a related entry", async () => {
      const { text } = await render();
      const rows = rowsUnder(text, "Related:");

      expect(rows[0]).toMatch(/\bid:? ?9001\b/);
      expect(rows[1]).toMatch(/\bid:? ?9101\b/);
    });

    it("withholds an address whichever catalogue the tool was asked for", async () => {
      const anime = await render();
      const manga = await render({}, ALL_SECTIONS, "manga");

      for (const { text } of [anime, manga]) {
        for (const row of rowsUnder(text, "Related:")) {
          expect(row, "the catalogue of a related entry was guessed").not.toMatch(/https?:\/\//);
        }
      }
    });

    it("tells what this title came from apart from what came out of it", async () => {
      const { text } = await render();
      const [next, previous] = rowsUnder(text, "Related:") as [string, string];
      const strip = (row: string) => row.replace(/9001|9101/g, "id");

      expect(
        strip(next),
        "two entries sharing a relation read the same when the direction is dropped",
      ).not.toBe(strip(previous));
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

  describe("what stays as it is", () => {
    it("heads each section with the word the answer has always used", async () => {
      const { text } = await render();

      for (const heading of ["Releases:", "Related:", "News:", "Reviews:"]) {
        expect(text).toContain(heading);
      }
    });

    it("skips a section the caller did not ask for", async () => {
      const { text } = await render({}, ["releases"]);

      expect(text).toContain("Releases:");
      for (const heading of ["Related:", "News:", "Reviews:"]) {
        expect(text, `${heading} was printed without being asked for`).not.toContain(heading);
      }
    });

    it("skips a requested section the record holds no rows for", async () => {
      const { text } = await render({ releases: [], related: [], news: [], reviews: [] });

      for (const heading of ["Releases:", "Related:", "News:", "Reviews:"]) {
        expect(text, `${heading} was printed over an empty list`).not.toContain(heading);
      }
    });

    it("leaves the structured payload carrying the rows as the parser read them", async () => {
      const { structured } = await render();

      expect(structured.releases).toEqual([
        { name: "Complete Collection (Blu-ray)", date: "2014-12-16", href: RELEASE_HREF },
        { name: "Remastered Box", date: null, href: null },
      ]);
      expect(structured.related).toEqual([
        { id: 9001, relation: "sequel of", direction: "next" },
        { id: 9101, relation: "sequel of", direction: "prev" },
      ]);
      expect(structured.news).toEqual([
        { title: "News Headline Fixture 1", href: NEWS_HREF, date: "1998-09-21" },
      ]);
      expect(structured.reviews).toEqual([
        { title: "Review Fixture Title 1", href: REVIEW_HREF, date: null },
      ]);
    });
  });
});

describe("the listed sections read from a served record", () => {
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
      text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
      structured: result.structuredContent ?? {},
    };
  }

  it("says the same addresses as the structured payload", async () => {
    const { text, structured } = await served();
    const linked = [
      ...((structured.releases ?? []) as Array<{ href: string | null }>),
      ...((structured.news ?? []) as Array<{ href: string | null }>),
      ...((structured.reviews ?? []) as Array<{ href: string | null }>),
    ];

    expect(linked.length).toBeGreaterThan(0);
    for (const row of linked) {
      if (row.href) {
        expect(text, `address missing from the text: ${row.href}`).toContain(row.href);
      }
    }
  });

  it("names the id of each related entry and links to none of them", async () => {
    const { text, structured } = await served();
    const related = (structured.related ?? []) as Array<{ id: number }>;
    const rows = rowsUnder(text, "Related:");

    expect(related.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(related.length);
    for (const [index, entry] of related.entries()) {
      expect(rows[index]).toMatch(new RegExp(`\\bid:? ?${entry.id}\\b`));
      expect(rows[index], "an address was built over an unstated catalogue").not.toMatch(
        /https?:\/\//,
      );
    }
  });
});
