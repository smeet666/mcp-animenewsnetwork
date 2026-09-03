import { describe, expect, it } from "vitest";
import { parseReport } from "../../src/ann/parseReport.js";
import { expectAnnError, fixtureText } from "./_helpers.js";

const titleList = fixtureText("report-title-list.xml");
const mangaSideList = fixtureText("report-title-list-manga.xml");
const mixedList = fixtureText("report-title-list-mixed.xml");
const recentAnime = fixtureText("report-recent-anime.xml");
const recentPerson = fixtureText("report-recent-person.xml");
const partialReport = fixtureText("report-partial.xml");
const emptyReport = fixtureText("report-empty.xml");
const unreadableReport = fixtureText("report-unreadable.xml");
const htmlPage = fixtureText("html-page.html");
const feed = fixtureText("feed.xml");

const URL_TITLES = "https://cdn.animenewsnetwork.com/encyclopedia/reports.xml?id=155&nlist=5";
const URL_RECENT = "https://cdn.animenewsnetwork.com/encyclopedia/reports.xml?id=148&nlist=3";
const URL_PEOPLE = "https://cdn.animenewsnetwork.com/encyclopedia/reports.xml?id=150&nlist=2";
const URL_TITLES_MANGA =
  "https://cdn.animenewsnetwork.com/encyclopedia/reports.xml?id=155&nlist=4&type=manga";
const URL_TITLES_MIXED =
  "https://cdn.animenewsnetwork.com/encyclopedia/reports.xml?id=155&nlist=11";

const SITE = "https://www.animenewsnetwork.com/encyclopedia";

