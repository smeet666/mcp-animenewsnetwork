/**
 * RSS items to domain types.
 *
 * The distinction that matters here: a feed with no <channel> is broken and
 * must fail, while a feed with a <channel> holding no items is a valid answer.
 * Collapsing the two would report an outage as a quiet news day.
 */

import { parseFailure } from "../errors.js";
import type { NewsItem, OnSkip } from "../types.js";
import { FEED_EL } from "./paths.js";
import { children, childText, expectRoot, parseDocument, textOf } from "./xml.js";

export function parseFeed(xml: string, url: string, onSkip?: OnSkip): NewsItem[] {
  const root = expectRoot(parseDocument(xml, url), FEED_EL.root, url);

  const channel = children(root, FEED_EL.channel)[0];
  if (!channel) {
    throw parseFailure(url, "the feed has no <channel>");
  }

  const nodes = children(channel, FEED_EL.item);
  if (nodes.length === 0) {
    return [];
  }

  const items: NewsItem[] = [];
  for (const node of nodes) {
    const title = childText(node, FEED_EL.title);
    const link = childText(node, FEED_EL.link);
    // A headline with no link cannot be attributed, which the terms require.
    if (!(title && link)) {
      continue;
    }

    items.push({
      title,
      link,
      summary: stripMarkup(childText(node, FEED_EL.description)),
      publishedAt: toIsoDate(childText(node, FEED_EL.pubDate)),
      categories: children(node, FEED_EL.category)
        .map((element) => textOf(element))
        .filter((name): name is string => name !== null),
    });
  }

  if (items.length === 0) {
    throw parseFailure(url, `${nodes.length} feed entries but none could be read`);
  }

  const skipped = nodes.length - items.length;
  if (skipped > 0) {
    onSkip?.(skipped, nodes.length);
  }

  return items;
}

/**
 * Drop the inline markup the feed puts in its summaries.
 *
 * Descriptions arrive escaped and come back out of the parser as literal tags,
 * so "<cite>Some Title</cite> debuts in August" would reach the model with the
 * tags in it. The words are the point; the italics are not.
 */
function stripMarkup(text: string | null): string | null {
  if (text === null) {
    return null;
  }
  const stripped = text
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped === "" ? null : stripped;
}

/**
 * RFC 822 dates to ISO 8601.
 *
 * The raw form is kept when it cannot be parsed, since a date a reader can see
 * beats a null, and the feed is the only place this value comes from.
 */
function toIsoDate(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}
