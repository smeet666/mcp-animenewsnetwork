/**
 * get_title: read one encyclopedia entry, section by section.
 *
 * A single record reaches 79 KB for a long-running series, most of it cast,
 * staff and linked news. Sections are opt-in so the common case, "what is this
 * show", costs a couple of kilobytes.
 */

import { z } from "zod";
import type { AnnClient } from "../ann/client.js";
import type { TitleDetail } from "../types.js";
import {
  ok,
  sliceAtLineBoundary,
  titleSummarySchema,
  toTitleSummaryOut,
  toToolError,
  type ToolResult,
} from "./shared.js";

/**
 * Ceilings per collection, applied after the section was asked for.
 *
 * Cowboy Bebop alone carries 101 cast credits and 207 linked news items, which
 * is more than a model needs to answer any question a user actually asks.
 */
const CAPS = {
  cast: 60,
  staff: 60,
  episodes: 100,
  releases: 40,
  related: 30,
  news: 25,
  reviews: 15,
} as const;

const SECTIONS = [
  "basic",
  "cast",
  "staff",
  "episodes",
  "releases",
  "related",
  "news",
  "reviews",
] as const;

export const getTitleDescription = [
  "Read one Anime News Network encyclopedia entry by id.",
  "Get the id and kind from search_titles first.",
  "Sections are opt-in because a full record is very large: ask only for what you need.",
  "The entry's name, kind, id and link come back whatever you ask for, so any answer can be cited.",
  "'basic' covers type, vintage, genres, themes, episode count, ratings and the plot summary.",
  "Long plot summaries are paginated: when 'truncated' is true, call again with 'offset' set to 'next_offset'.",
].join(" ");

export const getTitleInputShape = {
  id: z.number().int().min(1).describe("Encyclopedia id, from search_titles."),
  kind: z.enum(["anime", "manga"]).describe("Which lookup the id belongs to, from search_titles."),
  sections: z
    .array(z.enum(SECTIONS))
    .default(["basic"])
    .describe(
      "Which parts to return. 'basic' is usually enough. Adding 'cast' or 'news' can multiply the size of the answer.",
    ),
  max_chars: z
    .number()
    .int()
    .min(200)
    .max(20_000)
    .default(4000)
    .describe("Character budget for the plot summary."),
  offset: z.number().int().min(0).default(0).describe("Where to resume the plot summary."),
};

const castSchema = z.object({
  role: z.string(),
  person: z.string(),
  person_id: z.number().int().nullable(),
  lang: z
    .string()
    .nullable()
    .describe(
      "Language of this credit, such as 'JA' for the Japanese cast of a Japanese production or 'FR' " +
        "for the French dub. Null when the site records none, which is not a claim that the credit " +
        "is the original one.",
    ),
});

const staffSchema = z.object({
  task: z.string(),
  person: z.string(),
  person_id: z.number().int().nullable(),
});

const companySchema = z.object({
  task: z.string(),
  company: z.string(),
  company_id: z.number().int().nullable(),
});

const episodeSchema = z.object({
  num: z.string(),
  title: z.string().nullable(),
  lang: z.string().nullable(),
});

const releaseSchema = z.object({
  name: z.string(),
  date: z.string().nullable(),
  href: z.string().nullable(),
});

const relatedSchema = z.object({
  id: z.number().int(),
  relation: z.string(),
  direction: z
    .enum(["prev", "next"])
    .describe("'prev' is what this came from, 'next' what came out of it."),
});

const linkedSchema = z.object({
  title: z.string(),
  href: z.string(),
  date: z.string().nullable(),
});

