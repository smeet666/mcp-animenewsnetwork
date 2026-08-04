/**
 * High-level Anime News Network client.
 *
 * This module knows nothing about MCP, which keeps it testable against plain
 * strings and usable as a library through the `./client` export.
 */

import type { Config, Logger } from "../config.js";
import { createLogger, loadConfig } from "../config.js";
import type { NewsItem, ReportRow, TitleDetail, TitleKind, TitleSummary } from "../types.js";
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
}

export type RecentKind = keyof typeof RECENT_REPORT_IDS;

export class AnnClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly limiter: RateLimiter;
  /**
   * Two caches, because the two sources age at different speeds. The
   * encyclopedia barely moves and the site suggests holding it for a week; the
   * news wire publishes several times an hour.
   */
  private readonly encyclopediaCache: TtlLruCache<string>;
  private readonly newsCache: TtlLruCache<string>;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: AnnClientOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger = options.logger ?? createLogger(this.config.logLevel);
    this.limiter = new RateLimiter({ minIntervalMs: this.config.minIntervalMs });
    this.encyclopediaCache = new TtlLruCache<string>(
      this.config.cacheMaxEntries,
      this.config.cacheTtlMs,
    );
    this.newsCache = new TtlLruCache<string>(
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
    const { body, cached } = await this.fetchCached(url, this.encyclopediaCache);
    return { data: parseTitleList(body, url), cached };
  }

  async getTitle(kind: TitleKind, id: number): Promise<Outcome<TitleDetail>> {
    const url = titleDetailUrl(kind, id);
    const { body, cached } = await this.fetchCached(url, this.encyclopediaCache);
    return { data: parseTitleDetail(body, url, `${kind} id ${id}`), cached };
  }

  async listRecent(kind: RecentKind, limit: number, offset: number): Promise<Outcome<ReportRow[]>> {
    const url = recentReportUrl(RECENT_REPORT_IDS[kind], limit, offset);
    const { body, cached } = await this.fetchCached(url, this.encyclopediaCache);
    return { data: parseReport(body, url), cached };
  }

  async browseTitles(options: {
    limit: number;
    offset: number;
    type?: TitleKind;
    startsWith?: string;
  }): Promise<Outcome<ReportRow[]>> {
    const url = titleListReportUrl(options);
    const { body, cached } = await this.fetchCached(url, this.encyclopediaCache);
    return { data: parseReport(body, url), cached };
  }

  async getNews(feed: FeedName, edition: Edition): Promise<Outcome<NewsItem[]>> {
    const url = feedUrl(feed, edition);
    const { body, cached } = await this.fetchCached(url, this.newsCache);
    return { data: parseFeed(body, url), cached };
  }

  private async fetchCached(
    url: string,
    cache: TtlLruCache<string>,
  ): Promise<{ body: string; cached: boolean }> {
    const hit = cache.get(url);
    if (hit !== undefined) {
      this.logger.debug(`cache hit ${url}`);
      return { body: hit, cached: true };
    }

    const body = await fetchText(url, {
      config: this.config,
      limiter: this.limiter,
      logger: this.logger,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });
    cache.set(url, body);
    return { body, cached: false };
  }
}
