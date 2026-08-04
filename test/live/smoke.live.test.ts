/**
 * Live canary against the real Anime News Network API.
 *
 * The unit tests run against generated XML fixtures. They prove the parsers map
 * a given shape correctly, and they can never tell that the site renamed an
 * element or started answering a different way: the day it does, every fixture
 * test stays green while the published server is broken for everyone. This file
 * is the only thing that catches that, so it runs on a schedule in CI and
 * asserts each element the parsers depend on, so a failure names what moved.
 *
 * One request per endpoint, since the site allows one request per second and
 * this suite is a guest on it.
 *
 * Excluded from the ordinary CI run: enable with ANN_LIVE=1.
 */

import { describe, expect, it } from "vitest";
import { AnnClient } from "../../src/ann/client.js";
import { createLogger, loadConfig } from "../../src/config.js";

const enabled = process.env.ANN_LIVE === "1";

describe.runIf(enabled)("live Anime News Network", () => {
  const client = new AnnClient({ config: loadConfig(), logger: createLogger("info") });

  it("still returns every field a search row is built from", async () => {
    const search = await client.searchTitles("cowboy bebop");

    expect(
      search.data.length,
      "no result at all: the <anime> and <manga> records may have moved",
    ).toBeGreaterThan(0);

    const first = search.data[0]!;
    expect(first.id, "the id attribute is missing or not numeric").toBeGreaterThan(0);
    expect(first.name, "the name attribute is empty: it may have been renamed").not.toBe("");
    expect(first.kind, "kind is read from the element name, which changed").toMatch(
      /^(anime|manga)$/,
    );
    expect(first.sourceUrl, "attribution needs a link to the encyclopedia page").toContain(
      "animenewsnetwork.com/encyclopedia/",
    );
    expect(
      search.data.some((title) => title.type !== null),
      "no row carried a type attribute: it may have been renamed",
    ).toBe(true);
    expect(
      search.data.some((title) => title.precision !== null),
      "no row carried a precision attribute: it may have been renamed",
    ).toBe(true);
  }, 120_000);

  it("still keeps the records out of search results", async () => {
    // The reason this server exists. The raw response for a common query runs to
    // 1.4 MB because every match embeds its full record: cast, staff, episodes
    // and linked news. If that stripping ever regresses it must fail loudly
    // rather than quietly cost every user their context window.
    const search = await client.searchTitles("one piece");
    const serialized = JSON.stringify(search.data);

    expect(serialized, "a cast credit leaked into search results").not.toContain('"role"');
    expect(serialized, "a staff credit leaked into search results").not.toContain('"task"');
    expect(serialized, "an episode leaked into search results").not.toContain('"episodes"');
    expect(
      serialized.length,
      `search results weigh ${serialized.length} bytes; the records are leaking through`,
    ).toBeLessThan(5_000);
  }, 120_000);

  it("still answers a search that matches nothing with an empty list", async () => {
    // The site reports an empty search with the same <warning> element it uses
    // for a failed lookup. Reading that as an error sent the model back to
    // search_titles, the tool that had just answered it.
    const search = await client.searchTitles("zzqqxx no such title zzqqxx");
    expect(search.data, "an empty search is no longer a plain empty result").toEqual([]);
  }, 120_000);

  it("still returns every section a title record is read from", async () => {
    // Cowboy Bebop, the record every shape in the parser was written against.
    const title = await client.getTitle("anime", 13);

    expect(title.data.name, "the name attribute is empty").not.toBe("");
    expect(title.data.type, "the type attribute is missing").not.toBeNull();
    expect(title.data.vintage, 'the "Vintage" info type may have been renamed').not.toBeNull();
    expect(
      title.data.plotSummary,
      'the "Plot Summary" info type may have been renamed',
    ).toBeTruthy();
    expect(
      title.data.genres.length,
      'the "Genres" info type may have been renamed',
    ).toBeGreaterThan(0);
    expect(title.data.cast.length, "the <cast> element may have moved").toBeGreaterThan(0);
    expect(title.data.staff.length, "the <staff> element may have moved").toBeGreaterThan(0);
    expect(title.data.episodes.length, "the <episode> element may have moved").toBeGreaterThan(0);
    expect(
      title.data.ratings?.votes,
      "the <ratings> attributes may have been renamed",
    ).toBeGreaterThan(0);
    expect(
      title.data.cast.some((credit) => credit.lang !== null),
      "no credit carried a dub language: the lang attribute may have moved",
    ).toBe(true);
    expect(
      title.data.cast.some((credit) => credit.lang === null),
      "every credit carried a language: the original cast is being read as a dub",
    ).toBe(true);
  }, 120_000);

  it("still reports an unknown id with a warning rather than an empty record", async () => {
    // The single most important upstream behaviour: failures arrive as HTTP 200
    // with a <warning> element. If that stopped being detected, the server would
    // report a title that does not exist as an empty entry.
    await expect(
      client.getTitle("anime", 99999999),
      "an unknown id no longer surfaces as not_found",
    ).rejects.toMatchObject({ code: "not_found" });
  }, 120_000);

  it("still returns readable rows from the recently added report", async () => {
    const page = await client.listRecent("anime", 5, 0);

    expect(
      page.data.itemCount,
      "reports.xml returned no <item>: the report id may have moved",
    ).toBe(5);
    expect(
      page.data.rows.length,
      `${page.data.itemCount - page.data.rows.length} of 5 entries could not be read: the item shape may have changed`,
    ).toBe(5);
    const first = page.data.rows[0]!;
    expect(first.name, "the linking element carries no text").not.toBe("");
    expect(first.id, "no id could be read from the href").not.toBeNull();
    expect(first.kind, "the linking element name is no longer the kind").toBe("anime");
    expect(first.dateAdded, "the <date_added> element may have been renamed").not.toBeNull();
    expect(first.sourceUrl, "attribution needs a link on every row").toContain(
      "animenewsnetwork.com",
    );
  }, 120_000);

  it("still returns readable rows from the alphabetical title report", async () => {
    const page = await client.browseTitles({ limit: 5, offset: 0, type: "anime", startsWith: "Z" });

    expect(page.data.itemCount, "report 155 returned no <item>").toBeGreaterThan(0);
    expect(
      page.data.rows.length,
      "no item in report 155 could be read: its shape may have changed",
    ).toBe(page.data.itemCount);
    const first = page.data.rows[0]!;
    expect(first.name, "the <name> element may have been renamed").not.toBe("");
    expect(first.id, "the <id> element may have been renamed").not.toBeNull();
    expect(
      first.sourceUrl,
      "this shape carries no href, so the link is built from the id",
    ).toContain("animenewsnetwork.com/encyclopedia/");
  }, 120_000);

  it("still returns a readable news feed", async () => {
    const news = await client.getNews("all", "us");

    expect(news.data.length, "the RSS channel returned no <item>").toBeGreaterThan(0);
    const first = news.data[0]!;
    expect(first.title, "the <title> element is empty").not.toBe("");
    expect(first.link, "the <link> element is empty").toContain("animenewsnetwork.com");
    expect(
      first.publishedAt,
      "the <pubDate> element may have been renamed or reformatted",
    ).not.toBeNull();
    expect(
      Number.isNaN(new Date(first.publishedAt as string).getTime()),
      `pubDate no longer converts to ISO 8601: got "${first.publishedAt}"`,
    ).toBe(false);
    expect(
      news.data.some((item) => item.category !== null),
      "no story carried a <category>: the element may have been dropped",
    ).toBe(true);

    // The wire wraps series titles in inline markup, escaped inside the
    // description. A summary that still carries tags is being handed to a model
    // as literal angle brackets.
    for (const item of news.data) {
      if (item.summary === null) continue;
      expect(item.summary, `markup survived in the summary of "${item.title}"`).not.toMatch(
        /<[a-z/!]/i,
      );
    }
  }, 120_000);

  it("serves a repeated request from cache", async () => {
    const first = await client.searchTitles("bebop");
    const second = await client.searchTitles("bebop");
    expect(first.cached).toBe(false);
    expect(second.cached, "the second identical request went back to the network").toBe(true);
  }, 120_000);
});
