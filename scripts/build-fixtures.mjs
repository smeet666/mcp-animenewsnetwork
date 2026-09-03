/**
 * Generates the XML fixtures used by the unit tests.
 *
 * The fixtures reproduce the exact element and attribute shapes Anime News
 * Network serves, with invented series, people and headlines in place of real
 * ones. The parsers are checked against structure, so no encyclopedia content
 * needs to live in this repository.
 *
 * Every record carries noise the parsers must ignore: unknown elements, unknown
 * `info` types and attributes nothing reads. A parser that returns the right
 * answer by taking whatever it finds first would pass a clean fixture and fail
 * on the live API, so the fixtures are never clean.
 *
 * Run with: npm run build:fixtures
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

const SITE = "https://www.animenewsnetwork.com";

/**
 * Strings that only ever live inside the heavy children of a record.
 *
 * The unit tests assert these appear in the fixture and never in a search
 * result, which is how the "search returns summaries only" guarantee is
 * checked. Keep them distinctive: a substring that could also occur in a title
 * would make that assertion vacuous.
 */
const HEAVY_MARKERS = {
  castPerson: "Voice Fixture Person",
  castRole: "Captain Placeholder Role",
  staffPerson: "Director Fixture Person",
  company: "Fixture Animation Works",
  episodeTitle: "Episode Fixture Title",
  newsHeadline: "News Headline Fixture",
  reviewTitle: "Review Fixture Title",
  plotSummary: "Plot summary fixture sentence",
};

const PLOT = [
  `${HEAVY_MARKERS.plotSummary} one, describing a crew that drifts between stations.`,
  "A second placeholder paragraph, long enough that pagination has something to cut.",
  "A third placeholder paragraph, closing the invented synopsis.",
].join("\n\n");

/** Elements the parsers have never heard of, interleaved with the real ones. */
function noise(seed) {
  return [
    `<unrecognised-element kind="noise" seq="${seed}">nothing here matters</unrecognised-element>`,
    `<info gid="9${seed}" type="Unknown Future Field">a type no version of the parser knows</info>`,
    `<banner gid="8${seed}" src="https://example.invalid/banner-${seed}.png"/>`,
  ].join("\n  ");
}

/** The heavy children: everything a search result must not carry. */
function heavyChildren(seed) {
  return [
    // The original cast has no lang attribute; a dub credit does. Telling them
    // apart is the whole point of reading that attribute.
    `<cast gid="208" lang="DE"><role>${HEAVY_MARKERS.castRole}</role><person id="2273${seed}">German ${HEAVY_MARKERS.castPerson}</person></cast>`,
    `<cast gid="209"><role>${HEAVY_MARKERS.castRole}</role><person id="3273${seed}">Original ${HEAVY_MARKERS.castPerson}</person></cast>`,
    `<staff gid="204"><task>Series Director</task><person id="774${seed}">${HEAVY_MARKERS.staffPerson}</person></staff>`,
    `<staff gid="205"><task>Music</task><person id="775${seed}">Composer ${HEAVY_MARKERS.staffPerson}</person></staff>`,
    `<credit gid="377"><task>Animation Production</task><company id="34${seed}">${HEAVY_MARKERS.company}</company></credit>`,
    `<ratings nb_votes="1251${seed}" weighted_score="8.888${seed}" bayesian_score="8.886${seed}"/>`,
    `<episode num="1"><title gid="124" lang="EN">${HEAVY_MARKERS.episodeTitle} One</title></episode>`,
    `<episode num="2"><title gid="125" lang="EN">${HEAVY_MARKERS.episodeTitle} Two</title></episode>`,
    `<release date="2014-12-16" href="${SITE}/encyclopedia/releases.php?id=2768${seed}">Complete Collection Placeholder (Blu-ray)</release>`,
    `<news datetime="1998-09-21T04:00:00Z" href="${SITE}/news/1998-09-21/placeholder-${seed}">${HEAVY_MARKERS.newsHeadline} ${seed}</news>`,
    `<review href="${SITE}/review/placeholder-${seed}">${HEAVY_MARKERS.reviewTitle} ${seed}</review>`,
  ].join("\n  ");
}

