/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one pair of caches are shared by all tools,
 * so the one-request-per-second pacing Anime News Network asks for applies to
 * the server as a whole rather than per tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AnnClient } from "./ann/client.js";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { strictInput } from "./tools/arguments.js";
import {
  getNewsDescription,
  getNewsInputShape,
  getNewsOutputShape,
  runGetNews,
} from "./tools/getNews.js";
import type { GetNewsArgs } from "./tools/getNews.js";
import {
  getTitleDescription,
  getTitleInputShape,
  getTitleOutputShape,
  runGetTitle,
} from "./tools/getTitle.js";
import type { GetTitleArgs } from "./tools/getTitle.js";
import {
  listRecentDescription,
  listRecentInputShape,
  listRecentOutputShape,
  runListRecent,
} from "./tools/listRecent.js";
import type { ListRecentArgs } from "./tools/listRecent.js";
import {
  runSearchTitles,
  searchTitlesDescription,
  searchTitlesInputShape,
  searchTitlesOutputShape,
} from "./tools/searchTitles.js";
import type { SearchTitlesArgs } from "./tools/searchTitles.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** This server only reads, so every tool is read-only. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new AnnClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-animenewsnetwork", version: PKG_VERSION },
    {
      instructions:
        "Tools for the Anime News Network encyclopedia and news wire. No API key is needed. " +
        "Typical flow: search_titles to find an entry and its id and kind, then get_title with both. " +
        "get_title returns only the sections you ask for, because a full record runs to tens of " +
        "thousands of tokens: start with 'basic' and add 'cast' or 'news' only when the question needs them. " +
        "search_titles matches on the title alone, so it cannot find a series from a character, a studio " +
        "or a plot detail; use list_recent to browse instead. " +
        "Anime News Network requires that you name it as the source and link the entry or article you quote, " +
        "and every result carries a source_url or link for that purpose.",
    },
  );

  server.registerTool(
    "search_titles",
    {
      title: "Search the encyclopedia",
      description: searchTitlesDescription,
      inputSchema: strictInput(searchTitlesInputShape),
      outputSchema: z.object(searchTitlesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runSearchTitles(client, args as SearchTitlesArgs),
  );

  server.registerTool(
    "get_title",
    {
      title: "Read an encyclopedia entry",
      description: getTitleDescription,
      inputSchema: strictInput(getTitleInputShape),
      outputSchema: z.object(getTitleOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runGetTitle(client, args as GetTitleArgs),
  );

  server.registerTool(
    "list_recent",
    {
      title: "List recent or browse alphabetically",
      description: listRecentDescription,
      inputSchema: strictInput(listRecentInputShape),
      outputSchema: z.object(listRecentOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runListRecent(client, args as ListRecentArgs),
  );

  server.registerTool(
    "get_news",
    {
      title: "Read the news wire",
      description: getNewsDescription,
      inputSchema: strictInput(getNewsInputShape),
      outputSchema: z.object(getNewsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => runGetNews(client, args as GetNewsArgs),
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, ` +
      `encyclopedia cache ${config.cacheTtlMs}ms, news cache ${config.newsCacheTtlMs}ms`,
  );

  return server;
}
