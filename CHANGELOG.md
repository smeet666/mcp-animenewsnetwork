# Changelog

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
