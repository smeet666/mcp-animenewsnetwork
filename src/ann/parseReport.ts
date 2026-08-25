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
import type { ReportPage, ReportRow } from "../types.js";
import { ATTR, REPORT_EL } from "./paths.js";
import { absoluteSiteUrl, titlePageUrl } from "./urls.js";
import { attr, children, childText, expectRoot, parseDocument, textOf } from "./xml.js";

const LINK_ELEMENTS = ["anime", "manga", "person", "company"] as const;

/** The id a report row carries in the query string of its href. */
const HREF_ID = /[?&]id=(\d+)/;
type LinkKind = (typeof LINK_ELEMENTS)[number];

export function parseReport(xml: string, url: string): ReportPage {
  const root = expectRoot(parseDocument(xml, url), REPORT_EL.root, url);
  const items = children(root, REPORT_EL.item);
  if (items.length === 0) {
    return { rows: [], itemCount: 0 };
  }

  const rows: ReportRow[] = [];

  for (const item of items) {
    const row = readLinkedItem(item) ?? readTitleItem(item);
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

/** The id=155 shape: scalar children, with the kind carried by `type`. */
function readTitleItem(item: XmlElement): ReportRow | null {
  const name = childText(item, REPORT_EL.name);
  if (!name) {
    return null;
  }

  const rawId = childText(item, REPORT_EL.id);
  const parsedId = rawId === null ? Number.NaN : Number.parseInt(rawId, 10);
  const id = Number.isFinite(parsedId) ? parsedId : null;
  const type = childText(item, REPORT_EL.type);
  // This report mixes anime and manga, and only the type tells them apart.
  const kind = type?.toLowerCase() === "manga" ? "manga" : "anime";

  return {
    id,
    kind,
    name,
    type,
    precision: childText(item, REPORT_EL.precision),
    vintage: childText(item, REPORT_EL.vintage),
    dateAdded: null,
    // This shape carries no href, so the link attribution requires is built
    // from the id and kind rather than left null.
    sourceUrl: id === null ? null : titlePageUrl(kind, id),
  };
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
