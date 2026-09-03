/**
 * Report rows to domain types.
 *
 * reports.xml serves two different item shapes depending on the report:
 *
 *   id 155      <item><id>40406</id><name>…</name><type>TV</type>…</item>
 *   id 148..151 <item><anime href="/encyclopedia/anime.php?id=40406">…</anime>
 *                     <date_added>2026-08-03 06:05:41</date_added></item>
 *
 * Both are read here, and an unrecognised shape is a failure rather than a
 * skipped row: silently dropping every item would report an empty list.
 */

import type { XmlElement } from "@rgrove/parse-xml";
import { parseFailure } from "../errors.js";
import type { ReportPage, ReportRow, TitleKind } from "../types.js";
import { ATTR, REPORT_EL } from "./paths.js";
import { absoluteSiteUrl, titlePageUrl } from "./urls.js";
import { attr, children, childText, expectRoot, parseDocument, textOf } from "./xml.js";

const LINK_ELEMENTS = ["anime", "manga", "person", "company"] as const;

/**
 * The `type` values report 155 publishes for each catalogue, spelled as the
 * site spells them and compared without regard to case.
 *
 * A value on neither list leaves the row's catalogue null. The vocabulary is
 * the encyclopedia's own editorial labelling of a work's format, maintained by
 * hand and open: a label nobody has seen yet is an ordinary event. Anime ids
 * and manga ids are two catalogues sharing one integer range, so an id alone
 * says nothing about which one holds it. Guessing a catalogue there builds a
 * link into the other namespace, where the reader who follows it finds nothing
 * and a lookup on that id fails on a title the site does hold.
 */
const ANIME_TYPES = ["TV", "movie", "ONA", "OAV", "special", "omnibus"];
const MANGA_TYPES = ["manga", "anthology"];

const ANIME_LABELS = new Set(ANIME_TYPES.map((type) => type.toLowerCase()));
const MANGA_LABELS = new Set(MANGA_TYPES.map((type) => type.toLowerCase()));

/** The id a report row carries in the query string of its href. */
const HREF_ID = /[?&]id=(\d+)/;
type LinkKind = (typeof LINK_ELEMENTS)[number];

export interface ParseReportOptions {
  /**
   * The catalogue the request filtered on. The site answers such a request from
   * that catalogue alone, which settles what every row of report 155 is.
   */
  requestedKind?: TitleKind;
}

export function parseReport(
  xml: string,
  url: string,
  options: ParseReportOptions = {},
): ReportPage {
  const root = expectRoot(parseDocument(xml, url), REPORT_EL.root, url);
  const items = children(root, REPORT_EL.item);
  if (items.length === 0) {
    return { rows: [], itemCount: 0 };
  }

  const rows: ReportRow[] = [];

  for (const item of items) {
    const row = readLinkedItem(item) ?? readTitleItem(item, options.requestedKind);
    if (row) {
      rows.push(row);
    }
  }

  // Some rows failing is tolerable; all of them failing means the shape moved.
  if (rows.length === 0) {
    throw parseFailure(url, `${items.length} report rows but none could be read`);
  }
  // The count is not logged here: it is carried in `itemCount`, and the tool
  // turns the gap into a note the model can act on.
  return { rows, itemCount: items.length };
}

/** The id=148..151 shape: one child naming the kind, carrying an href. */
function readLinkedItem(item: XmlElement): ReportRow | null {
  for (const kind of LINK_ELEMENTS) {
    const node = firstNamed(item, kind);
    if (!node) {
      continue;
    }

    const name = textOf(node);
    if (!name) {
      return null;
    }

    const href = attr(node, ATTR.href);
    return {
      id: idFromHref(href),
      kind,
      name,
      type: null,
      precision: null,
      vintage: null,
      dateAdded: childText(item, REPORT_EL.dateAdded),
      sourceUrl: href ? absoluteSiteUrl(href) : null,
    };
  }
  return null;
}

/** The id=155 shape: scalar children, with no element naming the catalogue. */
function readTitleItem(item: XmlElement, requestedKind: TitleKind | undefined): ReportRow | null {
  const name = childText(item, REPORT_EL.name);
  if (!name) {
    return null;
  }

  const rawId = childText(item, REPORT_EL.id);
  const parsedId = rawId === null ? Number.NaN : Number.parseInt(rawId, 10);
  const id = Number.isFinite(parsedId) ? parsedId : null;
  const type = childText(item, REPORT_EL.type);
  const labelled = kindFromLabel(type);
  // A request that named a catalogue was answered from that catalogue alone, so
  // it decides the row. Unfiltered, this report mixes both and the label is the
  // only hint a row carries.
  //
  // A label naming the other catalogue outright is the one thing that unsettles
  // this: reports.xml passes over a parameter it does not recognise, so a filter
  // it stopped honouring would answer from both sides while every row still
  // claimed the side that was asked for. The row is kept, since its name and its
  // label are true either way, and its catalogue is left unstated so no link is
  // built on a filter the response itself contradicts.
  const contradicted =
    requestedKind !== undefined && labelled !== null && labelled !== requestedKind;
  const kind = contradicted ? null : (requestedKind ?? labelled);

  return {
    id,
    kind,
    name,
    type,
    precision: childText(item, REPORT_EL.precision),
    vintage: childText(item, REPORT_EL.vintage),
    dateAdded: null,
    // This shape carries no href, so the link attribution requires is built
    // from the id and the kind. Either one missing leaves it null: a link is
    // only worth publishing when it reaches the entry it claims to.
    sourceUrl: id === null || kind === null ? null : titlePageUrl(kind, id),
  };
}

function kindFromLabel(type: string | null): TitleKind | null {
  if (type === null) {
    return null;
  }
  const label = type.toLowerCase();
  if (ANIME_LABELS.has(label)) {
    return "anime";
  }
  if (MANGA_LABELS.has(label)) {
    return "manga";
  }
  return null;
}

function firstNamed(parent: XmlElement, name: LinkKind): XmlElement | null {
  return children(parent, name)[0] ?? null;
}

function idFromHref(href: string | null): number | null {
  if (!href) {
    return null;
  }
  const match = HREF_ID.exec(href);
  if (!match?.[1]) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}
