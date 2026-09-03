/** Pieces shared by the four tools: schemas, error mapping, text mirrors. */

import { z } from "zod";
import { AnnError } from "../errors.js";
import type { NewsItem, ReportRow, TitleSummary } from "../types.js";

/** Many MCP clients render only the text block, so it must read on its own. */
export const MAX_TEXT_MIRROR_CHARS = 2000;

export const titleSummarySchema = z.object({
  id: z.number().int().describe("Encyclopedia id. Pass this to get_title, together with 'kind'."),
  kind: z.enum(["anime", "manga"]).describe("Which get_title lookup this id belongs to."),
  type: z.string().nullable().describe("TV, movie, OAV, ONA, special, manga or novel."),
  name: z.string(),
  precision: z
    .string()
    .nullable()
    .describe("Disambiguator the site shows next to the name, such as 'TV 2'."),
  vintage: z.string().nullable().describe("Original release date or range, as published."),
  source_url: z.string().describe("Encyclopedia page. Show this when citing the entry."),
});

export type TitleSummaryOut = z.infer<typeof titleSummarySchema>;

/** What the encyclopedia writes beside a title to tell it from its namesakes. */
function qualifierFor(title: { precision?: string | null; type?: string | null }): string {
  if (title.precision) {
    return `(${title.precision})`;
  }
  if (title.type) {
    return `(${title.type})`;
  }
  return "";
}

export function toTitleSummaryOut(title: TitleSummary): TitleSummaryOut {
  return {
    id: title.id,
    kind: title.kind,
    type: title.type,
    name: title.name,
    precision: title.precision,
    vintage: title.vintage,
    source_url: title.sourceUrl,
  };
}

export const reportRowSchema = z.object({
  id: z.number().int().nullable(),
  kind: z.enum(["anime", "manga", "person", "company"]).nullable(),
  name: z.string(),
  type: z.string().nullable(),
  precision: z.string().nullable(),
  vintage: z.string().nullable(),
  date_added: z.string().nullable(),
  source_url: z.string().nullable(),
});

export function toReportRowOut(row: ReportRow): z.infer<typeof reportRowSchema> {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    type: row.type,
    precision: row.precision,
    vintage: row.vintage,
    date_added: row.dateAdded,
    source_url: row.sourceUrl,
  };
}

export const newsItemSchema = z.object({
  title: z.string(),
  link: z.string().describe("Article URL. Show this when citing the story."),
  summary: z.string().nullable(),
  published_at: z.string().nullable().describe("ISO 8601 when the feed date could be parsed."),
  categories: z
    .array(z.string())
    .describe("Every tag the feed carries on the story. Empty when it carries none."),
});

export function toNewsItemOut(item: NewsItem): z.infer<typeof newsItemSchema> {
  return {
    title: item.title,
    link: item.link,
    summary: item.summary,
    published_at: item.publishedAt,
    categories: item.categories,
  };
}

export interface ToolResult {
  // The SDK's CallToolResult carries an index signature for protocol extensions.
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Keep text from the site out of the shape this server's own lines take.
 *
 * The block ends with lines opening "Note:" and "Source:", and a caller has no
 * way to tell one of those from the same words inside a title, a quote or a
 * description written by whoever published it. Indenting a body line that
 * opens with one of those words keeps the two apart, and costs nothing: the
 * structured output still carries the text exactly as it was published.
 */
function indentMarkerLines(body: string): string {
  return body.replace(/^(Note:|Source:)/gm, " $1");
}

/**
 * Build a result whose text block always ends with its attribution.
 *
 * The body is truncated to fit around the trailer rather than the whole block
 * being cut afterwards. Appending the credit and then truncating loses exactly
 * the credit, and a search returning 26 rows already overruns the budget, so a
 * client rendering only the text would show borrowed data with no source.
 *
 * The trailer also states that the text was shortened, since such a client has
 * no other way to know rows are missing.
 */
export function ok(
  structured: Record<string, unknown>,
  body: string,
  options: { notes?: string[]; sourceUrl?: string } = {},
): ToolResult {
  const attribution = options.sourceUrl ? `${ATTRIBUTION} — ${options.sourceUrl}` : ATTRIBUTION;
  // The notes are what qualifies the answer: that a list was capped, that a
  // section is empty rather than unread. They sit with the attribution because
  // that is the part of the block truncation cannot reach.
  const noteLines = (options.notes ?? []).map((note) => `Note: ${note}`);
  while (noteLines.length > 0 && noteLines.join("\n").length > MAX_TEXT_MIRROR_CHARS / 2) {
    noteLines.pop();
  }
  const trailer = [...noteLines, attribution].join("\n");

  const cutMarker = "\n\n[shortened; the full result is in the structured output]";
  const budget = MAX_TEXT_MIRROR_CHARS - `\n\n${trailer}`.length;

  const safe = indentMarkerLines(body);
  const text =
    safe.length <= budget
      ? `${safe}\n\n${trailer}`
      : `${truncate(safe, Math.max(0, budget - cutMarker.length))}${cutMarker}\n\n${trailer}`;

  return { content: [{ type: "text", text }], structuredContent: structured };
}

/**
 * Error results carry no structuredContent: the SDK validates it against the
 * tool's declared output schema, which an error payload does not satisfy.
 */
export function toToolError(error: unknown): ToolResult {
  const known =
    error instanceof AnnError
      ? error
      : new AnnError("network_error", error instanceof Error ? error.message : String(error));

  const lines = [`[${known.code}] ${known.message}`];
  if (known.details.hint) {
    lines.push(`Hint: ${known.details.hint}`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }], isError: true };
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Cut a block of text at a line boundary, so a truncated summary ends on a
 * sentence rather than mid-word. A single line longer than the budget is cut
 * hard, since there is no boundary to find.
 */
export function sliceAtLineBoundary(
  text: string,
  offset: number,
  maxChars: number,
): { slice: string; nextOffset: number | null } {
  const rest = text.slice(offset);
  if (rest.length <= maxChars) {
    return { slice: rest, nextOffset: null };
  }

  const window = rest.slice(0, maxChars);
  const lastBreak = window.lastIndexOf("\n");
  let cut = lastBreak > 0 ? lastBreak : maxChars;

  // Never cut between the two halves of a surrogate pair: both pages would show
  // a replacement character and no offset could ever reassemble the character.
  if (isHighSurrogate(rest.charCodeAt(cut - 1))) {
    cut -= 1;
  }

  return { slice: rest.slice(0, cut), nextOffset: offset + cut };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Compact listing, showing what a model needs to pick the right entry. */
export function renderTitleList(titles: TitleSummaryOut[]): string {
  return titles
    .map((title, index) => {
      const parts = [
        `${index + 1}. ${title.name}`,
        qualifierFor(title),
        title.vintage ? `· ${title.vintage}` : "",
        `· ${title.kind} id: ${title.id}`,
      ];
      return parts.filter(Boolean).join(" ");
    })
    .join("\n");
}

export const ATTRIBUTION = "Source: Anime News Network";