export const getTitleOutputShape = {
  title: titleSummarySchema,
  alt_titles: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  themes: z.array(z.string()).optional(),
  episode_count: z.string().nullable().optional(),
  running_time: z.string().nullable().optional(),
  objectionable_content: z.string().nullable().optional(),
  official_websites: z.array(z.string()).optional(),
  picture_url: z.string().nullable().optional(),
  opening_themes: z.array(z.string()).optional(),
  ending_themes: z.array(z.string()).optional(),
  ratings: z
    .object({
      votes: z.number().int().nullable(),
      weighted_score: z.number().nullable(),
      bayesian_score: z.number().nullable(),
    })
    .nullable()
    .optional(),
  plot_summary: z.string().nullable().optional(),
  total_chars: z.number().int().describe("Length of the full plot summary.").optional(),
  returned_chars: z.number().int().optional(),
  offset: z.number().int().optional(),
  next_offset: z
    .number()
    .int()
    .nullable()
    .describe("Pass as 'offset' to read the rest.")
    .optional(),
  truncated: z.boolean().optional(),
  cast: z.array(castSchema).optional(),
  cast_languages: z
    .array(z.object({ lang: z.string().nullable(), credits: z.number().int() }))
    .optional()
    .describe(
      "Every language the site records a cast in, with its full credit count, so a trimmed 'cast' " +
        "still shows what exists. Ask again with a narrower question if a language you need was cut.",
    ),
  staff: z.array(staffSchema).optional(),
  companies: z.array(companySchema).optional(),
  episodes: z.array(episodeSchema).optional(),
  releases: z.array(releaseSchema).optional(),
  related: z.array(relatedSchema).optional(),
  news: z.array(linkedSchema).optional(),
  reviews: z.array(linkedSchema).optional(),
  notes: z.array(z.string()),
};

export interface GetTitleArgs {
  id: number;
  kind: "anime" | "manga";
  sections: (typeof SECTIONS)[number][];
  max_chars: number;
  offset: number;
}

export async function runGetTitle(client: AnnClient, args: GetTitleArgs): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getTitle(args.kind, args.id);
    const wanted = new Set(args.sections);
    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }

    // The entry's own fields are a section like any other, so the summary is
    // read, paged and described only for a caller who asked for them.
    const basic = wanted.has("basic");
    const fullSummary = basic ? (data.plotSummary ?? "") : "";
    const { slice, nextOffset } = sliceAtLineBoundary(fullSummary, args.offset, args.max_chars);
    if (basic && nextOffset !== null) {
      notes.push(
        `The plot summary is longer than ${args.max_chars} characters. Call again with offset=${nextOffset} for the rest.`,
      );
    }
    // Silence here would look like "this entry has no summary", when the real
    // answer is that the offset asked for is past the end of one that exists.
    if (basic && slice === "" && args.offset > 0 && fullSummary.length > 0) {
      notes.push(
        `offset=${args.offset} is past the end of a plot summary of ${fullSummary.length} characters. Call again with offset=0 to read it from the start.`,
      );
    }

    // The entry's name and its link travel with every answer: they are what a
    // caller cites, and an answer nobody can attribute is worth less than the
    // request that fetched it.
    const structured: Record<string, unknown> = {
      title: toTitleSummaryOut(data),
      notes,
    };

    if (basic) {
      Object.assign(structured, basicFields(data, args, { slice, nextOffset, fullSummary }));
    }

    if (wanted.has("cast")) {
      const kept = capCastAcrossLanguages(data.cast, CAPS.cast, notes);
      structured.cast = kept.map((credit) => ({
        role: credit.role,
        person: credit.person,
        person_id: credit.personId,
        lang: credit.lang,
      }));
      structured.cast_languages = tallyLanguages(data.cast);
    }
    if (wanted.has("staff")) {
      structured.staff = capped(data.staff, CAPS.staff, "staff credits", notes).map((credit) => ({
        task: credit.task,
        person: credit.person,
        person_id: credit.personId,
      }));
      structured.companies = data.companies.map((credit) => ({
        task: credit.task,
        company: credit.company,
        company_id: credit.companyId,
      }));
    }
    if (wanted.has("episodes")) {
      structured.episodes = capped(data.episodes, CAPS.episodes, "episodes", notes);
    }
    if (wanted.has("releases")) {
      structured.releases = capped(data.releases, CAPS.releases, "releases", notes);
    }
    if (wanted.has("related")) {
      structured.related = capped(data.related, CAPS.related, "related entries", notes);
    }
    if (wanted.has("news")) {
      structured.news = capped(data.news, CAPS.news, "linked news items", notes);
    }
    if (wanted.has("reviews")) {
      structured.reviews = capped(data.reviews, CAPS.reviews, "linked reviews", notes);
    }

    for (const section of wanted) {
      const value = structured[section === "staff" ? "staff" : section];
      if (Array.isArray(value) && value.length === 0) {
        notes.push(
          `Anime News Network lists no ${section} for this entry, so the empty list is an absence rather than a failure to read it.`,
        );
      }
    }

    return ok(structured, renderSummary(data, slice, wanted, structured), {
      notes,
      sourceUrl: data.sourceUrl,
    });
  } catch (error) {
    return toToolError(error);
  }
}

