/**
 * Every element, attribute and `type` value this server reads, in one place.
 *
 * Anime News Network generates this XML from its own database, so the names are
 * stable in a way CSS classes are not. Collecting them here anyway means a
 * rename upstream is a one-file fix, and the live canary asserts each one
 * individually so a rename shows up as a named failure rather than as empty
 * results.
 */

/** Elements of the encyclopedia API (api.xml). */
export const EL = {
  root: "ann",
  warning: "warning",
  anime: "anime",
  manga: "manga",
  info: "info",
  cast: "cast",
  staff: "staff",
  credit: "credit",
  episode: "episode",
  release: "release",
  news: "news",
  review: "review",
  ratings: "ratings",
  relatedPrev: "related-prev",
  relatedNext: "related-next",
  role: "role",
  task: "task",
  person: "person",
  company: "company",
  title: "title",
} as const;

/** Elements of the reports API (reports.xml). */
export const REPORT_EL = {
  root: "report",
  item: "item",
  id: "id",
  name: "name",
  type: "type",
  precision: "precision",
  vintage: "vintage",
  dateAdded: "date_added",
} as const;

/** Elements of the RSS feeds. */
export const FEED_EL = {
  root: "rss",
  channel: "channel",
  item: "item",
  title: "title",
  link: "link",
  description: "description",
  pubDate: "pubDate",
  category: "category",
} as const;

export const ATTR = {
  id: "id",
  type: "type",
  name: "name",
  precision: "precision",
  lang: "lang",
  src: "src",
  href: "href",
  date: "date",
  datetime: "datetime",
  num: "num",
  rel: "rel",
  votes: "nb_votes",
  weightedScore: "weighted_score",
  bayesianScore: "bayesian_score",
} as const;

/**
 * Values of the `type` attribute on <info>, which is how the encyclopedia
 * expresses nearly every field of a title.
 */
export const INFO = {
  picture: "Picture",
  mainTitle: "Main title",
  altTitle: "Alternative title",
  genres: "Genres",
  themes: "Themes",
  vintage: "Vintage",
  runningTime: "Running time",
  episodeCount: "Number of episodes",
  plotSummary: "Plot Summary",
  openingTheme: "Opening Theme",
  endingTheme: "Ending Theme",
  officialWebsite: "Official website",
  objectionableContent: "Objectionable content",
} as const;