/**
 * One encyclopedia record, in the shape both search and detail return.
 *
 * `attrs` and `extra` exist so a fixture can drop an attribute the parser needs
 * or add a section only one fixture cares about.
 */
/**
 * Heavy children each broken one way, alongside one that is whole.
 *
 * The site publishes records with a credit missing its role, an episode with no
 * number, a linked article with no address. A parser that drops the record over
 * one of them answers that the entry has no cast at all, so each is dropped on
 * its own and the rest of the section survives.
 */
function brokenChildren(seed) {
  return [
    `<cast gid="210"><person id="1${seed}">Nameless Role ${HEAVY_MARKERS.castPerson}</person></cast>`,
    `<cast gid="211"><role>${HEAVY_MARKERS.castRole} Unattributed</role></cast>`,
    `<staff gid="206"><task>Storyboard</task></staff>`,
    `<staff gid="207"><person id="2${seed}">Taskless ${HEAVY_MARKERS.staffPerson}</person></staff>`,
    `<credit gid="378"><task>Production</task></credit>`,
    `<episode><title gid="126" lang="EN">${HEAVY_MARKERS.episodeTitle} Unnumbered</title></episode>`,
    `<release date="2015-01-01">Placeholder Release With No Address</release>`,
    `<release href="${SITE}/encyclopedia/releases.php?id=1">   </release>`,
    `<news datetime="1999-01-01T00:00:00Z">${HEAVY_MARKERS.newsHeadline} With No Address</news>`,
    `<review href="${SITE}/review/nameless"></review>`,
    `<related-next rel="alternate version"/>`,
    `<related-prev id="9998"/>`,
    `<info gid="442" type="Genres"></info>`,
    `<info gid="249" type="Picture" width="10" height="10"/>`,
  ].join("\n  ");
}

function record(options) {
  const {
    element = "anime",
    seed = 1,
    id = 4240 + seed,
    name = `Placeholder Drifters of the Void ${seed}`,
    type = "TV",
    precision = "TV",
    vintage = "1998-04-03",
    withAttrs = true,
    heavy = true,
    broken = false,
  } = options;

  const attrs = [
    withAttrs && id !== null ? `id="${id}"` : "",
    `gid="9000000${seed}"`,
    type === null ? "" : `type="${type}"`,
    withAttrs && name !== null ? `name="${name}"` : "",
    precision === null ? "" : `precision="${precision}"`,
    `generated-on="2026-08-03T20:27:14Z"`,
  ]
    .filter(Boolean)
    .join(" ");

  return `<${element} ${attrs}>
  <related-next id="900${seed}" rel="alternate retelling"/>
  <related-prev id="910${seed}" rel="spinoff of"/>
  ${noise(seed)}
  <info gid="248" type="Picture" src="https://example.invalid/thumbnails/A${id}.jpg" width="168" height="200"><img src="https://example.invalid/thumbnails/A${id}.jpg" width="168" height="200"/></info>
  <info gid="368" type="Main title" lang="EN">${name}</info>
  <info gid="371" type="Alternative title" lang="JA">プレースホルダー ${seed}</info>
  <info gid="440" type="Genres">action</info>
  <info gid="441" type="Genres">adventure</info>
  <info gid="350" type="Themes">space</info>
  <info gid="351" type="Themes">jazz</info>
  ${vintage === null ? "" : `<info gid="1" type="Vintage">${vintage}</info>`}
  <info gid="2" type="Number of episodes">26</info>
  <info gid="3" type="Running time">24</info>
  <info gid="4" type="Plot Summary">${PLOT}</info>
  <info gid="6" type="Official website">https://example.invalid/drifters-${seed}</info>
  <info gid="7" type="Objectionable content">Mild</info>
  <info gid="8" type="Opening Theme">"Placeholder Opening Song ${seed}"</info>
  <info gid="9" type="Ending Theme">"Placeholder Ending Song ${seed}"</info>
  ${heavy ? heavyChildren(seed) : ""}${broken ? `\n  ${brokenChildren(seed)}` : ""}
</${element}>`;
}

