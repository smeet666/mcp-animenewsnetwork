import { describe, expect, it } from "vitest";
import { parseFeed } from "../../src/ann/parseFeed.js";
import { expectAnnError, fixtureText } from "./_helpers.js";

const feed = fixtureText("feed.xml");
const noItems = fixtureText("feed-no-items.xml");
const noChannel = fixtureText("feed-no-channel.xml");
const htmlPage = fixtureText("html-page.html");
const titleRecord = fixtureText("title-anime-full.xml");

const URL = "https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us";

describe("parseFeed", () => {
  const items = parseFeed(feed, URL);

  it("returns one item per entry in the channel", () => {
    expect(items).toHaveLength(6);
  });

  it("reads the title, link and category of an item", () => {
    expect(items[0]).toMatchObject({
      title: "Placeholder Wire Story 1",
      link: "https://www.animenewsnetwork.com/news/2026-08-03/placeholder-story-1",
      category: "Manga",
    });
  });

  it("reports a missing category as null rather than as an empty string", () => {
    expect(items[2]?.category).toBeNull();
  });

  it("ignores the item fields it does not know", () => {
    expect(JSON.stringify(items)).not.toContain("noise the parser must ignore");
  });

  describe("publication dates", () => {
    it("converts an RSS date to ISO 8601", () => {
      const publishedAt = items[0]?.publishedAt;
      expect(publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      expect(new Date(publishedAt as string).getTime()).toBe(
        new Date("Mon, 03 Aug 2026 16:30:00 -0400").getTime(),
      );
    });

    it("passes an unparseable date through rather than dropping it", () => {
      // A date nobody can parse is still what the feed said. Nulling it hides
      // that the format moved, and the raw value is the only clue left.
      expect(items[3]?.publishedAt).toBe("sometime last Thursday");
    });
  });

  describe("summaries", () => {
    it("strips the inline markup the wire wraps titles in", () => {
      // Descriptions arrive escaped and come back out as literal tags, so a
      // model reading the summary would quote "<cite>" at the user.
      expect(items[4]?.summary).toBe(
        "Placeholder Series Alpha debuts in Placeholder Magazine on August 31",
      );
    });

    it("leaves no tag or collapsed whitespace in any summary", () => {
      for (const item of items) {
        if (item.summary === null) continue;
        expect(item.summary, `summary of "${item.title}"`).not.toMatch(/<[a-z/!]/i);
        expect(item.summary, `summary of "${item.title}"`).not.toMatch(/\s{2,}|\n/);
        expect(item.summary).toBe(item.summary.trim());
      }
    });

    it("reports a summary that was nothing but markup as null", () => {
      expect(items[5]?.summary).toBeNull();
    });
  });

  describe("feeds with nothing usable in them", () => {
    it("returns an empty list for a channel that published nothing", () => {
      expect(parseFeed(noItems, URL)).toEqual([]);
    });

    it("fails rather than returning an empty list when there is no channel", () => {
      expectAnnError(() => parseFeed(noChannel, URL), "parse_failure");
    });

    it("reports a body that is not XML as parse_failure", () => {
      expectAnnError(() => parseFeed(htmlPage, URL), "parse_failure");
    });

    it("reports XML with the wrong root as parse_failure", () => {
      expectAnnError(() => parseFeed(titleRecord, URL), "parse_failure");
    });
  });
});
