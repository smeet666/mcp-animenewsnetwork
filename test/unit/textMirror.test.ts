/**
 * The block of text every tool answers with, on the paths that shorten it.
 *
 * The block has a budget, and three things compete for it: the answer, the
 * notes that qualify it, and the line crediting the site. The notes and the
 * credit sit at the end because truncation cannot reach them, so a caller is
 * never left with an answer it cannot attribute or whose caveats were cut.
 *
 * The plot summary is cut here as well, and where the cut falls is not a
 * cosmetic question: a cut through the two halves of one character shows a
 * replacement mark on both pages and leaves no offset that reassembles it.
 */

import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION,
  MAX_TEXT_MIRROR_CHARS,
  ok,
  sliceAtLineBoundary,
  truncate,
} from "../../src/tools/shared.js";

function textOf(result: { content?: { text?: string }[] }): string {
  return (result.content ?? []).map((part) => part.text ?? "").join("\n");
}

describe("the credit and the caveats at the end of the block", () => {
  it("credits the site on every answer", () => {
    expect(textOf(ok({}, "a short answer"))).toContain(ATTRIBUTION);
  });

  it("writes each note where truncation cannot reach it", () => {
    const text = textOf(ok({}, "a short answer", { notes: ["a caveat", "another"] }));

    expect(text).toContain("Note: a caveat");
    expect(text).toContain("Note: another");
    expect(text.indexOf("Note: a caveat")).toBeGreaterThan(text.indexOf("a short answer"));
  });

  it("holds the whole block inside its budget", () => {
    const text = textOf(ok({}, "x".repeat(MAX_TEXT_MIRROR_CHARS * 2)));

    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_MIRROR_CHARS);
  });

  it("says the answer was shortened, so nobody reads a cut one as complete", () => {
    const text = textOf(ok({}, "x".repeat(MAX_TEXT_MIRROR_CHARS * 2)));

    expect(text).toContain("shortened");
    expect(text).toContain(ATTRIBUTION);
  });

  it("sheds notes rather than let them crowd out the answer entirely", () => {
    // Notes that fill the block leave nothing of what was asked for, so the
    // ones that do not fit are dropped and the credit still lands.
    const notes = Array.from({ length: 40 }, (_, index) => `${index} ${"y".repeat(200)}`);
    const text = textOf(ok({}, "the answer itself", { notes }));

    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_MIRROR_CHARS);
    expect(text).toContain(ATTRIBUTION);
    expect(text).toContain("the answer itself");
  });
});

describe("shortening one string", () => {
  it("leaves a string already inside its budget alone", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  it("marks a string it had to cut", () => {
    const cut = truncate("abcdefghij", 5);

    expect(cut).toHaveLength(5);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("where a plot summary is cut", () => {
  it("serves what is left when the rest fits", () => {
    expect(sliceAtLineBoundary("one\ntwo", 0, 100)).toEqual({
      slice: "one\ntwo",
      nextOffset: null,
    });
  });

  it("cuts on a line boundary so a page ends on a sentence", () => {
    const text = `${"a".repeat(50)}\n${"b".repeat(50)}`;
    const { slice, nextOffset } = sliceAtLineBoundary(text, 0, 60);

    expect(slice).toBe("a".repeat(50));
    expect(nextOffset).toBe(50);
  });

  it("cuts a single long line hard, having no boundary to find", () => {
    const { slice, nextOffset } = sliceAtLineBoundary("a".repeat(100), 0, 40);

    expect(slice).toHaveLength(40);
    expect(nextOffset).toBe(40);
  });

  it("never cuts between the two halves of one character", () => {
    // An emoji is written as a surrogate pair. Cutting between the halves shows
    // a replacement mark on both pages, and no offset puts them back together.
    const text = "🎬".repeat(100);
    const { slice, nextOffset } = sliceAtLineBoundary(text, 0, 41);

    expect(slice).toHaveLength(40);
    expect([...slice]).toHaveLength(20);
    expect(nextOffset).toBe(40);
  });

  it("resumes from an offset the page before it named", () => {
    const text = "🎬".repeat(100);
    const first = sliceAtLineBoundary(text, 0, 41);
    const second = sliceAtLineBoundary(text, first.nextOffset as number, 41);

    expect([...second.slice].every((one) => one === "🎬")).toBe(true);
    expect(`${first.slice}${second.slice}`).toBe(text.slice(0, 80));
  });
});
