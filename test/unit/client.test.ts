import { describe, expect, it } from "vitest";
import { AnnClient } from "../../src/ann/client.js";
import { createLogger } from "../../src/config.js";
import { fixtureRouter, fixtureText, testConfig, xmlResponse } from "./_helpers.js";
import { AnnError } from "../../src/errors.js";

const logger = createLogger("silent");

/** A configuration with caching on, since the default test config disables it. */
function cachingConfig() {
  return testConfig({ cacheTtlMs: 60_000, newsCacheTtlMs: 60_000, cacheMaxEntries: 50 });
}

describe("AnnClient caching", () => {
  it("serves a repeated request from memory without asking the site again", async () => {
    const stub = fixtureRouter();
    const client = new AnnClient({ config: cachingConfig(), logger, fetchImpl: stub.impl });

    const first = await client.searchTitles("placeholder");
    const second = await client.searchTitles("placeholder");

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(stub.calls, "the second identical call went back to the network").toHaveLength(1);
    expect(second.data).toEqual(first.data);
  });

  it("keys the cache by request, so a different query still goes out", async () => {
    const stub = fixtureRouter();
    const client = new AnnClient({ config: cachingConfig(), logger, fetchImpl: stub.impl });

    await client.searchTitles("placeholder");
    const other = await client.searchTitles("something else");

    expect(other.cached).toBe(false);
    expect(stub.calls).toHaveLength(2);
  });

  it("caches the news wire separately from the encyclopedia", async () => {
    const stub = fixtureRouter();
    const client = new AnnClient({ config: cachingConfig(), logger, fetchImpl: stub.impl });

    await client.getNews("all", "us");
    const second = await client.getNews("all", "us");

    expect(second.cached).toBe(true);
    expect(stub.calls).toHaveLength(1);
  });

  it("holds the parsed rows rather than the response body", async () => {
    // A single search response reaches 1.4 MB, against a couple of kilobytes of
    // rows. Caching the body would keep in memory the very thing this server
    // exists to keep out of it.
    const searchResults = fixtureText("search-results.xml");
    const stub = fixtureRouter();
    const client = new AnnClient({ config: cachingConfig(), logger, fetchImpl: stub.impl });

    const first = await client.searchTitles("placeholder");
    const second = await client.searchTitles("placeholder");

    expect(JSON.stringify(second.data).length).toBeLessThan(searchResults.length / 5);
    expect(second.data, "the cached value must be the parsed result").toEqual(first.data);
  });

  it("does not cache a response it could not read", async () => {
    // Caching a response that could not be read pins it for the whole cache
    // lifetime and replays it at every retry, so the tool cannot recover even
    // once the site is healthy.
    const bodies = [fixtureText("html-page.html"), fixtureText("search-results.xml")];
    let call = 0;
    const impl = (async () => {
      const at = Math.min(call, 1);
      call += 1;
      return xmlResponse(bodies[at] as string);
    }) as typeof fetch;
    const client = new AnnClient({ config: cachingConfig(), logger, fetchImpl: impl });

    await expect(client.searchTitles("placeholder")).rejects.toBeInstanceOf(AnnError);

    const recovered = await client.searchTitles("placeholder");
    expect(recovered.cached, "the failure was replayed from cache").toBe(false);
    expect(recovered.data.length).toBeGreaterThan(0);
    expect(call, "the second call did not reach the network").toBe(2);
  });

  it("does not cache an upstream failure either", async () => {
    const bodies: Array<() => Response> = [
      () => new Response("", { status: 500 }),
      () => xmlResponse(fixtureText("search-results.xml")),
    ];
    let call = 0;
    const impl = (async () => {
      const at = Math.min(call, 1);
      call += 1;
      return (bodies[at] as () => Response)();
    }) as typeof fetch;
    const client = new AnnClient({ config: cachingConfig(), logger, fetchImpl: impl });

    await expect(client.searchTitles("placeholder")).rejects.toBeInstanceOf(AnnError);
    const recovered = await client.searchTitles("placeholder");

    expect(recovered.cached).toBe(false);
    expect(recovered.data.length).toBeGreaterThan(0);
  });

  it("goes back to the network on every call when the cache is switched off", async () => {
    const stub = fixtureRouter();
    const client = new AnnClient({ config: testConfig(), logger, fetchImpl: stub.impl });

    const first = await client.searchTitles("placeholder");
    const second = await client.searchTitles("placeholder");

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(stub.calls).toHaveLength(2);
  });
});

describe("AnnClient report paging", () => {
  it("reports how many entries the site sent alongside the rows it could read", async () => {
    const stub = fixtureRouter({ "reports.xml?id=148": "report-partial.xml" });
    const client = new AnnClient({ config: testConfig(), logger, fetchImpl: stub.impl });

    const page = await client.listRecent("anime", 3, 0);

    expect(page.data.rows).toHaveLength(2);
    expect(page.data.itemCount, "paging counts items upstream, not readable rows").toBe(3);
  });

  it("returns the same shape from an alphabetical browse", async () => {
    const stub = fixtureRouter();
    const client = new AnnClient({ config: testConfig(), logger, fetchImpl: stub.impl });

    const page = await client.browseTitles({ limit: 5, offset: 0, type: "anime", startsWith: "P" });

    expect(page.data.rows).toHaveLength(5);
    expect(page.data.itemCount).toBe(5);
  });

  it("files a browse of one catalogue entirely under that catalogue", async () => {
    // The type in the query string is what the site filtered on, so every row
    // it answers with belongs to that catalogue. The last row carries a label
    // no published vocabulary holds, which the filter places and the label
    // cannot: it is the row that proves the client hands the filter down to
    // the parser.
    const stub = fixtureRouter({
      "reports.xml?id=155&nlist=5&type=manga": "report-title-list-manga.xml",
    });
    const client = new AnnClient({ config: testConfig(), logger, fetchImpl: stub.impl });

    const page = await client.browseTitles({ limit: 5, offset: 0, type: "manga" });
    const anthology = page.data.rows.find((row) => row.type === "anthology");
    const unlisted = page.data.rows.find((row) => row.type === "hypothetical-format");

    expect(page.data.rows.map((row) => row.kind)).toEqual([
      "manga",
      "manga",
      "manga",
      "manga",
      "manga",
    ]);
    expect(anthology?.sourceUrl).toBe(
      "https://www.animenewsnetwork.com/encyclopedia/manga.php?id=40403",
    );
    expect(unlisted?.sourceUrl).toBe(
      "https://www.animenewsnetwork.com/encyclopedia/manga.php?id=40405",
    );
  });

  it("reads the catalogue off each label when the browse named none", async () => {
    // Without a type in the query string the site answers from both catalogues
    // at once, and a label outside the vocabulary it publishes leaves the
    // catalogue of that row unknown.
    const stub = fixtureRouter({
      "reports.xml?id=155&nlist=11": "report-title-list-mixed.xml",
    });
    const client = new AnnClient({ config: testConfig(), logger, fetchImpl: stub.impl });

    const page = await client.browseTitles({ limit: 11, offset: 0 });

    expect(page.data.rows.map((row) => row.kind)).toEqual([
      "anime",
      "anime",
      "anime",
      "anime",
      "anime",
      "anime",
      "manga",
      "manga",
      null,
      null,
      null,
    ]);
  });
});