/**
 * Trim a cast without losing a language.
 *
 * Credits arrive ordered alphabetically by language, so taking the first N
 * answers "who voices this character" with whichever dub sorts first and can
 * drop the Japanese cast entirely. Each language keeps a share of the budget
 * instead, and the languages the site knows about are reported whole.
 */
function capCastAcrossLanguages<T extends { lang: string | null }>(
  credits: T[],
  cap: number,
  notes: string[],
): T[] {
  if (credits.length <= cap) {
    return credits;
  }

  const byLanguage = new Map<string, T[]>();
  for (const credit of credits) {
    const key = credit.lang ?? "";
    const bucket = byLanguage.get(key);
    if (bucket) {
      bucket.push(credit);
    } else {
      byLanguage.set(key, [credit]);
    }
  }

  const share = Math.max(1, Math.floor(cap / byLanguage.size));
  const kept: T[] = [];
  for (const bucket of byLanguage.values()) {
    kept.push(...bucket.slice(0, share));
  }

  notes.push(
    `${credits.length} cast credits exist across ${byLanguage.size} languages and up to ${share} per ` +
      "language are shown. 'cast_languages' gives the full count for each.",
  );
  // Restore the site's own order, so the list still reads as it publishes it.
  const keptSet = new Set(kept);
  return credits.filter((credit) => keptSet.has(credit));
}

function tallyLanguages<T extends { lang: string | null }>(
  credits: T[],
): Array<{ lang: string | null; credits: number }> {
  const counts = new Map<string | null, number>();
  for (const credit of credits) {
    counts.set(credit.lang, (counts.get(credit.lang) ?? 0) + 1);
  }
  return [...counts.entries()].map(([lang, count]) => ({ lang, credits: count }));
}

function capped<T>(items: T[], cap: number, label: string, notes: string[]): T[] {
  if (items.length <= cap) {
    return items;
  }
  notes.push(`${items.length} ${label} exist and the first ${cap} are shown.`);
  return items.slice(0, cap);
}

/** One line per credit, short enough that a long cast still fits the block. */
function renderPeople(
  label: string,
  rows: Array<{ role?: string; task?: string; person: string; lang?: string | null }>,
): string[] {
  if (rows.length === 0) {
    return [];
  }
  return [
    "",
    `${label}:`,
    ...rows.map((row) => {
      const what = row.role ?? row.task ?? "";
      const lang = row.lang ? ` [${row.lang}]` : "";
      return `  ${what ? `${what}: ` : ""}${row.person}${lang}`;
    }),
  ];
}

/** The episode list, numbered as the encyclopedia numbers it. */
function renderEpisodes(structured: Record<string, unknown>): string[] {
  const episodes = (structured.episodes ?? []) as Array<{ num: string; title: string | null }>;
  if (episodes.length === 0) {
    return [];
  }

  return [
    "",
    "Episodes:",
    ...episodes.map((episode) => `  ${episode.num}. ${episode.title ?? ""}`.trimEnd()),
  ];
}

/**
 * The sections a caller asked for, each printed rather than announced.
 *
 * A text-only client that reads a promise of a section has paid a request for
 * nothing, so a section with rows is written out and one without is left off.
 * Each section is written from the fields its own rows carry, and a row that
 * holds an address ends on it, so a reader can open the page and credit the
 * site by it.
 */
