/**
 * Encyclopedia records to domain types.
 *
 * Two entry points on purpose. `parseTitleList` returns `TitleSummary[]` and
 * nothing else, because a name search returns the complete record of every
 * match: 1.4 MB for a query like "One Piece". Returning a narrower type is what
 * makes it impossible for a search tool to pass those records on.
 */

import type { XmlElement } from "@rgrove/parse-xml";
import { invalidInput, notFound, parseFailure } from "../errors.js";
import type {
  CastCredit,
  CompanyCredit,
  EpisodeEntry,
  LinkedItem,
  Ratings,
  RelatedEntry,
  ReleaseEntry,
  StaffCredit,
  TitleDetail,
  TitleKind,
  TitleSummary,
} from "../types.js";
import { ATTR, EL, INFO } from "./paths.js";
import { titlePageUrl } from "./urls.js";
import {
  attr,
  children,
  expectRoot,
  firstChild,
  floatAttr,
  intAttr,
  parseDocument,
  textOf,
} from "./xml.js";

/**
 * Read the site's own failure signal.
 *
 * Anime News Network answers everything with HTTP 200 and reports failures in
 * the body, so this is the only place that distinction gets made.
 *
 * "no result" is the one warning that is not a failure by itself. Asking for an
 * id that does not exist is a genuine absence, while searching for a name that
 * matches nothing is an ordinary empty answer, and only the caller knows which
 * of the two it asked for. Every other warning means the request itself was
 * refused, whatever the caller intended.
 */
function readWarning(root: XmlElement): "no-result" | null {
  const warning = firstChild(root, EL.warning);
  if (!warning) {
    return null;
  }

  const text = textOf(warning) ?? "";
  if (/no result/i.test(text)) {
    return "no-result";
  }
  throw invalidInput(
    `Anime News Network refused the request: ${text || "no reason given"}`,
    "Check the id or the query passed to this tool.",
  );
}

function recordKind(element: XmlElement): TitleKind | null {
  if (element.name === EL.anime) {
    return "anime";
  }
  if (element.name === EL.manga) {
    return "manga";
  }
  return null;
}

function titleRecords(root: XmlElement): Array<{ element: XmlElement; kind: TitleKind }> {
  const records: Array<{ element: XmlElement; kind: TitleKind }> = [];
  for (const element of children(root)) {
    const kind = recordKind(element);
    if (kind) {
      records.push({ element, kind });
    }
  }
  return records;
}

/** Values of every <info> carrying the given type, in document order. */
function infoValues(element: XmlElement, type: string): string[] {
  const values: string[] = [];
  for (const info of children(element, EL.info)) {
    if (attr(info, ATTR.type) !== type) {
      continue;
    }
    const text = textOf(info);
    if (text) {
      values.push(text);
    }
  }
  return values;
}

function infoValue(element: XmlElement, type: string): string | null {
  return infoValues(element, type)[0] ?? null;
}

/**
 * A record without an id or a name cannot be looked up or shown, so it is not
 * a row. Returning null lets the caller decide: one bad record among many is
 * skipped and counted, while a response where every record is unreadable means
 * the shape moved and must fail loudly.
 */
function toSummary(element: XmlElement, kind: TitleKind): TitleSummary | null {
  const id = intAttr(element, ATTR.id);
  const name = attr(element, ATTR.name);
  if (id === null || name === null) {
    return null;
  }

  return {
    id,
    kind,
    type: attr(element, ATTR.type),
    name,
    precision: attr(element, ATTR.precision),
    vintage: infoValue(element, INFO.vintage),
    sourceUrl: titlePageUrl(kind, id),
  };
}

/**
 * Reported when records had to be dropped.
 *
 * A gap between what the site sent and what could be read is how a shape change
 * announces itself, so it must not be silent. It goes through the caller's
 * logger rather than straight to stderr, so it honours ANN_LOG_LEVEL.
 */
export type OnSkip = (skipped: number, total: number) => void;

/** Search results, reduced to rows. Everything heavy is dropped here. */
export function parseTitleList(xml: string, url: string, onSkip?: OnSkip): TitleSummary[] {
  const root = expectRoot(parseDocument(xml, url), EL.root, url);
  const records = titleRecords(root);
  if (records.length === 0) {
    // A search that matches nothing is an answer, not a failure. Reporting it as
    // not_found would make the tool fail on a perfectly good query and leave the
    // model with nothing useful to do next.
    readWarning(root);
    return [];
  }

  const rows: TitleSummary[] = [];
  for (const { element, kind } of records) {
    const row = toSummary(element, kind);
    if (row) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    throw parseFailure(url, `${records.length} records but none carried an id and a name`);
  }
  const skipped = records.length - rows.length;
  if (skipped > 0) {
    onSkip?.(skipped, records.length);
  }

  return rows;
}

