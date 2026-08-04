/**
 * What get_title says about a cast.
 *
 * Anime News Network orders cast credits alphabetically by language, so a cap
 * applied from the top of the list answers "who voices this character" with a
 * German dub actor and never reaches the Japanese original. The cap has to
 * survive that ordering, and nothing it drops may disappear silently.
 */

import { describe, expect, it } from "vitest";
import { runGetTitle } from "../../src/tools/getTitle.js";
import type { AnnClient } from "../../src/ann/client.js";

/** A record shaped like Cowboy Bebop's: nine dub languages, alphabetical. */
const CAST = [
  ...Array.from({ length: 8 }, (_, i) => ({
    role: `role de ${i}`,
    person: `DE ${i}`,
    personId: i,
    lang: "DE",
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    role: `role en ${i}`,
    person: `EN ${i}`,
    personId: 100 + i,
    lang: "EN",
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    role: `role es ${i}`,
    person: `ES ${i}`,
    personId: 200 + i,
    lang: "ES",
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    role: `role fr ${i}`,
    person: `FR ${i}`,
    personId: 300 + i,
    lang: "FR",
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    role: `role it ${i}`,
    person: `IT ${i}`,
    personId: 400 + i,
    lang: "IT",
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    role: `Spike Spiegel ${i}`,
    person: `JA ${i}`,
    personId: 500 + i,
    lang: "JA",
  })),
  ...Array.from({ length: 11 }, (_, i) => ({
    role: `role ko ${i}`,
    person: `KO ${i}`,
    personId: 600 + i,
    lang: "KO",
  })),
  ...Array.from({ length: 17 }, (_, i) => ({
    role: `role pt ${i}`,
    person: `PT ${i}`,
    personId: 700 + i,
    lang: "PT",
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    role: `role tl ${i}`,
    person: `TL ${i}`,
    personId: 800 + i,
    lang: "TL",
  })),
];

const TITLE = {
  id: 13,
  kind: "anime" as const,
  type: "TV",
  name: "Cowboy Bebop",
  precision: "TV",
  vintage: "1998-04-03",
  plotSummary: "Un équipage de chasseurs de primes.",
  genres: ["science fiction"],
  themes: [],
  cast: CAST,
  staff: [{ task: "Director", person: "Shinichiro Watanabe", personId: 1 }],
  companies: [],
  episodes: [{ number: "1", title: "Asteroid Blues" }],
  episodeCount: 26,
  releases: [],
  related: [],
  news: [],
  reviews: [],
  ratings: { weightedScore: 8.8, votes: 5000, bayesianScore: 8.7 },
  sourceUrl: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=13",
};

const client = (): AnnClient =>
  ({ getTitle: async () => ({ data: TITLE, cached: false }) }) as unknown as AnnClient;

const textOf = (result: any) => result.content[0].text as string;

describe("get_title cast", () => {
  it("keeps every language when the cap trims the list", async () => {
    const result: any = await runGetTitle(client(), {
      id: 13,
      kind: "anime",
      sections: ["cast"],
      max_chars: 4000,
      offset: 0,
    });

    const kept = new Set(
      (result.structuredContent.cast as Array<{ lang: string }>).map((c) => c.lang),
    );
    for (const lang of ["DE", "EN", "ES", "FR", "IT", "JA", "KO", "PT", "TL"]) {
      expect(kept.has(lang), `language dropped by the cap: ${lang}`).toBe(true);
    }
  });

  it("says how many credits exist per language, so nothing is hidden", async () => {
    const result: any = await runGetTitle(client(), {
      id: 13,
      kind: "anime",
      sections: ["cast"],
      max_chars: 4000,
      offset: 0,
    });

    const summary = result.structuredContent.cast_languages as Array<{
      lang: string;
      credits: number;
    }>;
    expect(summary.find((entry) => entry.lang === "JA")?.credits).toBe(11);
    expect(summary.length).toBe(9);
  });

  it("renders the cast in the text block, not just a promise of it", async () => {
    const result: any = await runGetTitle(client(), {
      id: 13,
      kind: "anime",
      sections: ["cast"],
      max_chars: 4000,
      offset: 0,
    });

    const text = textOf(result);
    expect(text, "the text announced a section it never printed").not.toMatch(
      /Also returned:.*cast/,
    );
    expect(text).toContain("JA 0");
  });

  it("carries the notes into the text block", async () => {
    const result: any = await runGetTitle(client(), {
      id: 13,
      kind: "anime",
      sections: ["cast"],
      max_chars: 4000,
      offset: 0,
    });

    const text = textOf(result);
    for (const note of result.structuredContent.notes as string[]) {
      expect(text, `note missing from the text: ${note}`).toContain(note);
    }
  });

  it("states that a requested section is empty rather than looking empty", async () => {
    const result: any = await runGetTitle(client(), {
      id: 13,
      kind: "anime",
      sections: ["reviews"],
      max_chars: 4000,
      offset: 0,
    });

    expect(result.structuredContent.reviews).toEqual([]);
    expect(
      (result.structuredContent.notes as string[]).join(" "),
      "an empty list and an absent section read the same to a model",
    ).toMatch(/reviews/i);
  });
});
