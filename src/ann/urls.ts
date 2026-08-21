/**
 * URL building.
 *
 * The API lives on the CDN host, while the pages a user should be linked to
 * live on the main site. Attribution links must point at the latter, which is
 * what Anime News Network asks for in return for the data.
 */

import { invalidInput } from "../errors.js";
import type { TitleKind } from "../types.js";

const API_BASE = "https://cdn.animenewsnetwork.com/encyclopedia";
const SITE_BASE = "https://www.animenewsnetwork.com";

export type FeedName = "all" | "news" | "reviews";
export type Edition = "us" | "uk" | "au";

/** Reports that list what was added to the encyclopedia most recently. */
export const RECENT_REPORT_IDS = {
  anime: 148,
  manga: 149,
  person: 150,
  company: 151,
} as const;

/** The report that lists titles, filterable by type and by starting letter. */
export const TITLE_LIST_REPORT_ID = 155;

export function titleDetailUrl(kind: TitleKind, id: number): string {
  return `${API_BASE}/api.xml?${kind}=${encodeURIComponent(String(id))}`;
}

/**
 * Search by name.
 *
 * The tilde is the encyclopedia's own search prefix and must not be escaped,
 * so it is written outside the encoded query.
 */
export function titleSearchUrl(query: string): string {
  const trimmed = query.trim();
  if (trimmed === "") {
    throw invalidInput("The search query is empty.", "Pass a title or part of one.");
  }
  return `${API_BASE}/api.xml?title=~${encodeURIComponent(trimmed)}`;
}

export function recentReportUrl(reportId: number, limit: number, offset: number): string {
  const params = new URLSearchParams({ id: String(reportId), nlist: String(limit) });
  if (offset > 0) {
    params.set("nskip", String(offset));
  }
  return `${API_BASE}/reports.xml?${params.toString()}`;
}

export function titleListReportUrl(options: {
  limit: number;
  offset: number;
  type?: TitleKind;
  startsWith?: string;
}): string {
  const params = new URLSearchParams({
    id: String(TITLE_LIST_REPORT_ID),
    nlist: String(options.limit),
  });
  if (options.offset > 0) {
    params.set("nskip", String(options.offset));
  }
  if (options.type) {
    params.set("type", options.type);
  }
  if (options.startsWith) {
    params.set("name", options.startsWith);
  }
  return `${API_BASE}/reports.xml?${params.toString()}`;
}

/**
 * A news or reviews feed.
 *
 * The edition parameter is required: the bare feed URL answers with a redirect
 * to the US edition, so sending it spends a round trip to learn a default we
 * already know.
 */
export function feedUrl(feed: FeedName, edition: Edition): string {
  const path = feed === "reviews" ? "review" : feed;
  return `${SITE_BASE}/${path}/rss.xml?ann-edition=${edition}`;
}

/** The page a user should be sent to, and the link attribution requires. */
export function titlePageUrl(kind: TitleKind, id: number): string {
  return `${SITE_BASE}/encyclopedia/${kind}.php?id=${id}`;
}

/** Report rows carry site-relative hrefs, which are useless to a reader as-is. */
export function absoluteSiteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  return `${SITE_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
}
