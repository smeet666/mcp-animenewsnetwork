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
  ${heavy ? heavyChildren(seed) : ""}
</${element}>`;
}

function ann(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ann>\n${body}\n</ann>\n`;
}

/** Shape A: report 155, which lists titles with their fields as elements. */
function titleListItem(seed) {
  return `<item>
    <id>${40400 + seed}</id>
    <gid>383109600${seed}</gid>
    <type>${seed % 2 === 0 ? "manga" : "TV"}</type>
    <name>Placeholder Listed Title ${seed}</name>
    <precision>${seed % 2 === 0 ? "manga" : `TV ${seed}`}</precision>
    <vintage>2026-08-0${seed}</vintage>
    <unknown-column>noise the parser must ignore</unknown-column>
  </item>`;
}

/** Shape B: reports 148-151, where the id only exists inside the href. */
function recentItem(kind, seed) {
  return `<item>
    <${kind} href="/encyclopedia/${kind}.php?id=${40400 + seed}">Placeholder Added ${kind} ${seed} (TV ${seed})</${kind}>
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
      ${category === null ? "" : `<category>${category}</category>`}
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

  /** The other warning it serves, for a request it declined to run. */
  "warning-ignored.xml": ann("<warning>ignored </warning>"),

  /** Report 155: titles with their fields as child elements. */
  "report-title-list.xml": report([1, 2, 3, 4, 5].map(titleListItem)),

  /** Report 148: recently added anime, where the id lives in the href. */
  "report-recent-anime.xml": report([1, 2, 3].map((seed) => recentItem("anime", seed))),

  /** Report 150: the same shape, with a different linking element. */
  "report-recent-person.xml": report([1, 2].map((seed) => recentItem("person", seed))),

  /** A report that ran and matched nothing, which is a legitimate empty answer. */
  "report-empty.xml": report([], 0),

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
   * A feed with a well-formed date, an unparseable one, a missing category and
   * the escaped inline markup the live wire wraps titles in.
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
