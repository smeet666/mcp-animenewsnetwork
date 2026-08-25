import { describe, expect, it } from "vitest";
import { parseTitleDetail, parseTitleList } from "../../src/ann/parseTitle.js";
import type { TitleSummary } from "../../src/types.js";
import { HEAVY_MARKERS, expectAnnError, fixtureText } from "./_helpers.js";

const fullAnime = fixtureText("title-anime-full.xml");
const manga = fixtureText("title-manga.xml");
const searchResults = fixtureText("search-results.xml");
const missingAttrs = fixtureText("title-missing-attrs.xml");
const htmlPage = fixtureText("html-page.html");
const feed = fixtureText("feed.xml");
const noResult = fixtureText("warning-no-result.xml");
const noSearchResults = fixtureText("warning-no-search-results.xml");
const ignored = fixtureText("warning-ignored.xml");

const URL_DETAIL = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=4241";
const URL_SEARCH = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?title=~placeholder";

/** The fields a search row is allowed to carry, and nothing else. */
const SUMMARY_KEYS = ["id", "kind", "name", "precision", "sourceUrl", "type", "vintage"];

describe("parseTitleList", () => {
  it("returns one row per record", () => {
    const rows = parseTitleList(searchResults, URL_SEARCH);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.id)).toEqual([4241, 4242, 4243, 4244, 4245]);
    expect(rows.map((row) => row.kind)).toEqual(["anime", "anime", "manga", "anime", "manga"]);
  });

  it("reads the summary fields off the record", () => {
    const rows = parseTitleList(searchResults, URL_SEARCH);
    expect(rows[0]).toEqual({
      id: 4241,
      kind: "anime",
      name: "Placeholder Drifters of the Void 1",
      type: "TV",
      precision: "TV",
      vintage: "1998-04-03",
      sourceUrl: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=4241",
    });
  });

  it("links each row to the site page rather than to the API", () => {
    const rows = parseTitleList(searchResults, URL_SEARCH);
    for (const row of rows) {
      expect(row.sourceUrl, `row ${row.id} source_url`).toBe(
        `https://www.animenewsnetwork.com/encyclopedia/${row.kind}.php?id=${row.id}`,
      );
    }
  });

  it("keeps ids numeric", () => {
    const rows = parseTitleList(searchResults, URL_SEARCH);
    for (const row of rows) {
      expect(Number.isInteger(row.id), `id ${String(row.id)} is not an integer`).toBe(true);
    }
  });

  describe("the size guarantee this server exists for", () => {
    // A name search returns the complete record of every match: 1.4 MB for a
    // query like "One Piece", nearly all of it cast, staff, episodes and linked
    // news. Handing that to a model costs a context window per search, so the
    // heavy children must not survive this function.

    it("carries no field beyond the summary shape", () => {
      const rows = parseTitleList(searchResults, URL_SEARCH);
      for (const row of rows) {
        expect(Object.keys(row).sort(), `row ${row.id} keys`).toEqual(SUMMARY_KEYS);
      }
    });

    it("leaks no cast, staff, episode, news or review string", () => {
      const serialized = JSON.stringify(parseTitleList(searchResults, URL_SEARCH));
      for (const marker of HEAVY_MARKERS) {
        // Guards the guard: a marker absent from the fixture would prove nothing.
        expect(searchResults, `"${marker}" is missing from the fixture`).toContain(marker);
        expect(serialized, `"${marker}" leaked into a search result`).not.toContain(marker);
      }
    });

    it("weighs a fraction of the response it was parsed from", () => {
      const serialized = JSON.stringify(parseTitleList(searchResults, URL_SEARCH));
      expect(serialized.length).toBeLessThan(searchResults.length / 5);
    });
  });

  describe("records the parser cannot use", () => {
    it("drops a record it cannot address and keeps the rest", () => {
      // A record without an id or a name cannot be cited or looked up again.
      // Dropping it costs one row; handing back a row whose id is NaN, or whose
      // link says "undefined", costs the caller a failed lookup with no
      // explanation.
      const rows: TitleSummary[] = parseTitleList(missingAttrs, URL_SEARCH);

      expect(rows).toHaveLength(1);
      expect(rows.map((row) => row.name)).toContain("Placeholder Drifters of the Void 1");
      for (const row of rows) {
        expect(Number.isInteger(row.id), `id ${String(row.id)} is not an integer`).toBe(true);
        expect(row.name, "a row came back with no name").not.toBe("");
        expect(row.sourceUrl).not.toContain("undefined");
        expect(row.sourceUrl).not.toContain("NaN");
      }
    });
  });

  describe("failures Anime News Network serves under HTTP 200", () => {
    // Every response is HTTP 200, including the failures, which arrive as a
    // <warning> element. What a warning means depends on what was asked: a
    // search that matched nothing is a legitimate empty answer, and reporting
    // it as an error would send the model back to the tool that just failed.

    it("returns an empty list when a search matched nothing", () => {
      expect(parseTitleList(noSearchResults, URL_SEARCH)).toEqual([]);
      expect(parseTitleList(noResult, URL_SEARCH)).toEqual([]);
    });

    it("reports any other warning as invalid_input", () => {
      expectAnnError(() => parseTitleList(ignored, URL_SEARCH), "invalid_input");
    });

    it("reports a body that is not XML as parse_failure", () => {
      expectAnnError(() => parseTitleList(htmlPage, URL_SEARCH), "parse_failure");
    });

    it("reports XML with the wrong root as parse_failure", () => {
      expectAnnError(() => parseTitleList(feed, URL_SEARCH), "parse_failure");
    });
  });
});