function ann(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ann>\n${body}\n</ann>\n`;
}

/**
 * Shape A: report 155, which lists titles with their fields as elements.
 *
 * `type` carries the site's own editorial label, which is hand-maintained and
 * open-ended. Passing `null` for it writes an item with no `<type>` element at
 * all, which covers a shape the parser has to tolerate.
 */
function titleListItem(seed, overrides = {}) {
  const {
    type = seed % 2 === 0 ? "manga" : "TV",
    precision = seed % 2 === 0 ? "manga" : `TV ${seed}`,
  } = overrides;

  return `<item>
    <id>${40_400 + seed}</id>
    <gid>${3_831_096_000 + seed}</gid>
    ${type === null ? "" : `<type>${type}</type>`}
    <name>Placeholder Listed Title ${seed}</name>
    <precision>${precision}</precision>
    <vintage>2026-08-${String(seed).padStart(2, "0")}</vintage>
    <unknown-column>noise the parser must ignore</unknown-column>
  </item>`;
}

/** Shape B: reports 148-151, where the id only exists inside the href. */
function recentItem(kind, seed) {
  return `<item>
    <${kind} href="/encyclopedia/${kind}.php?id=${40_400 + seed}">Placeholder Added ${kind} ${seed} (TV ${seed})</${kind}>
    <date_added>2026-08-03 06:0${seed}:41</date_added>
    <unknown-column>noise the parser must ignore</unknown-column>
  </item>`;
}

function report(items, listed = items.length) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<report skipped="0" listed="${listed}">\n${items.join(
    "\n",
  )}\n</report>\n`;
}

/**
 * Descriptions arrive escaped, so a tag written here as `&lt;cite&gt;` is what
 * the feed actually carries and what the parser has to strip back out.
 */
const MARKUP_DESCRIPTION =
  "&lt;cite&gt;Placeholder Series Alpha&lt;/cite&gt; debuts in\n      &lt;cite&gt;Placeholder Magazine&lt;/cite&gt;   on August 31";

const MARKUP_ONLY_DESCRIPTION = "&lt;p&gt;&lt;/p&gt;  \n  &lt;br/&gt;";

/** The wire tags a story with as many categories as it likes, or with none. */
function categoryElements(category) {
  if (category === null) {
    return "";
  }
  const names = Array.isArray(category) ? category : [category];
  return names.map((name) => `<category>${name}</category>`).join("\n      ");
}

function feedItem(options) {
  const {
    seed = 1,
    pubDate = "Mon, 03 Aug 2026 16:30:00 -0400",
    category = "Manga",
    link = `${SITE}/news/2026-08-03/placeholder-story-${seed}`,
    description = `Placeholder summary sentence for wire story ${seed}.`,
  } = options;

  return `    <item>
      <title>Placeholder Wire Story ${seed}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      ${categoryElements(category)}
      <dc:creator>Placeholder Reporter</dc:creator>
      <unknown-item-field>noise the parser must ignore</unknown-item-field>
    </item>`;
}

function rss(channelBody) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
${channelBody}
  </channel>
</rss>
`;
}

const CHANNEL_HEADER = `    <title>Placeholder News Network</title>
    <link>${SITE}</link>
    <description>Placeholder wire.</description>
    <language>en-us</language>
    <image><url>https://example.invalid/logo.png</url><title>Placeholder</title><link>${SITE}</link></image>`;

