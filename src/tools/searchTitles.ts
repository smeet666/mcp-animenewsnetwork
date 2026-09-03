/** search_titles: find an entry and its id, without paying for the records. */

import { z } from "zod";
import type { AnnClient } from "../ann/client.js";
import type { TitleKind } from "../types.js";
import {
  ok,
  renderTitleList,
  titleSummarySchema,
  toTitleSummaryOut,
  toToolError,
  type ToolResult,
} from "./shared.js";

export const searchTitlesDescription = [
  "Search the Anime News Network encyclopedia for anime and manga by title.",
  "Returns one compact row per match: id, kind, type, name, precision and vintage.",
  "Use the id and kind with get_title to read the full entry.",
  "Matching is on substring, so a short query returns a lot: narrow the query rather than raising 'limit'.",
  "This searches titles only. It cannot find an entry from a plot detail, a character or a studio.",
].join(" ");

export const searchTitlesInputShape = {
  query: z.string().min(1).describe("Title or part of one, for example 'cowboy bebop'."),
  kind: z
    .enum(["anime", "manga", "both"])
    .default("both")
    .describe("Restrict results to one kind. The encyclopedia returns both by default."),
  limit: z.number().int().min(1).max(50).default(10).describe("How many rows to return."),
};

export const searchTitlesOutputShape = {
  query: z.string(),
  results: z.array(titleSummarySchema),
  total_available: z
    .number()
    .int()
    .describe(
      "Rows this server could read, before 'limit' was applied. Higher than results.length means narrow the query.",
    ),
  notes: z.array(z.string()),
};

export interface SearchTitlesArgs {
  query: string;
  kind: "anime" | "manga" | "both";
  limit: number;
}

export async function runSearchTitles(
  client: AnnClient,
  args: SearchTitlesArgs,
): Promise<ToolResult> {
  try {
    const { data, cached, skipped } = await client.searchTitles(args.query);

    const restricted = args.kind !== "both";
    const filtered = restricted
      ? data.filter((title) => title.kind === (args.kind as TitleKind))
      : data;
    const results = filtered.slice(0, args.limit).map(toTitleSummaryOut);

    // An answer emptied by the restriction and one the encyclopedia matched
    // nothing for read the same way once the rows are gone, and they call for
    // opposite next moves: widen the restriction, or shorten the query.
    const emptiedByKind = restricted && filtered.length === 0 && data.length > 0;
    const kindsMatched = [...new Set(data.map((title) => title.kind))].join(" and ");

    const notes: string[] = [];
    if (cached) {
      notes.push("Served from this server's short-lived in-memory cache.");
    }
    if (skipped) {
      notes.push(
        `${skipped} ${skipped === 1 ? "record" : "records"} the encyclopedia returned could not be read and are absent from these figures.`,
      );
    }
    if (filtered.length > results.length) {
      notes.push(
        `${filtered.length} entries matched and ${results.length} are shown. Narrow the query for a more useful set.`,
      );
    }
    if (emptiedByKind) {
      notes.push(
        `The encyclopedia matched ${data.length} ${data.length === 1 ? "entry" : "entries"} and the 'kind' restriction removed all of them: they are ${kindsMatched}. ` +
          `Drop 'kind', or set it to ${kindsMatched}.`,
      );
    } else if (results.length === 0) {
      notes.push(
        "No entry matched. The encyclopedia matches on the title only, so try a shorter fragment of it.",
      );
    }

    const summary = summarise(args, data.length, kindsMatched, emptiedByKind, results);

    return ok({ query: args.query, results, total_available: filtered.length, notes }, summary, {
      notes,
    });
  } catch (error) {
    return toToolError(error);
  }
}

/**
 * The sentence a caller reads first.
 *
 * Three answers look alike once the rows are gone and call for different next
 * moves: rows to read, a query the encyclopedia matched nothing for, and an
 * answer the 'kind' restriction emptied.
 */
function summarise(
  args: SearchTitlesArgs,
  matched: number,
  kindsMatched: string,
  emptiedByKind: boolean,
  results: ReturnType<typeof toTitleSummaryOut>[],
): string {
  if (emptiedByKind) {
    const noun = matched === 1 ? "entry" : "entries";
    return `No ${args.kind} entry for "${args.query}". The encyclopedia matched ${matched} ${kindsMatched} ${noun} under that name.`;
  }
  if (results.length === 0) {
    return `No encyclopedia entry matched "${args.query}".`;
  }
  const noun = results.length === 1 ? "entry" : "entries";
  return `${results.length} ${noun} for "${args.query}":\n${renderTitleList(results)}`;
}
