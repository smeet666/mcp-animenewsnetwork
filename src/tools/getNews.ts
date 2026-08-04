/**
 * get_news: the Anime News Network wire.
 *
 * The feeds are the whole archive available: there is no endpoint to reach
 * further back, so a question about older coverage cannot be answered here.
 */

import { z } from "zod";
import type { AnnClient } from "../ann/client.js";
import type { Edition, FeedName } from "../ann/urls.js";
import { newsItemSchema, ok, toNewsItemOut, toToolError, type ToolResult } from "./shared.js";

export const getNewsDescription = [
  "Read the latest Anime News Network stories from their RSS feeds.",
  "'all' mixes news, reviews and features; 'news' and 'reviews' are the narrower feeds.",
  "Filter with 'category' to keep only stories the feed tags a given way, such as Manga or Anime.",
  "The feed is the whole window available: there is no way to reach older stories through this tool.",
  "When you repeat a story, cite Anime News Network and link the article.",
].join(" ");

export const getNewsInputShape = {
  feed: z
    .enum(["all", "news", "reviews"])
    .default("all")
    .describe("Which feed to read. 'all' is the busiest."),
  edition: z
    .enum(["us", "uk", "au"])
    .default("us")
    .describe("Regional edition. They differ mostly in release and licensing coverage."),
  category: z
    .string()
    .optional()
    .describe("Keep only items tagged this way, matched case-insensitively."),
  limit: z.number().int().min(1).max(100).default(20).describe("How many stories to return."),
};

export const getNewsOutputShape = {
  feed: z.string(),
  edition: z.string(),
  items: z.array(newsItemSchema),
  total_available: z
    .number()
    .int()
    .describe("Items in the feed after 'category' was applied, before 'limit'."),
  notes: z.array(z.string()),
};

export interface GetNewsArgs {
  feed: FeedName;
  edition: Edition;
  category?: string;
  limit: number;
}

export async function runGetNews(client: AnnClient, args: GetNewsArgs): Promise<ToolResult> {
  try {
    const { data, cached } = await client.getNews(args.feed, args.edition);

    const wanted = args.category?.trim().toLowerCase();
    const filtered = wanted ? data.filter((item) => item.category?.toLowerCase() === wanted) : data;
    const items = filtered.slice(0, args.limit).map(toNewsItemOut);

    const notes: string[] = [];
    if (cached) notes.push("Served from this server's short-lived in-memory cache.");
    if (filtered.length > items.length) {
      notes.push(
        `${filtered.length} stories are in the feed and the first ${items.length} are shown.`,
      );
    }
    if (wanted && filtered.length === 0) {
      const seen = [...new Set(data.map((item) => item.category).filter(Boolean))];
      notes.push(
        seen.length > 0
          ? `No story is tagged "${args.category}". This feed currently carries: ${seen.join(", ")}.`
          : `No story is tagged "${args.category}", and this feed carries no categories at all.`,
      );
    }

    const listing = items
      .map((item, index) => {
        const when = item.published_at ? item.published_at.slice(0, 10) : "";
        const parts = [
          `${index + 1}. ${item.title}`,
          when ? `(${when})` : "",
          item.category ? `· ${item.category}` : "",
        ];
        return parts.filter(Boolean).join(" ");
      })
      .join("\n");

    const summary =
      items.length === 0
        ? "No story matched."
        : `${items.length} stories from the ${args.feed} feed (${args.edition}):\n${listing}`;

    return ok(
      {
        feed: args.feed,
        edition: args.edition,
        items,
        total_available: filtered.length,
        notes,
      },
      summary,
    );
  } catch (error) {
    return toToolError(error);
  }
}