const FIXTURES = {
  /** One record with every section a detail lookup can return. */
  "title-anime-full.xml": ann(record({ seed: 1 })),

  /** A manga record, so the parser cannot assume the element is always <anime>. */
  "title-manga.xml": ann(
    record({ element: "manga", seed: 2, type: "manga", precision: "manga", vintage: "1997-07-22" }),
  ),

  /**
   * What a name search returns: complete records, not summaries. This is the
   * 1.4 MB problem in miniature, and the fixture the leak tests read.
   */
  "search-results.xml": ann(
    [
      record({ seed: 1 }),
      record({ seed: 2, type: "OAV", precision: "OAV" }),
      record({ element: "manga", seed: 3, type: "manga", precision: "manga" }),
      record({ seed: 4, type: "movie", precision: "movie" }),
      record({ element: "manga", seed: 5, type: "novel", precision: "novel" }),
    ].join("\n"),
  ),

  /**
   * A name search the encyclopedia answers entirely from one catalogue.
   *
   * Restricting such an answer to the other catalogue leaves nothing, and the
   * absence is the server's own doing. The fixture exists so a tool can be held
   * to saying which of the two emptied the set.
   */
  "search-results-anime-only.xml": ann(
    [
      record({ seed: 1, heavy: false }),
      record({ seed: 2, type: "OAV", precision: "OAV", heavy: false }),
      record({ seed: 4, type: "movie", precision: "movie", heavy: false }),
    ].join("\n"),
  ),

  /**
   * A record whose heavy children are each unreadable in one way.
   *
   * One broken credit is not a broken record: dropping the entry over it would
   * answer that the title has no cast, which is a different fact from the one
   * the site published.
   */
  "title-broken-children.xml": ann(record({ seed: 1, broken: true })),

  /** A record with neither an id nor a name, alongside one that is complete. */
  "title-missing-attrs.xml": ann(
    [
      record({ seed: 1, heavy: false }),
      record({ seed: 6, withAttrs: false, heavy: false }),
      record({ element: "manga", seed: 7, withAttrs: false, heavy: false }),
    ].join("\n"),
  ),

  /** The failure the site reports for an id it does not know, under HTTP 200. */
  "warning-no-result.xml": ann("<warning>no result for anime=99999999</warning>"),

  /**
   * What a search matching nothing comes back as. Same warning element, plural
   * wording, and a different meaning: the caller named no particular entry.
   */
  "warning-no-search-results.xml": ann("<warning>no results for title=~zzqq</warning>"),

  /** The other warning it serves, for a request it declined to run. */
  "warning-ignored.xml": ann("<warning>ignored </warning>"),

  /** Report 155: titles with their fields as child elements. */
  "report-title-list.xml": report([1, 2, 3, 4, 5].map((seed) => titleListItem(seed))),

  /**
   * Report 155 as the site answers it with `type=manga` in the query string.
   *
   * The site's filter is authoritative for every row it returns, while the
   * `<type>` element carries an editorial label describing the format of the
   * work. The two say different things: an anthology is served on the manga
   * side, and so is a label belonging to no published vocabulary, since that
   * vocabulary is open. Only the filter places that last row, which is what
   * makes this fixture tell a filtered read apart from a label read.
   */
  "report-title-list-manga.xml": report([
    titleListItem(1, { type: "manga", precision: "manga" }),
    titleListItem(2, { type: "manga", precision: "manga" }),
    titleListItem(3, { type: "anthology", precision: "anthology" }),
    titleListItem(4, { type: "manga", precision: "manga" }),
    titleListItem(5, { type: "hypothetical-format", precision: "hypothetical-format" }),
  ]),

  /**
   * Report 155 as the site answers it with no type in the query string, where
   * the two catalogues arrive mixed and the `<type>` element is the only hint.
   *
   * The eight labels observed on the live report are here, six on the anime
   * side and two on the manga side. The last two items carry what the label
   * cannot answer: a value belonging to no known list, and no element at all.
   * "hypothetical-format" is deliberately not a word the site writes, so a
   * reader cannot mistake it for a vocabulary entry to add somewhere. A third
   * unanswerable row carries the element with nothing inside it.
   */
  "report-title-list-mixed.xml": report([
    titleListItem(1, { type: "TV", precision: "TV 1" }),
    titleListItem(2, { type: "movie", precision: "movie" }),
    titleListItem(3, { type: "ONA", precision: "ONA" }),
    titleListItem(4, { type: "OAV", precision: "OAV 2" }),
    titleListItem(5, { type: "special", precision: "special" }),
    titleListItem(6, { type: "omnibus", precision: "omnibus" }),
    titleListItem(7, { type: "manga", precision: "manga" }),
    titleListItem(8, { type: "anthology", precision: "anthology" }),
    titleListItem(9, { type: "hypothetical-format", precision: "hypothetical-format" }),
    titleListItem(10, { type: null, precision: "manga" }),
    titleListItem(11, { type: "", precision: "TV 11" }),
  ]),

  /** Report 148: recently added anime, where the id lives in the href. */
  "report-recent-anime.xml": report([1, 2, 3].map((seed) => recentItem("anime", seed))),

  /** Report 150: the same shape, with a different linking element. */
  "report-recent-person.xml": report([1, 2].map((seed) => recentItem("person", seed))),

  /** A report that ran and matched nothing, which is a legitimate empty answer. */
  "report-empty.xml": report([], 0),

  /**
   * A full page where one entry cannot be read.
   *
   * Upstream paging counts items, not rows, so the dropped entry still has to
   * be counted or every page after this one drifts by an entry.
   */
  "report-partial.xml": report([
    recentItem("anime", 1),
    "<item><unknown-column>an entry no shape recognises</unknown-column></item>",
    recentItem("anime", 3),
  ]),

  /** Items that carry nothing any shape recognises: not an empty answer. */
  "report-unreadable.xml": report([
    "<item><unknown-column>noise</unknown-column></item>",
    "<item><another-unknown/></item>",
    "<item></item>",
  ]),

  /**
   * What an unrecognised report id answers with, under HTTP 200: a full HTML
   * page. It is not well-formed XML, which is the only signal available.
   */
  "html-page.html": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Anime News Network</title>
</head>
<body>
<div id="page">Placeholder error page served with HTTP 200.</div>
<br>
<img src="https://example.invalid/placeholder.png">
</body>
</html>
`,

  /**
   * A feed with a well-formed date, an unparseable one, a missing category, the
   * escaped inline markup the live wire wraps titles in, and two stories the
   * wire tags several ways at once, which it does for roughly one story in ten.
   */
  "feed.xml": rss(
    [
      CHANNEL_HEADER,
      feedItem({ seed: 1 }),
      feedItem({ seed: 2, category: "Anime" }),
      feedItem({ seed: 3, category: null }),
      feedItem({ seed: 4, pubDate: "sometime last Thursday" }),
      feedItem({ seed: 5, description: MARKUP_DESCRIPTION }),
      feedItem({ seed: 6, description: MARKUP_ONLY_DESCRIPTION }),
      feedItem({ seed: 7, category: ["People", "Events"] }),
      feedItem({ seed: 8, category: ["Anime", "Manga", "Events"] }),
    ].join("\n"),
  ),

  /**
   * A channel where two entries carry no link.
   *
   * A headline with no address cannot be attributed, so the entry is dropped,
   * and the count of what was dropped is the difference between what the wire
   * published and what a reader is shown.
   */
  "feed-partial.xml": rss(
    [
      CHANNEL_HEADER,
      feedItem({ seed: 1 }),
      feedItem({ seed: 2, link: "" }),
      feedItem({ seed: 3, category: "Anime" }),
      feedItem({ seed: 4, link: "" }),
      feedItem({ seed: 5 }),
    ].join("\n"),
  ),

  /** A channel that published nothing, which is a legitimate empty answer. */
  "feed-no-items.xml": rss(CHANNEL_HEADER),

  /** RSS without a channel: the document is not a feed at all. */
  "feed-no-channel.xml": `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <not-a-channel>
    <title>Placeholder</title>
  </not-a-channel>
</rss>
`,
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, content] of Object.entries(FIXTURES)) {
  writeFileSync(join(OUT_DIR, name), content, "utf8");
  process.stdout.write(`wrote ${name} (${content.length} bytes)\n`);
}
