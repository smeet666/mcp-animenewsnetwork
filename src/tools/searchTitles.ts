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
      "Matches before 'limit' was applied. Higher than results.length means narrow the query.",
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
    const { data, cached } = await client.searchTitles(args.query);

    const filtered =
      args.kind === "both" ? data : data.filter((title) => title.kind === (args.kind as TitleKind));
    const results = filtered.slice(0, args.limit).map(toTitleSummaryOut);

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (filtered.length > results.length) {
      notes.push(
        `${filtered.length} entries matched and ${results.length} are shown. Narrow the query for a more useful set.`,
      );
    }
    if (results.length === 0) {
      notes.push(
        "No entry matched. The encyclopedia matches on the title only, so try a shorter fragment of it.",
      );
    }

    const summary =
      results.length === 0
        ? `No encyclopedia entry matched "${args.query}".`
        : `${results.length} entr${results.length === 1 ? "y" : "ies"} for "${args.query}":\n${renderTitleList(results)}`;

    return ok({ query: args.query, results, total_available: filtered.length, notes }, summary);
  } catch (error) {
    return toToolError(error);
  }
}
