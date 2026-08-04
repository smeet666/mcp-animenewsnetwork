import { describe, expect, it } from "vitest";
import { expectRoot, parseDocument } from "../../src/ann/xml.js";
import { expectAnnError, fixtureText } from "./_helpers.js";

const titleRecord = fixtureText("title-anime-full.xml");
const report = fixtureText("report-title-list.xml");
const feed = fixtureText("feed.xml");
const htmlPage = fixtureText("html-page.html");

const URL = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=4241";

describe("parseDocument", () => {
  it("returns the root element of a well-formed document", () => {
    expect(parseDocument(titleRecord, URL).name).toBe("ann");
    expect(parseDocument(report, URL).name).toBe("report");
    expect(parseDocument(feed, URL).name).toBe("rss");
  });

  it("reports an HTML page as parse_failure", () => {
    // The one thing an unknown report id answers with, under HTTP 200. Reading
    // it as an empty document would turn a broken request into "no results".
    const error = expectAnnError(() => parseDocument(htmlPage, URL), "parse_failure");
    expect(error.details.url, "the failing URL must be reported back").toBe(URL);
  });

  it("reports anything else that is not XML as parse_failure", () => {
    for (const body of ["", "   ", "not xml at all", '{"json": true}', "<ann><unclosed>"]) {
      expectAnnError(() => parseDocument(body, URL), "parse_failure");
    }
  });
});

describe("expectRoot", () => {
  it("returns the root when it is the expected element", () => {
    const root = parseDocument(titleRecord, URL);
    expect(expectRoot(root, "ann", URL)).toBe(root);
  });

  it("reports the wrong root as parse_failure", () => {
    // A feed handed to an encyclopedia parser is well-formed XML that means
    // something else entirely, so the check cannot be left to the field reads.
    const root = parseDocument(feed, URL);
    const error = expectAnnError(() => expectRoot(root, "ann", URL), "parse_failure");
    expect(error.details.url).toBe(URL);
    expect(error.message).not.toBe("");
  });
});
