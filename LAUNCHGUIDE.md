# mcp-animenewsnetwork

## Tagline

The Anime News Network encyclopedia and news wire, with no API key.

## Description

An MCP server for Anime News Network. Search the anime and manga encyclopedia,
read an entry with its cast, staff, episodes, releases and related works, and
follow the news wire.

A full encyclopedia record runs to tens of thousands of tokens, so sections are
opt-in: ask for the plot and you get the plot. Cast credits are capped in a way
that keeps every language represented, rather than returning sixty rows of one
dub and none of the original.

Anime News Network asks to be named as the source, and every result carries the
link needed to do that.

## Setup Requirements

- `ANN_USER_AGENT` (optional): Identify your own client. The project's own identifier is appended.
- `ANN_MIN_INTERVAL_MS` (optional): Minimum gap between requests. Default 1100, and values below 1000 are refused, which is the rate Anime News Network asks for.
- `ANN_TIMEOUT_MS` (optional): Per-request deadline. Default 15000.
- `ANN_CACHE_TTL_MS` (optional): In-memory cache lifetime. Default 3600000. Set 0 to turn it off.
- `ANN_LOG_LEVEL` (optional): silent, error, info or debug. Default error, on stderr.

No API key and no account are needed.

## Category

Content & Media

## Features

- Search the encyclopedia for anime and manga by title
- Read one entry section by section: plot, cast, staff, episodes, releases, related works, news, reviews
- Cast credits balanced across languages, with the full count per language stated
- Episode lists with numbers and titles
- Browse what was added recently, by title or by person
- Read the news wire, with dates and links
- Long plot summaries paginated rather than cut
- Says plainly when a search matched no entry, instead of inventing one
- Attribution and a source link on every result

## Getting Started

- "What is Cowboy Bebop about, and who directed it?"
- "Give me the Japanese cast of Attack on Titan"
- "What anime were added to the encyclopedia this week?"
- Tool: search_titles — Finds an encyclopedia entry by title, returning its id and kind
- Tool: get_title — Reads one entry, only the sections you ask for
- Tool: list_recent — Browses recent additions, by title or by person
- Tool: get_news — Reads the news wire

## Tags

anime, manga, encyclopedia, anime-news-network, cast, staff, episodes, news, no-api-key

## Documentation URL

https://github.com/smeet666/mcp-animenewsnetwork#readme
