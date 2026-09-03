/**
 * The addresses this client asks for, and the ones it sends a reader to.
 *
 * Two things ride on these strings. A caller's words reach the site through
 * them, so anything a caller writes is escaped before it becomes part of a
 * query. And paging rides on them: the site counts entries with a parameter
 * that is absent from the first page, so a builder that writes it always, or
 * never, silently serves one page over and over.
 */

import { describe, expect, it } from "vitest";
import { expectAnnError } from "./_helpers.js";
import {
  absoluteSiteUrl,
  feedUrl,
  recentReportUrl,
  titleDetailUrl,
  titleListReportUrl,
  titlePageUrl,
  titleSearchUrl,
} from "../../src/ann/urls.js";

describe("a search for a title", () => {
  it("keeps the search prefix the encyclopedia reads outside the escaping", () => {
    // The tilde is the site's own prefix and means nothing once escaped, so it
    // is written before the part a caller wrote.
    expect(titleSearchUrl("cowboy bebop")).toBe(
      "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?title=~cowboy%20bebop",
    );
  });

  it("escapes what a caller wrote before it becomes part of the query", () => {
    const url = titleSearchUrl("a&b=c?d");

    expect(url).toContain("title=~a%26b%3Dc%3Fd");
    expect(url.split("?")).toHaveLength(2);
  });

  it("refuses a query with nothing in it", () => {
    // A blank query reaches the site as a request for everything, and the site
    // answers it with a document nobody asked for.
    expectAnnError(() => titleSearchUrl("   "), "invalid_input");
  });
});

describe("a report read page by page", () => {
  it("leaves the skip parameter off the first page", () => {
    expect(recentReportUrl(148, 20, 0)).toBe(
      "https://cdn.animenewsnetwork.com/encyclopedia/reports.xml?id=148&nlist=20",
    );
  });

  it("writes the skip parameter on every page after it", () => {
    expect(recentReportUrl(148, 20, 40)).toContain("nskip=40");
  });

  it("leaves the skip parameter off the first page of a title list too", () => {
    expect(titleListReportUrl({ limit: 5, offset: 0 })).not.toContain("nskip");
  });

  it("carries the filters a browse was given", () => {
    const url = titleListReportUrl({ limit: 5, offset: 10, type: "manga", startsWith: "A" });

    expect(url).toContain("nskip=10");
    expect(url).toContain("type=manga");
    expect(url).toContain("name=A");
  });
});

describe("the addresses a reader is sent to", () => {
  it("points at the site a person can read, apart from the host serving the data", () => {
    expect(titlePageUrl("anime", 4241)).toBe(
      "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=4241",
    );
    expect(titleDetailUrl("anime", 4241)).toContain("cdn.animenewsnetwork.com");
  });

  it("completes a site-relative address a report row carries", () => {
    expect(absoluteSiteUrl("/encyclopedia/anime.php?id=1")).toBe(
      "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=1",
    );
  });

  it("completes one written without its leading slash", () => {
    expect(absoluteSiteUrl("encyclopedia/anime.php?id=1")).toBe(
      "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=1",
    );
  });

  it("leaves an address that is already whole alone", () => {
    const whole = "https://www.animenewsnetwork.com/news/2026-08-03/story";

    expect(absoluteSiteUrl(whole)).toBe(whole);
  });
});

describe("the feeds", () => {
  it("names the edition, so no round trip is spent learning a default", () => {
    expect(feedUrl("all", "us")).toBe(
      "https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us",
    );
  });

  it("uses the path the site publishes reviews under", () => {
    expect(feedUrl("reviews", "uk")).toContain("/review/rss.xml");
  });
});