export function parseTitleDetail(xml: string, url: string, what: string): TitleDetail {
  const root = expectRoot(parseDocument(xml, url), EL.root, url);
  const records = titleRecords(root);

  const first = records[0];
  if (!first) {
    // Here the caller named one entry, so "no result" does mean it is absent.
    readWarning(root);
    throw notFound(url, what);
  }

  const { element, kind } = first;
  const summary = toSummary(element, kind);
  // A detail lookup asked for one specific entry, so an unreadable record here
  // is a failure rather than a row to skip.
  if (!summary) {
    throw parseFailure(url, `the ${element.name} record has no id or no name`);
  }

  return {
    ...summary,
    altTitles: infoValues(element, INFO.altTitle),
    genres: infoValues(element, INFO.genres),
    themes: infoValues(element, INFO.themes),
    plotSummary: infoValue(element, INFO.plotSummary),
    episodeCount: infoValue(element, INFO.episodeCount),
    runningTime: infoValue(element, INFO.runningTime),
    objectionableContent: infoValue(element, INFO.objectionableContent),
    officialWebsites: infoValues(element, INFO.officialWebsite),
    pictureUrl: pictureUrl(element),
    openingThemes: infoValues(element, INFO.openingTheme),
    endingThemes: infoValues(element, INFO.endingTheme),
    cast: parseCast(element),
    staff: parseStaff(element),
    companies: parseCompanies(element),
    episodes: parseEpisodes(element),
    releases: parseReleases(element),
    related: parseRelated(element),
    news: parseLinked(element, EL.news),
    reviews: parseLinked(element, EL.review),
    ratings: parseRatings(element),
  };
}

function pictureUrl(element: XmlElement): string | null {
  for (const info of children(element, EL.info)) {
    if (attr(info, ATTR.type) !== INFO.picture) {
      continue;
    }
    // The src sits on <info> itself, and is repeated on a nested <img>.
    const src = attr(info, ATTR.src);
    if (src) {
      return src;
    }
  }
  return null;
}

function parseCast(element: XmlElement): CastCredit[] {
  const credits: CastCredit[] = [];
  for (const node of children(element, EL.cast)) {
    const role = textOf(firstChild(node, EL.role));
    const person = firstChild(node, EL.person);
    const name = textOf(person);
    if (!(role && name)) {
      continue;
    }
    credits.push({
      role,
      person: name,
      personId: person ? intAttr(person, ATTR.id) : null,
      lang: attr(node, ATTR.lang),
    });
  }
  return credits;
}

function parseStaff(element: XmlElement): StaffCredit[] {
  const credits: StaffCredit[] = [];
  for (const node of children(element, EL.staff)) {
    const task = textOf(firstChild(node, EL.task));
    const person = firstChild(node, EL.person);
    const name = textOf(person);
    if (!(task && name)) {
      continue;
    }
    credits.push({ task, person: name, personId: person ? intAttr(person, ATTR.id) : null });
  }
  return credits;
}

function parseCompanies(element: XmlElement): CompanyCredit[] {
  const credits: CompanyCredit[] = [];
  for (const node of children(element, EL.credit)) {
    const task = textOf(firstChild(node, EL.task));
    const company = firstChild(node, EL.company);
    const name = textOf(company);
    if (!(task && name)) {
      continue;
    }
    credits.push({ task, company: name, companyId: company ? intAttr(company, ATTR.id) : null });
  }
  return credits;
}

function parseEpisodes(element: XmlElement): EpisodeEntry[] {
  const episodes: EpisodeEntry[] = [];
  for (const node of children(element, EL.episode)) {
    const num = attr(node, ATTR.num);
    if (num === null) {
      continue;
    }
    const title = firstChild(node, EL.title);
    episodes.push({
      num,
      title: textOf(title),
      lang: title ? attr(title, ATTR.lang) : null,
    });
  }
  return episodes;
}

function parseReleases(element: XmlElement): ReleaseEntry[] {
  const releases: ReleaseEntry[] = [];
  for (const node of children(element, EL.release)) {
    const name = textOf(node);
    if (!name) {
      continue;
    }
    releases.push({ name, date: attr(node, ATTR.date), href: attr(node, ATTR.href) });
  }
  return releases;
}

function parseRelated(element: XmlElement): RelatedEntry[] {
  const related: RelatedEntry[] = [];
  for (const [name, direction] of [
    [EL.relatedPrev, "prev"],
    [EL.relatedNext, "next"],
  ] as const) {
    for (const node of children(element, name)) {
      const id = intAttr(node, ATTR.id);
      const relation = attr(node, ATTR.rel);
      if (id === null || !relation) {
        continue;
      }
      related.push({ id, relation, direction });
    }
  }
  return related;
}

function parseLinked(element: XmlElement, name: string): LinkedItem[] {
  const items: LinkedItem[] = [];
  for (const node of children(element, name)) {
    const href = attr(node, ATTR.href);
    const title = textOf(node);
    if (!(href && title)) {
      continue;
    }
    items.push({ title, href, date: attr(node, ATTR.datetime) ?? attr(node, ATTR.date) });
  }
  return items;
}

function parseRatings(element: XmlElement): Ratings | null {
  const node = firstChild(element, EL.ratings);
  if (!node) {
    return null;
  }
  return {
    votes: intAttr(node, ATTR.votes),
    weightedScore: floatAttr(node, ATTR.weightedScore),
    bayesianScore: floatAttr(node, ATTR.bayesianScore),
  };
}
