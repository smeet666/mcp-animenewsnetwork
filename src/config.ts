/**
 * Runtime configuration, read from environment variables.
 *
 * A bad value never crashes the process: an MCP server that dies at startup
 * because of a typo in a client config file is very hard to diagnose from the
 * host application, so invalid input is reported on stderr and ignored.
 */

import process from "node:process";
import { PKG_VERSION, REPO_URL } from "./version.js";

export type LogLevel = "silent" | "error" | "info" | "debug";

export interface Config {
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  newsCacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `mcp-animenewsnetwork v${PKG_VERSION} (${REPO_URL})`;

export const DEFAULTS = {
  minIntervalMs: 1100,
  timeoutMs: 15_000,
  maxRetries: 3,
  // The encyclopedia changes rarely and Anime News Network suggests holding
  // responses for a week. An hour is the useful ceiling here, since this cache
  // lives in memory and dies with the process.
  cacheTtlMs: 60 * 60 * 1000,
  // The news wire publishes several times an hour, so it gets its own shorter
  // lifetime rather than inheriting the encyclopedia's.
  newsCacheTtlMs: 5 * 60 * 1000,
  cacheMaxEntries: 200,
  logLevel: "error" as LogLevel,
};

/**
 * Floor on the request interval, enforced regardless of configuration.
 *
 * Anime News Network documents a limit of one request per second per IP and
 * delays anything above it, so pacing below this floor only queues requests on
 * their side while looking faster on ours.
 */
export const MIN_ALLOWED_INTERVAL_MS = 1000;

/** Ceiling on the request interval, so a typo cannot stall the server for hours. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

const LOG_LEVELS: LogLevel[] = ["silent", "error", "info", "debug"];

interface NumericRange {
  min: number;
  max: number;
  fallback: number;
}

function readNumber(name: string, env: NodeJS.ProcessEnv, range: NumericRange): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    return range.fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`${name}="${raw}" is not a number, using ${range.fallback}`);
    return range.fallback;
  }

  // Out-of-range values fall back to the default rather than being clamped to
  // the nearest bound. Clamping turns a typo into a silent behaviour change:
  // -1 retries becomes "never retry", and -1 cache entries disables the cache
  // outright, both of which look like working configuration.
  const rounded = Math.round(parsed);
  if (rounded < range.min || rounded > range.max) {
    warn(
      `${name}=${raw} is outside the accepted range ${range.min}-${range.max} and was ignored; ` +
        `using ${range.fallback}`,
    );
    return range.fallback;
  }
  return rounded;
}

function warn(message: string): void {
  process.stderr.write(`[mcp-animenewsnetwork] ${message}\n`);
}

/**
 * Read the request interval, refusing anything below the floor.
 *
 * A value under the floor falls back to the default rather than to the floor
 * itself: someone who set 0 was not asking for 1000, they were asking for no
 * pacing at all, and the safe reading of that request is to ignore it.
 */
function readInterval(env: NodeJS.ProcessEnv): number {
  const raw = env.ANN_MIN_INTERVAL_MS;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULTS.minIntervalMs;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    warn(`ANN_MIN_INTERVAL_MS="${raw}" is not a number, using ${DEFAULTS.minIntervalMs}ms`);
    return DEFAULTS.minIntervalMs;
  }

  const rounded = Math.round(parsed);
  if (rounded < MIN_ALLOWED_INTERVAL_MS) {
    warn(
      `ANN_MIN_INTERVAL_MS=${raw} is below the ${MIN_ALLOWED_INTERVAL_MS}ms floor and was ignored; ` +
        `using ${DEFAULTS.minIntervalMs}ms. Anime News Network limits callers to one request per second.`,
    );
    return DEFAULTS.minIntervalMs;
  }

  // The upper bound is a guard against a typo that would stall the server for
  // hours. Unlike readNumber, it clamps rather than falling back, because the
  // default would be far faster than the value asked for: someone who wrote ten
  // minutes wants slow, and answering that with 1100ms gets politeness backwards.
  if (rounded > MAX_ALLOWED_INTERVAL_MS) {
    warn(
      `ANN_MIN_INTERVAL_MS=${raw} exceeds the ${MAX_ALLOWED_INTERVAL_MS}ms ceiling; ` +
        `using ${MAX_ALLOWED_INTERVAL_MS}ms.`,
    );
    return MAX_ALLOWED_INTERVAL_MS;
  }

  return rounded;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawUserAgent = env.ANN_USER_AGENT?.trim();
  const rawLogLevel = env.ANN_LOG_LEVEL?.trim().toLowerCase();

  let logLevel = DEFAULTS.logLevel;
  if (rawLogLevel) {
    if (LOG_LEVELS.includes(rawLogLevel as LogLevel)) {
      logLevel = rawLogLevel as LogLevel;
    } else {
      warn(`ANN_LOG_LEVEL="${rawLogLevel}" is unknown, using "${DEFAULTS.logLevel}"`);
    }
  }

  return {
    userAgent: rawUserAgent || DEFAULT_USER_AGENT,
    minIntervalMs: readInterval(env),
    timeoutMs: readNumber("ANN_TIMEOUT_MS", env, {
      min: 1000,
      max: 120_000,
      fallback: DEFAULTS.timeoutMs,
    }),
    maxRetries: readNumber("ANN_MAX_RETRIES", env, {
      min: 0,
      max: 10,
      fallback: DEFAULTS.maxRetries,
    }),
    cacheTtlMs: readNumber("ANN_CACHE_TTL_MS", env, {
      min: 0,
      max: 24 * 60 * 60 * 1000,
      fallback: DEFAULTS.cacheTtlMs,
    }),
    newsCacheTtlMs: readNumber("ANN_NEWS_CACHE_TTL_MS", env, {
      min: 0,
      max: 24 * 60 * 60 * 1000,
      fallback: DEFAULTS.newsCacheTtlMs,
    }),
    cacheMaxEntries: readNumber("ANN_CACHE_MAX_ENTRIES", env, {
      min: 0,
      max: 10_000,
      fallback: DEFAULTS.cacheMaxEntries,
    }),
    logLevel,
  };
}

const LEVEL_RANK: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };

/**
 * Logs go to stderr without exception. On a stdio transport, stdout carries the
 * protocol and any stray write there corrupts the session.
 */
export function createLogger(level: LogLevel) {
  const emit = (at: LogLevel, message: string) => {
    if (LEVEL_RANK[level] >= LEVEL_RANK[at]) {
      process.stderr.write(`[mcp-animenewsnetwork] ${message}\n`);
    }
  };
  return {
    error: (message: string) => emit("error", message),
    info: (message: string) => emit("info", message),
    debug: (message: string) => emit("debug", message),
  };
}

export type Logger = ReturnType<typeof createLogger>;