function renderListedSections(structured: Record<string, unknown>, wanted: Set<string>): string[] {
  const lines: string[] = [];

  const section = <Row>(name: string, label: string, renderRow: (row: Row) => string): void => {
    const rows = (structured[name] ?? []) as Row[];
    if (!wanted.has(name) || rows.length === 0) {
      return;
    }
    lines.push("", `${label}:`, ...rows.map((row) => `  ${renderRow(row)}`));
  };

  const renderLinked = (row: z.infer<typeof linkedSchema>): string =>
    [row.title, row.date, row.href].filter(Boolean).join(" · ");

  section<z.infer<typeof releaseSchema>>("releases", "Releases", (row) =>
    [row.name, row.date, row.href].filter(Boolean).join(" · "),
  );
  // A related row states an id and the side it sits on, and the site states
  // nothing about the catalogue that holds that id. Anime ids and manga ids
  // share one integer range, so an address built here would name a catalogue
  // by guessing, and it would reach an unrelated entry or nothing at all. The
  // id is printed for a caller to resolve.
  section<z.infer<typeof relatedSchema>>("related", "Related", (row) =>
    [
      row.relation,
      row.direction === "prev" ? "this entry came from it" : "came out of this entry",
      `id: ${row.id}`,
    ].join(" · "),
  );
  section<z.infer<typeof linkedSchema>>("news", "News", renderLinked);
  section<z.infer<typeof linkedSchema>>("reviews", "Reviews", renderLinked);

  return lines;
}

function renderSummary(
  data: TitleDetail,
  plot: string,
  wanted: Set<string>,
  structured: Record<string, unknown>,
): string {
  const header = [
    data.name,
    data.precision ? `(${data.precision})` : "",
    data.vintage ? `· ${data.vintage}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const lines = [header];
  // The block mirrors the payload, so a field the payload withholds is absent
  // here as well: printing it would withhold nothing.
  if (wanted.has("basic")) {
    if (data.genres.length > 0) {
      lines.push(`Genres: ${data.genres.join(", ")}`);
    }
    if (data.themes.length > 0) {
      lines.push(`Themes: ${data.themes.join(", ")}`);
    }
    if (data.episodeCount) {
      lines.push(`Episodes: ${data.episodeCount}`);
    }
    if (data.ratings?.weightedScore !== null && data.ratings?.weightedScore !== undefined) {
      lines.push(`Rating: ${data.ratings.weightedScore} from ${data.ratings.votes ?? "?"} votes`);
    }
    if (plot) {
      lines.push("", plot);
    }
  }

  // A section is printed, not announced: a text-only client that reads the
  // promise alone has paid a request for nothing.
  const cast = (structured.cast ?? []) as Array<{
    role: string;
    person: string;
    lang: string | null;
  }>;
  const staff = (structured.staff ?? []) as Array<{ task: string; person: string }>;
  lines.push(...renderPeople("Cast", cast));
  lines.push(...renderPeople("Staff", staff));

  lines.push(...renderEpisodes(structured));
  lines.push(...renderListedSections(structured, wanted));

  return lines.join("\n");
}

/** Everything the 'basic' section covers, including the slice of the summary. */
function basicFields(
  data: TitleDetail,
  args: GetTitleArgs,
  summary: { slice: string; nextOffset: number | null; fullSummary: string },
): Record<string, unknown> {
  return {
    alt_titles: data.altTitles,
    genres: data.genres,
    themes: data.themes,
    episode_count: data.episodeCount,
    running_time: data.runningTime,
    objectionable_content: data.objectionableContent,
    official_websites: data.officialWebsites,
    picture_url: data.pictureUrl,
    opening_themes: data.openingThemes,
    ending_themes: data.endingThemes,
    ratings: data.ratings
      ? {
          votes: data.ratings.votes,
          weighted_score: data.ratings.weightedScore,
          bayesian_score: data.ratings.bayesianScore,
        }
      : null,
    plot_summary: summary.slice === "" ? null : summary.slice,
    total_chars: summary.fullSummary.length,
    returned_chars: summary.slice.length,
    offset: args.offset,
    next_offset: summary.nextOffset,
    truncated: summary.nextOffset !== null,
  };
}
