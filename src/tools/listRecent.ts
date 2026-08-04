/**
 * list_recent: what the encyclopedia gained lately, or an alphabetical browse.
 *
 * Two reports behind one tool, because a caller asking "what is new" and a
 * caller asking "titles starting with Z" both want a list of rows and neither
 * cares which report id serves it.
 */

import { z } from "zod";
import type { AnnClient, RecentKind } from "../ann/client.js";
import { invalidInput } from "../errors.js";
import {
  ATTRIBUTION,
  ok,
  reportRowSchema,
  toReportRowOut,
  toToolError,
  type ToolResult,
} from "./shared.js";

export const listRecentDescription = [
  "List what was added to the Anime News Network encyclopedia most recently: anime, manga, people or companies.",
  "Pass 'starts_with' to browse titles alphabetically instead, which only applies to anime and manga.",
  "Rows carry an id you can pass to get_title when the kind is anime or manga.",
  "This is a listing, not a search: use search_titles when you know what you are looking for.",
].join(" ");

export const listRecentInputShape = {
  kind: z
    .enum(["anime", "manga", "person", "company"])
    .default("anime")
    .describe("Which catalogue to list."),
  starts_with: z
    .string()
    .max(1)
    .optional()
    .describe("Single letter. Switches to an alphabetical browse of titles. Anime and manga only."),
  limit: z.number().int().min(1).max(50).default(20).describe("How many rows to return."),
  offset: z.number().int().min(0).default(0).describe("How many rows to skip, for paging."),
};

export const listRecentOutputShape = {
  kind: z.string(),
  mode: z
    .enum(["recent", "browse"])
    .describe("'recent' is by date added, 'browse' is alphabetical."),
  rows: z.array(reportRowSchema),
  offset: z.number().int(),
  next_offset: z
    .number()
    .int()
    .nullable()
    .describe("Pass as 'offset' for the next page. Null when the last page came back short."),
  notes: z.array(z.string()),
};

export interface ListRecentArgs {
  kind: RecentKind;
  starts_with?: string;
  limit: number;
  offset: number;
}

export async function runListRecent(client: AnnClient, args: ListRecentArgs): Promise<ToolResult> {
  try {
    const browsing = args.starts_with !== undefined && args.starts_with !== "";
    if (browsing && args.kind !== "anime" && args.kind !== "manga") {
      throw invalidInput(
        `'starts_with' browses titles, so it does not apply to kind="${args.kind}".`,
        "Drop 'starts_with', or set kind to 'anime' or 'manga'.",
      );
    }

    const { data, cached } = browsing
      ? await client.browseTitles({
          limit: args.limit,
          offset: args.offset,
          type: args.kind as "anime" | "manga",
          // Verified above, so the cast is safe.
          startsWith: args.starts_with as string,
        })
      : await client.listRecent(args.kind, args.limit, args.offset);

    const rows = data.rows.map(toReportRowOut);
    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (rows.length === 0) notes.push("The report returned no rows at this offset.");
    if (data.itemCount > data.rows.length) {
      notes.push(
        `${data.itemCount - data.rows.length} entries on this page could not be read and were skipped.`,
      );
    }

    // A short page is the only end-of-list signal these reports give, and it has
    // to be judged on what the site sent rather than on what could be read.
    // Upstream paging counts entries, so advancing by the row count would
    // re-serve or skip an entry for every one that was dropped.
    const nextOffset = data.itemCount < args.limit ? null : args.offset + data.itemCount;

    const heading = browsing
      ? `${args.kind} titles starting with "${args.starts_with}"`
      : `most recently added ${args.kind}`;
    const listing = rows
      .map((row, index) => {
        const parts = [
          `${index + 1}. ${row.name}`,
          row.precision ? `(${row.precision})` : "",
          row.vintage ? `· ${row.vintage}` : "",
          row.date_added ? `· added ${row.date_added}` : "",
          row.id !== null ? `· id: ${row.id}` : "",
        ];
        return parts.filter(Boolean).join(" ");
      })
      .join("\n");

    const summary =
      rows.length === 0
        ? `No rows for ${heading}.`
        : `${rows.length} rows, ${heading}:\n${listing}\n\n${ATTRIBUTION}`;

    return ok(
      {
        kind: args.kind,
        mode: browsing ? "browse" : "recent",
        rows,
        offset: args.offset,
        next_offset: nextOffset,
        notes,
      },
      summary,
    );
  } catch (error) {
    return toToolError(error);
  }
}
