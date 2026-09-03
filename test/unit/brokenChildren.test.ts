/**
 * A record whose children are each unreadable in one way.
 *
 * The encyclopedia is written by hand, so a credit reaches it without a role, an
 * episode without a number, a linked article without an address. One broken
 * child is not a broken record: dropping the entry over it would answer that
 * the title has no cast, which is a different fact from the one the site
 * published, and a model told that says it to a reader.
 *
 * So each unreadable child is dropped on its own, the rest of its section
 * survives, and nothing half-read reaches the answer.
 */

import { describe, expect, it } from "vitest";
import { parseTitleDetail } from "../../src/ann/parseTitle.js";
import { fixtureText } from "./_helpers.js";

const URL = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=4241";
const detail = parseTitleDetail(fixtureText("title-broken-children.xml"), URL, "anime id 4241");

describe("a credit missing one of its two halves", () => {
  it("keeps the credits that name both a role and a person", () => {
    expect(detail.cast.length).toBeGreaterThan(0);
    for (const credit of detail.cast) {
      expect(credit.role.length).toBeGreaterThan(0);
      expect(credit.person.length).toBeGreaterThan(0);
    }
  });

  it("drops a cast entry with no role, and one with nobody in it", () => {
    expect(detail.cast.some((credit) => credit.person.includes("Nameless Role"))).toBe(false);
    for (const credit of detail.cast) {
      expect(credit.role).not.toContain("Unattributed");
    }
  });

  it("drops a staff entry with no task, and one with no person", () => {
    for (const credit of detail.staff) {
      expect(credit.task.length).toBeGreaterThan(0);
      expect(credit.person.length).toBeGreaterThan(0);
    }
    expect(detail.staff.map((credit) => credit.task)).not.toContain("Storyboard");
  });

  it("drops a company credit naming no company", () => {
    for (const credit of detail.companies) {
      expect(credit.company.length).toBeGreaterThan(0);
    }
    expect(detail.companies.map((credit) => credit.task)).not.toContain("Production");
  });
});

describe("a listed child missing what identifies it", () => {
  it("drops an episode with no number", () => {
    for (const episode of detail.episodes) {
      expect(episode.num.length).toBeGreaterThan(0);
    }
    expect(detail.episodes.some((episode) => episode.title?.includes("Unnumbered"))).toBe(false);
  });

  it("keeps a release with no address, since its name is still true", () => {
    // The name is what the site published about the release. Only the link is
    // missing, and the field says so.
    const nameless = detail.releases.find((release) => release.name.includes("With No Address"));

    expect(nameless).toBeDefined();
    expect(nameless?.href).toBeNull();
  });

  it("drops a release with no name at all", () => {
    for (const release of detail.releases) {
      expect(release.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("drops a linked article with no address, which cannot be attributed", () => {
    for (const item of [...detail.news, ...detail.reviews]) {
      expect(item.href.length).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
    }
    expect(detail.news.some((item) => item.title.includes("With No Address"))).toBe(false);
  });

  it("drops a related entry with no id, and one with no relation", () => {
    for (const related of detail.related) {
      expect(Number.isFinite(related.id)).toBe(true);
      expect(related.relation.length).toBeGreaterThan(0);
    }
    expect(detail.related.map((one) => one.id)).not.toContain(9998);
  });
});

describe("a field element with nothing in it", () => {
  it("reports no genre for an element carrying no text", () => {
    for (const genre of detail.genres) {
      expect(genre.trim().length).toBeGreaterThan(0);
    }
  });

  it("reports no picture for an element carrying no address", () => {
    // A picture element with no src says nothing about the entry having art.
    expect(detail.pictureUrl === null || detail.pictureUrl.length > 0).toBe(true);
  });
});

describe("what survives all of it", () => {
  it("still answers with the entry itself", () => {
    expect(detail.name).toContain("Placeholder");
    expect(detail.id).toBe(4241);
    expect(detail.sourceUrl).toContain("animenewsnetwork.com");
  });
});
