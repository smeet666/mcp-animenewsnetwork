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
    .max(20000)
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
  alt_titles: z.array(z.string()),
  genres: z.array(z.string()),
  themes: z.array(z.string()),
  episode_count: z.string().nullable(),
  running_time: z.string().nullable(),
  objectionable_content: z.string().nullable(),
  official_websites: z.array(z.string()),
  picture_url: z.string().nullable(),
  opening_themes: z.array(z.string()),
  ending_themes: z.array(z.string()),
  ratings: z
    .object({
      votes: z.number().int().nullable(),
      weighted_score: z.number().nullable(),
      bayesian_score: z.number().nullable(),
    })
    .nullable(),
  plot_summary: z.string().nullable(),
  total_chars: z.number().int().describe("Length of the full plot summary."),
  returned_chars: z.number().int(),
  offset: z.number().int(),
  next_offset: z.number().int().nullable().describe("Pass as 'offset' to read the rest."),
  truncated: z.boolean(),
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
  sections: Array<(typeof SECTIONS)[number]>;
  max_chars: number;
  offset: number;
}

export async function runGetTitle(client: AnnClient, args: GetTitleArgs): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getTitle(args.kind, args.id);
    const wanted = new Set(args.sections);
    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");

    const fullSummary = data.plotSummary ?? "";
    const { slice, nextOffset } = sliceAtLineBoundary(fullSummary, args.offset, args.max_chars);
    if (nextOffset !== null) {
      notes.push(
        `The plot summary is longer than ${args.max_chars} characters. Call again with offset=${nextOffset} for the rest.`,
      );
    }
    // Silence here would look like "this entry has no summary", when the real
    // answer is that the offset asked for is past the end of one that exists.
    if (slice === "" && args.offset > 0 && fullSummary.length > 0) {
      notes.push(
        `offset=${args.offset} is past the end of a plot summary of ${fullSummary.length} characters. Call again with offset=0 to read it from the start.`,
      );
    }

    const structured: Record<string, unknown> = {
      title: toTitleSummaryOut(data),
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
      plot_summary: slice === "" ? null : slice,
      total_chars: fullSummary.length,
      returned_chars: slice.length,
      offset: args.offset,
      next_offset: nextOffset,
      truncated: nextOffset !== null,
      notes,
    };

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
  if (credits.length <= cap) return credits;

  const byLanguage = new Map<string, T[]>();
  for (const credit of credits) {
    const key = credit.lang ?? "";
    const bucket = byLanguage.get(key);
    if (bucket) bucket.push(credit);
    else byLanguage.set(key, [credit]);
  }

  const share = Math.max(1, Math.floor(cap / byLanguage.size));
  const kept: T[] = [];
  for (const bucket of byLanguage.values()) kept.push(...bucket.slice(0, share));

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
  for (const credit of credits) counts.set(credit.lang, (counts.get(credit.lang) ?? 0) + 1);
  return [...counts.entries()].map(([lang, count]) => ({ lang, credits: count }));
}

function capped<T>(items: T[], cap: number, label: string, notes: string[]): T[] {
  if (items.length <= cap) return items;
  notes.push(`${items.length} ${label} exist and the first ${cap} are shown.`);
  return items.slice(0, cap);
}

/** One line per credit, short enough that a long cast still fits the block. */
function renderPeople(
  label: string,
  rows: Array<{ role?: string; task?: string; person: string; lang?: string | null }>,
): string[] {
  if (rows.length === 0) return [];
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
  if (data.genres.length > 0) lines.push(`Genres: ${data.genres.join(", ")}`);
  if (data.themes.length > 0) lines.push(`Themes: ${data.themes.join(", ")}`);
  if (data.episodeCount) lines.push(`Episodes: ${data.episodeCount}`);
  if (data.ratings?.weightedScore !== null && data.ratings?.weightedScore !== undefined) {
    lines.push(`Rating: ${data.ratings.weightedScore} from ${data.ratings.votes ?? "?"} votes`);
  }
  if (plot) lines.push("", plot);

  // Announcing a section without printing it left a text-only client with the
  // promise and none of the content it paid a request for.
  const cast = (structured.cast ?? []) as Array<{
    role: string;
    person: string;
    lang: string | null;
  }>;
  const staff = (structured.staff ?? []) as Array<{ task: string; person: string }>;
  lines.push(...renderPeople("Cast", cast));
  lines.push(...renderPeople("Staff", staff));

  const episodes = (structured.episodes ?? []) as Array<{ number: string; title: string | null }>;
  if (episodes.length > 0) {
    lines.push("", "Episodes:");
    for (const episode of episodes)
      lines.push(`  ${episode.number}. ${episode.title ?? ""}`.trimEnd());
  }

  for (const [section, label] of [
    ["releases", "Releases"],
    ["related", "Related"],
    ["news", "News"],
    ["reviews", "Reviews"],
  ] as const) {
    const rows = (structured[section] ?? []) as Array<Record<string, unknown>>;
    if (!wanted.has(section) || rows.length === 0) continue;
    lines.push("", `${label}:`);
    for (const row of rows) {
      const title = (row.title ?? row.name ?? row.story ?? "") as string;
      const link = (row.link ?? row.url ?? row.sourceUrl ?? "") as string;
      lines.push(`  ${title || JSON.stringify(row)}${link ? ` — ${link}` : ""}`);
    }
  }

  return lines.join("\n");
}
