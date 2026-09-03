# Changelog

## Unreleased

Breaking, so the next release is a major one.

- **A news story carries every category the wire tags it with**, under
  `categories`, where it carried the first one alone under `category`. The wire
  tags roughly one story in ten more than once, so a filter matched against the
  first tag dropped stories the wire did tag the way that was asked for, the
  count of what was available reported the remainder as the whole, and the note
  listing what a feed carries could answer that no story is tagged a way while
  stories carried it. The field is renamed in the tool output and on `NewsItem`,
  which the `./client` entry point publishes.
- **`get_title` serves the sections it was asked for.** The whole of `basic` came
  back whatever the request named, so a caller asking for the news of an entry
  paid for genres, themes, ratings and up to four thousand characters of plot
  summary, and read a note offering to page a summary it had not asked for. Its
  fields are declared optional in the result schema. The entry's name, kind, id
  and link come back whatever was asked, since they are what a caller cites.

Everything else here holds the same shapes.

- **A title the encyclopedia files under a manga subtype is reported as a
  manga.** The catalogue of a report row was read off the site's editorial label
  with a single literal, so every manga labelled anything but "manga" was
  reported as an anime and linked into a namespace that holds no such id.
- **A related entry carries no link.** The row names an id whose catalogue the
  site does not state, and the two catalogues share one integer range, so the
  link was built on the catalogue of the entry being read. Verified on the site:
  an anime adapted from a manga points at the manga's id.
- **A release, a news item and a review carry their address in the text block.**
  The renderer looked for the address under names no row uses, so a text-only
  client showed headlines nobody could open or cite.
- **A `Retry-After` the site sends is served for the whole of what it names**,
  where it was shortened to twenty seconds, and the waits one call spends on the
  site's instruction share one budget.
- **An empty body under HTTP 200 is reported as a network error**, where it was
  reported as rate limiting, which had a caller slow its pacing for a fault
  unrelated to pacing.
- **A refusal raised inside a list of values carries the error code** every other
  refusal opens with.
- **A `kind` restriction that removes every match says so**, naming how many rows
  the encyclopedia returned and which catalogue they are in, where the answer
  read as a query the encyclopedia matched nothing for.
- **A restriction sent as an empty string, or as spaces, is refused** before a
  request goes out, where it was read as no restriction and answered with
  everything.
- **Entries the site published and this client could not read are counted** in
  the answer, so a page holding fewer rows than the site sent says so.
- **The registry descriptor and the plugin manifest are held to the server by a
  test.** The first announced three of the eight settings the code reads, and the
  second still described an older result shape.

## 2.0.1

- **Every tool is documented, with its arguments and what its answer carries.**
  The README is written for a person deciding whether to install and for a
  program installing on its own, and a test holds both halves to what the server
  registers.
- **The privacy policy travels in the package.** It states the hosts contacted,
  what a request carries, what is held and for how long.
- **The manifest names every tool the server registers**, which a host reads
  before installing anything.

## 2.0.0

- **This server now needs node 24 or later.** Node 20 reached its end of
  support on 2026-04-30 and node 22 is no longer what this code is built and
  typed against. That is what makes this a major version: an install on an
  older node is refused rather than left to fail somewhere later.
- **An argument this server does not declare is now refused.** It used to be
  read and dropped, so a call carrying a mistyped name came back with the
  answer the defaults produce, and nothing in the reply said so.
- **Every refusal of an argument opens with `invalid_input`.** A value outside
  its bounds, of the wrong type, or outside the set an argument reads used to
  come back in the validator's own words, with no code to branch on.
- **A container image is published for each version**, on ghcr, for amd64 and
  arm64. The readme carries the configuration that runs it.
- The published package carries its changelog, and the entry point it declares
  for the package root now publishes its types.

## 1.2.4

- The README carries the same badge row as every server here: npm, CI, the
  licence, the MCP registry entry, the Glama score, and one-click installs for
  Cursor and VS Code. Each install link encodes this package. npm serves the
  README frozen at publish time, so a release is what puts it there.

## 1.2.3

- The server reported version 1.2.1 while the package said 1.2.2. The constant
  the code reads sat outside the three files a release updates, so it kept the
  number of the release before it. That constant is also what the `User-Agent`
  carries, so Anime News Network was told which build was calling and told the
  wrong one. The four now hold one version, and a test reads the constant
  against `package.json` so they cannot part again.

## 1.2.2

- Number the episodes in the text block. The list read `undefined` in the
  position where each number belongs, for every episode of every series, while
  the structured payload carried the numbers correctly. Clients that show only
  the text saw a hundred rows of a placeholder standing where data should be.

