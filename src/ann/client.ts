/**
 * High-level Anime News Network client.
 *
 * This module knows nothing about MCP, which keeps it testable against plain
 * strings and usable as a library through the `./client` export.
 */

import type { Config, Logger } from "../config.js";
import {
  DEFAULT_USER_AGENT,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../config.js";
import type {
  NewsItem,
  OnSkip,
  ReportPage,
  TitleDetail,
  TitleKind,
  TitleSummary,
} from "../types.js";
import { TtlLruCache } from "./cache.js";
import { fetchText } from "./http.js";
import { parseFeed } from "./parseFeed.js";
import { parseReport } from "./parseReport.js";
import { parseTitleDetail, parseTitleList } from "./parseTitle.js";
import { RateLimiter } from "./rateLimiter.js";
import type { Edition, FeedName } from "./urls.js";
import {
  RECENT_REPORT_IDS,
  feedUrl,
  recentReportUrl,
  titleDetailUrl,
  titleListReportUrl,
  titleSearchUrl,
} from "./urls.js";

export interface AnnClientOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

export interface Outcome<T> {
  data: T;
  /** True when served from the in-memory cache rather than the network. */
  cached: boolean;
  /**
   * How many entries the site sent that could not be read, when any were.
   *
   * Absent on a read that came back whole, so a caller reads a number only
   * where one was measured.
   */
  skipped?: number;
}

/** A parsed answer and what the parsing left behind, kept together. */
interface Parsed<T> {
  data: T;
  skipped?: number;
}

/**
 * Run a parser that reports what it read past, and keep the count beside the
 * data.
 *
 * The count is stored with the answer, because the answer is cached. A gap
 * reported once and silent on every read served from memory afterwards would be
 * the same silence, an hour long.
 */
function withSkipCount<T>(run: (onSkip: OnSkip) => T): Parsed<T> {
  let skipped = 0;
  const data = run((dropped) => {
    skipped = dropped;
  });
  return skipped > 0 ? { data, skipped } : { data };
}

export type RecentKind = keyof typeof RECENT_REPORT_IDS;

/** The names a User-Agent carries when it passes traffic off as a browser. */
const BROWSER_IDENTITY = /mozilla\/|applewebkit|chrome\/|safari\/|gecko/i;

/**
 * Apply the guarantees this project makes about its own traffic.
 *
 * The environment parser already enforces both, but `AnnClient` is published as
 * a library through the `./client` export and takes a caller-built config, so
 * without this the pacing floor and the honest identity are optional for anyone
 * importing it. Anime News Network asks callers to identify themselves and to
 * stay under one request per second, and those promises hold on every path.
 *
 * A caller may still name their own application in the User-Agent. Passing the
 * traffic off as a browser is a different thing, and gets the project's own
 * identity appended so it stays attributable.
 */
function withGuarantees(config: Config): Config {
  const userAgent = BROWSER_IDENTITY.test(config.userAgent)
    ? `${config.userAgent} ${DEFAULT_USER_AGENT}`
    : config.userAgent;
  return {
    ...config,
    userAgent,
    minIntervalMs: Math.max(MIN_ALLOWED_INTERVAL_MS, config.minIntervalMs),
  };
}

export class AnnClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  /**
   * Two caches, because the two sources age at different speeds. The
   * encyclopedia barely moves and the site suggests holding it for a week; the
   * news wire publishes several times an hour.
   *
   * They hold parsed results rather than response bodies, for two reasons. A
   * body is only worth keeping once it has been read successfully, so a broken
   * response cannot be pinned for an hour and replayed at every retry. And the
   * bodies are the very thing this server exists to keep out of memory: a single
   * search response reaches 1.4 MB, against a couple of kilobytes of rows.
   */
  private readonly encyclopediaCache: TtlLruCache<unknown>;
  private readonly newsCache: TtlLruCache<unknown>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: AnnClientOptions = {}) {
    this.config = withGuarantees(options.config ?? loadConfig());
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ minIntervalMs: this.config.minIntervalMs });
    this.encyclopediaCache = new TtlLruCache<unknown>(
      this.config.cacheMaxEntries,
      this.config.cacheTtlMs,
    );
    this.newsCache = new TtlLruCache<unknown>(
      this.config.cacheMaxEntries,
      this.config.newsCacheTtlMs,
    );
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Search titles by name.
   *
   * The upstream response carries the full record of every match, so the return
   * type is deliberately `TitleSummary[]`: the heavy children never leave this
   * layer.
   */
  async searchTitles(query: string): Promise<Outcome<TitleSummary[]>> {
    const url = titleSearchUrl(query);
    return await this.fetchParsed(url, this.encyclopediaCache, (body) =>
      withSkipCount((onSkip) => parseTitleList(body, url, onSkip)),
    );
  }

  async getTitle(kind: TitleKind, id: number): Promise<Outcome<TitleDetail>> {
    const url = titleDetailUrl(kind, id);
    return await this.fetchParsed(url, this.encyclopediaCache, (body) => ({
      data: parseTitleDetail(body, url, `${kind} id ${id}`),
    }));
  }

  async listRecent(kind: RecentKind, limit: number, offset: number): Promise<Outcome<ReportPage>> {
    const url = recentReportUrl(RECENT_REPORT_IDS[kind], limit, offset);
    return await this.fetchParsed(url, this.encyclopediaCache, (body) => ({
      data: parseReport(body, url),
    }));
  }

  async browseTitles(options: {
    limit: number;
    offset: number;
    type?: TitleKind;
    startsWith?: string;
  }): Promise<Outcome<ReportPage>> {
    const url = titleListReportUrl(options);
    // The parser reads the catalogue from the same value that filtered the
    // request, so the URL and the rows it produces cannot disagree.
    return await this.fetchParsed(url, this.encyclopediaCache, (body) => ({
      data: parseReport(body, url, options.type ? { requestedKind: options.type } : {}),
    }));
  }

  async getNews(feed: FeedName, edition: Edition): Promise<Outcome<NewsItem[]>> {
    const url = feedUrl(feed, edition);
    return await this.fetchParsed(url, this.newsCache, (body) =>
      withSkipCount((onSkip) => parseFeed(body, url, onSkip)),
    );
  }

  /**
   * Fetch, parse, then cache. In that order: a response that could not be read
   * is never stored, so a bad minute upstream cannot be replayed from memory
   * for the rest of the cache lifetime.
   */
  private async fetchParsed<T>(
    url: string,
    cache: TtlLruCache<unknown>,
    parse: (body: string) => Parsed<T>,
  ): Promise<Outcome<T>> {
    const hit = cache.get(url) as Parsed<T> | undefined;
    if (hit !== undefined) {
      this.logger.debug(`cache hit ${url}`);
      return { ...hit, cached: true };
    }

    const body = await fetchText(url, {
      config: this.config,
      limiter: this.limiter,
      logger: this.logger,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });

    const parsed = parse(body);
    cache.set(url, parsed);
    return { ...parsed, cached: false };
  }
}
