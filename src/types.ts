/** Domain types shared by the Anime News Network client and the tools. */

export type TitleKind = "anime" | "manga";

/**
 * A search row.
 *
 * This type exists to make the token problem unrepresentable. A name search on
 * the encyclopedia returns the complete record of every match, which reaches
 * 1.4 MB for a query like "One Piece". `parseTitleList` returns only this shape,
 * so a tool cannot hand those records to a model even by mistake.
 */
export interface TitleSummary {
  id: number;
  kind: TitleKind;
  /** TV, movie, OAV, ONA, special, manga, novel. */
  type: string | null;
  name: string;
  /** Disambiguator shown next to the name, such as "TV 2" or "manga". */
  precision: string | null;
  vintage: string | null;
  sourceUrl: string;
}

export interface CastCredit {
  role: string;
  person: string;
  personId: number | null;
  /** Language of the dub this credit belongs to, absent for the original. */
  lang: string | null;
}

export interface StaffCredit {
  task: string;
  person: string;
  personId: number | null;
}

export interface CompanyCredit {
  task: string;
  company: string;
  companyId: number | null;
}

export interface EpisodeEntry {
  num: string;
  title: string | null;
  lang: string | null;
}

export interface ReleaseEntry {
  name: string;
  date: string | null;
  href: string | null;
}

export interface RelatedEntry {
  id: number;
  relation: string;
  /** "prev" points at what this title came from, "next" at what came out of it. */
  direction: "prev" | "next";
}

export interface LinkedItem {
  title: string;
  href: string;
  date: string | null;
}

export interface Ratings {
  votes: number | null;
  weightedScore: number | null;
  bayesianScore: number | null;
}

/** Everything a title record carries, before a tool selects sections from it. */
export interface TitleDetail extends TitleSummary {
  altTitles: string[];
  genres: string[];
  themes: string[];
  plotSummary: string | null;
  episodeCount: string | null;
  runningTime: string | null;
  objectionableContent: string | null;
  officialWebsites: string[];
  pictureUrl: string | null;
  openingThemes: string[];
  endingThemes: string[];
  cast: CastCredit[];
  staff: StaffCredit[];
  companies: CompanyCredit[];
  episodes: EpisodeEntry[];
  releases: ReleaseEntry[];
  related: RelatedEntry[];
  news: LinkedItem[];
  reviews: LinkedItem[];
  ratings: Ratings | null;
}

/**
 * How a parser reports entries it read past.
 *
 * A parser drops an entry it cannot turn into a row, and the difference between
 * what the site sent and what came out is a fact about the answer. Reporting it
 * lets a caller state the gap, so the remainder is never served as the whole.
 */
export type OnSkip = (skipped: number, total: number) => void;

/** A row from reports.xml, whichever of the two report shapes produced it. */
export interface ReportRow {
  id: number | null;
  kind: "anime" | "manga" | "person" | "company" | null;
  name: string;
  type: string | null;
  precision: string | null;
  vintage: string | null;
  dateAdded: string | null;
  sourceUrl: string | null;
}

/**
 * One page of a report.
 *
 * `itemCount` is how many <item> elements the site sent, which is not always
 * how many rows could be read. Paging must be computed from the former: the
 * upstream `nskip` counts items, so advancing by the row count would re-serve
 * or skip entries whenever one is dropped.
 */
export interface ReportPage {
  rows: ReportRow[];
  itemCount: number;
}

export interface NewsItem {
  title: string;
  link: string;
  summary: string | null;
  publishedAt: string | null;
  category: string | null;
}