## 1.2.1

- Stop published text from producing a line shaped like one this server writes.
  The text block ends with lines opening "Note:" and "Source:", and anyone who
  publishes on the site can put those same words at the start of a line in a
  title or a description, where a reader has no way to tell the two apart. Such
  a line is indented in the text block. The structured output carries the text
  exactly as published, as it did.

## 1.2.0

- Ship a `.mcpb` bundle on every release, so the server can be installed by
  opening a file rather than by having npm and a client configuration. The
  dependencies are compiled into a single file, which makes the bundle 164 kB
  and five files instead of 3 MB and two thousand: a bundle is unpacked, not
  resolved, so a copy of `node_modules` would only be dead weight. The npm build
  still keeps its dependencies external, and the two builds are separate
  configurations for that reason.
- Declare the bundle in `server.json`, with the hash the registry requires
  computed from the released file at publish time rather than committed as a
  value that goes stale on every build.

## 1.1.1

Housekeeping, with no change to what any tool returns.

- Declare the tool schemas as objects rather than as the raw shape the SDK now
  deprecates. The emitted `tools/list` is byte for byte what it was.
- Add an icon and a `websiteUrl` to `server.json`, so the registry has something
  to show next to the entry.

## 1.1.0

The nightly canary caught the site tagging its Japanese cast like any other
language, where it used to leave the original untagged. Two things followed.

- `lang` no longer claims that a null marks the original cast. It never will
  again: every credit now carries a language, and null means the site recorded
  none rather than anything about the credit.
- Trim a cast without losing a language. Credits arrive ordered alphabetically
  by language, so taking the first sixty answered "who voices Spike Spiegel"
  with the German dub actor and dropped the Japanese, Korean, Portuguese and
  Tagalog casts entirely. Each language keeps a share of the budget, the site's
  own order is preserved, and the new `cast_languages` reports the full count
  per language so a trimmed list still shows what exists.
- Render the sections in the text block. It announced "Also returned: cast,
  news, reviews" and printed none of them, so a client rendering only text paid
  for a section and received a promise. Cast, staff, episodes, releases, related
  entries, news and reviews are printed, and the notes with them.
- Say when a requested section is genuinely empty. An empty list and a section
  that could not be read looked identical, and a manga has no episodes by
  construction.

## 1.0.1

- Keep the source credit on the text block when it has to be shortened. The
  block was assembled with the credit last and then truncated to fit, so any
  answer over the budget lost exactly that line: a search for "gundam" returns
  26 rows and 2014 characters against a 2000 budget, so it fired on an ordinary
  query. The body is now trimmed around the credit, and says when it was
  shortened, which a client rendering only text had no other way to know.
- Honour `Retry-After` when the site sends one, in both its seconds and its
  HTTP-date form, instead of guessing a delay. The wait is spent between
  attempts rather than after the last one, where nobody would use it.
- Treat HTTP 403 as a refusal to back off from, like 429 and 503. It was
  reported as a plain error, so the client kept its pace in the one situation
  where slowing down is the remedy.
- Bound the pacing wait by the interval. A clock stepped backwards, by NTP or a
  resumed virtual machine, made the next request wait for the size of the step,
  and the queue is serial so every pending call waited behind it.
- Enforce the pacing floor and the identifying User-Agent in the client rather
  than only when reading the environment. `AnnClient` is published through the
  `./client` export and accepts a caller-built config, so both promises made to
  Anime News Network were previously optional for anyone importing the library.

## 1.0.0

First stable release. The tool contracts are settled: tool names, argument names
and the shape of the structured output will not change without a major version.

Four tools over the Anime News Network encyclopedia and news wire, with no API
key and no account:

- `search_titles` finds an entry by name and returns compact rows. The
  encyclopedia answers a name search with the complete record of every match,
  which reaches 1.4 MB for a query like "One Piece"; this returns roughly 10 KB
  for the same query.
- `get_title` reads one entry, section by section. A full record runs to 79 KB
  for a long-running series, so `basic` is the default and cast, staff,
  episodes, releases, related entries, news and reviews are opt-in. Long plot
  summaries paginate through `max_chars` and `offset`.
- `list_recent` lists what was added to the encyclopedia most recently, across
  anime, manga, people and companies, and browses titles alphabetically.
- `get_news` reads the news, reviews and combined feeds across the US, UK and
  Australian editions.

Every failure is reported as an error rather than as an empty result. This
matters more here than in the sibling servers: Anime News Network answers every
request with HTTP 200 and signals failures inside the body, so an unknown id
would otherwise read as "this series does not exist".