describe("parseTitleDetail", () => {
  const detail = parseTitleDetail(fullAnime, URL_DETAIL, "anime id 4241");

  it("reads the same summary fields as a search row", () => {
    const summary: TitleSummary = {
      id: detail.id,
      kind: detail.kind,
      type: detail.type,
      name: detail.name,
      precision: detail.precision,
      vintage: detail.vintage,
      sourceUrl: detail.sourceUrl,
    };
    expect(summary).toEqual({
      id: 4241,
      kind: "anime",
      type: "TV",
      name: "Placeholder Drifters of the Void 1",
      precision: "TV",
      vintage: "1998-04-03",
      sourceUrl: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=4241",
    });
  });

  it("reads a manga record as manga", () => {
    const mangaDetail = parseTitleDetail(
      manga,
      "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?manga=4242",
      "manga id 4242",
    );
    expect(mangaDetail.kind).toBe("manga");
    expect(mangaDetail.id).toBe(4242);
    expect(mangaDetail.sourceUrl).toContain("/encyclopedia/manga.php?id=4242");
  });

  it("groups the repeated info types instead of keeping only the last", () => {
    expect(detail.genres).toEqual(["action", "adventure"]);
    expect(detail.themes).toEqual(["space", "jazz"]);
    expect(detail.altTitles).toContain("プレースホルダー 1");
    expect(detail.officialWebsites).toContain("https://example.invalid/drifters-1");
    expect(detail.openingThemes.join(" ")).toContain("Placeholder Opening Song 1");
    expect(detail.endingThemes.join(" ")).toContain("Placeholder Ending Song 1");
  });

  it("reads the single-valued info types", () => {
    expect(detail.episodeCount).toBe("26");
    expect(detail.runningTime).toBe("24");
    expect(detail.objectionableContent).toBe("Mild");
    expect(detail.plotSummary).toContain("Plot summary fixture sentence");
    expect(detail.pictureUrl).toBe("https://example.invalid/thumbnails/A4241.jpg");
  });

  it("ignores info types and elements it does not know", () => {
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("a type no version of the parser knows");
    expect(serialized).not.toContain("nothing here matters");
    expect(serialized).not.toContain("Unknown Future Field");
  });

  it("tells a dub credit apart from the original cast", () => {
    // The lang attribute is the only marker: a credit without one is the
    // original cast, and merging the two would attribute a role to the wrong
    // actor in whichever language the user asked about.
    const dub = detail.cast.find((credit) => credit.lang === "DE");
    expect(dub, "no credit carried the dub language").toBeDefined();
    expect(dub).toEqual({
      role: "Captain Placeholder Role",
      person: "German Voice Fixture Person",
      personId: 22_731,
      lang: "DE",
    });

    const original = detail.cast.find((credit) => credit.person.startsWith("Original"));
    expect(original?.lang, "the original cast must carry no dub language").toBeNull();
    expect(original?.personId).toBe(32_731);
  });

  it("reads staff and company credits into their own lists", () => {
    expect(detail.staff).toContainEqual({
      task: "Series Director",
      person: "Director Fixture Person",
      personId: 7741,
    });
    expect(detail.companies).toContainEqual({
      task: "Animation Production",
      company: "Fixture Animation Works",
      companyId: 341,
    });
  });

  it("keeps the rating figures numeric", () => {
    expect(detail.ratings).toEqual({
      votes: 12_511,
      weightedScore: 8.8881,
      bayesianScore: 8.8861,
    });
  });

  it("reads episodes, releases and related entries", () => {
    expect(detail.episodes[0]).toEqual({
      num: "1",
      title: "Episode Fixture Title One",
      lang: "EN",
    });
    expect(detail.releases).toContainEqual({
      name: "Complete Collection Placeholder (Blu-ray)",
      date: "2014-12-16",
      href: "https://www.animenewsnetwork.com/encyclopedia/releases.php?id=27681",
    });
    expect(detail.related).toContainEqual({
      id: 9001,
      relation: "alternate retelling",
      direction: "next",
    });
    expect(detail.related).toContainEqual({
      id: 9101,
      relation: "spinoff of",
      direction: "prev",
    });
  });

  it("reads linked news and reviews with their dates", () => {
    const news = detail.news[0];
    expect(news?.title).toContain("News Headline Fixture");
    expect(news?.href).toContain("/news/1998-09-21/");
    expect(news?.date).toContain("1998-09-21");

    const review = detail.reviews[0];
    expect(review?.title).toContain("Review Fixture Title");
    expect(review?.href).toContain("/review/");
    // The review element carries no date attribute, so there is nothing to invent.
    expect(review?.date).toBeNull();
  });

  describe("failures Anime News Network serves under HTTP 200", () => {
    it("reports a no-result warning as not_found", () => {
      // The same warning a search treats as an empty answer is an error here:
      // the caller named one entry, and it does not exist.
      const error = expectAnnError(
        () => parseTitleDetail(noResult, URL_DETAIL, "anime id 99999999"),
        "not_found",
      );
      expect(error.message).not.toBe("");
      expectAnnError(
        () => parseTitleDetail(noSearchResults, URL_DETAIL, "anime id 99999999"),
        "not_found",
      );
    });

    it("reports any other warning as invalid_input", () => {
      expectAnnError(() => parseTitleDetail(ignored, URL_DETAIL, "anime id 4241"), "invalid_input");
    });

    it("reports a body that is not XML as parse_failure", () => {
      expectAnnError(
        () => parseTitleDetail(htmlPage, URL_DETAIL, "anime id 4241"),
        "parse_failure",
      );
    });

    it("reports XML with the wrong root as parse_failure", () => {
      expectAnnError(() => parseTitleDetail(feed, URL_DETAIL, "anime id 4241"), "parse_failure");
    });
  });
});
