import { describe, expect, it } from "vitest";
import { parseReport } from "../../src/ann/parseReport.js";
import { expectAnnError, fixtureText } from "./_helpers.js";

const titleList = fixtureText("report-title-list.xml");
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