describe("parseReport", () => {
  describe("the title list shape, where every field is its own element", () => {
    const { rows, itemCount } = parseReport(titleList, URL_TITLES);

    it("returns one row per item, and counts what the site sent", () => {
      expect(rows).toHaveLength(5);
      expect(itemCount).toBe(5);
    });

    it("reads the fields off the child elements", () => {
      expect(rows[0]).toMatchObject({
        id: 40_401,
        name: "Placeholder Listed Title 1",
        type: "TV",
        precision: "TV 1",
        vintage: "2026-08-01",
      });
    });

    it("keeps ids numeric rather than as the text they were read from", () => {
      for (const row of rows) {
        expect(typeof row.id, `id ${String(row.id)}`).toBe("number");
      }
    });

    it("carries no date added, which this report does not publish", () => {
      for (const row of rows) {
        expect(row.dateAdded).toBeNull();
      }
    });

    it("builds a link from the id, since this shape carries no href", () => {
      // Attribution requires a link on every row, and this shape has nothing to
      // copy one from: it has to be derived from the id and the kind.
      for (const row of rows) {
        expect(row.sourceUrl, `row ${String(row.id)} has no link to cite`).not.toBeNull();
        expect(row.sourceUrl as string).toMatch(
          /^https:\/\/www\.animenewsnetwork\.com\/encyclopedia\/(anime|manga)\.php\?id=\d+$/,
        );
        expect(row.sourceUrl as string).toContain(`id=${String(row.id)}`);
        if (row.kind !== null) {
          expect(row.sourceUrl).toBe(
            `https://www.animenewsnetwork.com/encyclopedia/${row.kind}.php?id=${String(row.id)}`,
          );
        }
      }
    });
  });

  describe("the recently added shape, where the id lives in the href", () => {
    const { rows, itemCount } = parseReport(recentAnime, URL_RECENT);

    it("returns one row per item, and counts what the site sent", () => {
      expect(rows).toHaveLength(3);
      expect(itemCount).toBe(3);
    });

    it("extracts the id from the href", () => {
      expect(rows.map((row) => row.id)).toEqual([40_401, 40_402, 40_403]);
    });

    it("reads the kind from the linking element", () => {
      for (const row of rows) {
        expect(row.kind).toBe("anime");
      }
      for (const row of parseReport(recentPerson, URL_PEOPLE).rows) {
        expect(row.kind).toBe("person");
      }
    });

    it("keeps the name and the date it was added", () => {
      expect(rows[0]?.name).toContain("Placeholder Added anime 1");
      expect(rows[0]?.dateAdded).toBe("2026-08-03 06:01:41");
    });

    it("turns the site-relative href into an absolute link", () => {
      for (const row of rows) {
        expect(row.sourceUrl as string).toBe(
          `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${String(row.id)}`,
        );
      }
    });

    it("ignores the columns it does not know", () => {
      expect(JSON.stringify(rows)).not.toContain("noise the parser must ignore");
    });
  });

  describe("a page where one entry could not be read", () => {
    const page = parseReport(partialReport, URL_RECENT);

    it("drops the entry it cannot read and keeps the rest", () => {
      expect(page.rows).toHaveLength(2);
      expect(page.rows.map((row) => row.id)).toEqual([40_401, 40_403]);
    });

    it("counts the entry the site sent even though no row came out of it", () => {
      // Upstream paging counts items with nskip. A caller advancing by the row
      // count would re-serve an entry for every one that was dropped, and the
      // drift compounds over pages.
      expect(page.itemCount).toBe(3);
      expect(page.itemCount).toBeGreaterThan(page.rows.length);
    });
  });

  describe("the title list shape, when the request named a catalogue", () => {
    const { rows, itemCount } = parseReport(mangaSideList, URL_TITLES_MANGA, {
      requestedKind: "manga",
    });

    it("files every row under the catalogue that was asked for", () => {
      // The site's own filter decides which catalogue answers, and it returns
      // nothing from the other one. That is a stronger statement about the row
      // than the editorial label, which describes the format of the work.
      expect(rows.map((row) => row.kind)).toEqual(["manga", "manga", "manga", "manga", "manga"]);
      expect(itemCount).toBe(5);
    });

    it("leaves the catalogue unstated when the label names the other one", () => {
      // reports.xml passes over a parameter it does not recognise, so a filter
      // it stopped honouring would answer from both sides while every row still
      // claimed the side that was asked for. A label naming the other catalogue
      // is the only sign of that from inside one response.
      const crossed = parseReport(mangaSideList, URL_TITLES_MANGA, { requestedKind: "anime" });
      const labelledManga = crossed.rows.filter((row) => row.type === "manga");

      expect(labelledManga.length).toBeGreaterThan(0);
      for (const row of labelledManga) {
        expect(row.kind, `row ${String(row.id)}`).toBeNull();
        expect(row.sourceUrl, `row ${String(row.id)}`).toBeNull();
      }
    });

    it("files a row whose label belongs to no vocabulary under it as well", () => {
      // The labels are open, so the site can serve one this parser has never
      // been shown. The request settles the catalogue on its own, which is
      // what keeps such a row linkable.
      const unlisted = rows.find((row) => row.type === "hypothetical-format");

      expect(unlisted?.kind).toBe("manga");
      expect(unlisted?.sourceUrl).toBe(`${SITE}/manga.php?id=40405`);
    });

    it("files a row the site labels anthology under the catalogue too", () => {
      // An anthology is a manga the encyclopedia holds under manga.php. A row
      // read as an anime instead points at an id the anime catalogue does not
      // hold, and the reader who follows the link lands on nothing.
      const anthology = rows.find((row) => row.type === "anthology");

      expect(anthology?.kind).toBe("manga");
      expect(anthology?.sourceUrl).toBe(`${SITE}/manga.php?id=40403`);
    });

    it("links every row into that catalogue", () => {
      for (const row of rows) {
        expect(row.sourceUrl, `row ${String(row.id)}`).toBe(
          `${SITE}/manga.php?id=${String(row.id)}`,
        );
      }
    });

    it("holds the same trust the same way on the other side", () => {
      // An anime-side answer carries anime ids, and its rows take that
      // catalogue whether their label agrees or says nothing about it. A label
      // naming the manga catalogue is the one case the request cannot settle.
      const anime = parseReport(titleList, URL_TITLES, { requestedKind: "anime" });

      expect(anime.rows.map((row) => row.kind)).toEqual(["anime", null, "anime", null, "anime"]);
      expect(anime.rows[0]).toMatchObject({
        type: "TV",
        sourceUrl: `${SITE}/anime.php?id=40401`,
      });
      expect(anime.rows[1]).toMatchObject({ type: "manga", sourceUrl: null });
    });

    it("keeps the label the site published, whatever catalogue the row took", () => {
      expect(rows.map((row) => row.type)).toEqual([
        "manga",
        "manga",
        "anthology",
        "manga",
        "hypothetical-format",
      ]);
    });
  });

  describe("the title list shape, when the request named no catalogue", () => {
    const { rows, itemCount } = parseReport(mixedList, URL_TITLES_MIXED);

    it("reads the anime catalogue off the labels the site gives anime", () => {
      // With both catalogues answering at once, the label is the only hint the
      // row carries, and these six values are the ones the report writes on the
      // anime side.
      expect(rows.slice(0, 6).map((row) => [row.type, row.kind])).toEqual([
        ["TV", "anime"],
        ["movie", "anime"],
        ["ONA", "anime"],
        ["OAV", "anime"],
        ["special", "anime"],
        ["omnibus", "anime"],
      ]);
    });

    it("reads the manga catalogue off the labels the site gives manga", () => {
      expect(rows.slice(6, 8).map((row) => [row.type, row.kind])).toEqual([
        ["manga", "manga"],
        ["anthology", "manga"],
      ]);
    });

    it("leaves the catalogue unknown when the label answers neither", () => {
      // The label vocabulary is hand-maintained and open-ended, so a value
      // outside the two lists is an ordinary event. Anime and manga ids share
      // one integer range, and an id alone says nothing about which catalogue
      // holds it, so there is nothing left to decide from.
      expect(rows[8]).toMatchObject({ type: "hypothetical-format", kind: null });
      expect(rows[9]).toMatchObject({ type: null, kind: null });
      expect(rows[10]?.kind).toBeNull();
    });

    it("carries no link for a row whose catalogue is unknown", () => {
      // A link built into a guessed namespace is a dead link that asserts a
      // catalogue the data never stated.
      for (const row of rows.slice(8)) {
        expect(row.sourceUrl, `row ${String(row.id)}`).toBeNull();
      }
    });

    it("reports a row whose catalogue is unknown with everything it does carry", () => {
      // The name, the label, the precision and the vintage are all true of the
      // row. Dropping it would hide an entry the site published.
      expect(rows[8]).toMatchObject({
        id: 40_409,
        name: "Placeholder Listed Title 9",
        type: "hypothetical-format",
        precision: "hypothetical-format",
        vintage: "2026-08-09",
      });
    });

    it("counts a row whose catalogue is unknown as a row that was read", () => {
      // Such a row parsed. Treating it as a failure would push a page of them
      // into parse_failure and hide eleven entries the site did publish.
      expect(rows).toHaveLength(11);
      expect(itemCount).toBe(11);
    });
  });

  describe("the catalogue a request names, against the other report shape", () => {
    it("keeps reading the kind from the element that carries the href", () => {
      // Reports 148 to 151 name the catalogue in the element itself, which is
      // the row's own statement about what it is.
      const people = parseReport(recentPerson, URL_PEOPLE, { requestedKind: "anime" });

      for (const row of people.rows) {
        expect(row.kind).toBe("person");
        expect(row.sourceUrl).toBe(`${SITE}/person.php?id=${String(row.id)}`);
      }
    });

    it("still fails a page where no item could be read", () => {
      expectAnnError(
        () => parseReport(unreadableReport, URL_TITLES, { requestedKind: "manga" }),
        "parse_failure",
      );
    });
  });

  describe("reports with nothing usable in them", () => {
    it("returns an empty list for a report that matched nothing", () => {
      // The report ran and answered honestly. There is nothing to report as a
      // failure, and a caller paging past the end must be able to stop.
      expect(parseReport(emptyReport, URL_TITLES)).toEqual({ rows: [], itemCount: 0 });
    });

    it("fails rather than returning an empty list when no item can be read", () => {
      // Items exist and none of them parsed, so the shape changed. Answering []
      // would report "nothing was added lately", which is a different fact.
      expectAnnError(() => parseReport(unreadableReport, URL_TITLES), "parse_failure");
    });

    it("reports the HTML page an unknown report id serves as parse_failure", () => {
      expectAnnError(() => parseReport(htmlPage, URL_TITLES), "parse_failure");
    });

    it("reports XML with the wrong root as parse_failure", () => {
      expectAnnError(() => parseReport(feed, URL_TITLES), "parse_failure");
    });
  });
});
