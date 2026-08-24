import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import type { Config } from "../../src/config.js";
import { AnnError, type ErrorCode } from "../../src/errors.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "..", "fixtures");

/** The address a fetch was called with, whichever of the three shapes it took. */
function addressOf(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return String((input as { url?: unknown }).url);
}

export function fixtureText(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

/**
 * Strings that only ever appear inside the heavy children of a record, mirrored
 * from the fixture generator.
 *
 * The leak tests assert each of these is present in the fixture before
 * asserting it is absent from a result, so a typo here fails loudly instead of
 * silently proving nothing.
 */
export const HEAVY_MARKERS = [
  "Voice Fixture Person",
  "Captain Placeholder Role",
  "Director Fixture Person",
  "Fixture Animation Works",
  "Episode Fixture Title",
  "News Headline Fixture",
  "Review Fixture Title",
  "Plot summary fixture sentence",
] as const;

/**
 * A configuration with pacing and caching neutralised, so a test exercises the
 * behaviour under test instead of waiting on the politeness delay or on the
 * retry backoff.
 */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    userAgent: "mcp-animenewsnetwork-test",
    minIntervalMs: 0,
    timeoutMs: 1_000,
    maxRetries: 0,
    cacheTtlMs: 0,
    newsCacheTtlMs: 0,
    cacheMaxEntries: 0,
    logLevel: "silent",
    ...overrides,
  };
}

export function xmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/xml" } });
}

export interface FetchStub {
  impl: typeof fetch;
  calls: string[];
}

export function makeFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): FetchStub {
  const calls: string[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    const url = addressOf(input);
    calls.push(url);
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/**
 * Routes the standard fixtures onto the endpoints the client calls.
 *
 * Keys are matched as substrings of the request URL, longest first, so a test
 * can override one endpoint by passing a more specific fragment than the
 * defaults it keeps.
 */
export function fixtureRouter(overrides: Record<string, string> = {}): FetchStub {
  const routes: Record<string, string> = {
    "api.xml?title=": "search-results.xml",
    "api.xml?anime=": "title-anime-full.xml",
    "api.xml?manga=": "title-manga.xml",
    "reports.xml?id=155": "report-title-list.xml",
    "reports.xml?id=148": "report-recent-anime.xml",
    "reports.xml?id=149": "report-recent-anime.xml",
    "reports.xml?id=150": "report-recent-person.xml",
    "reports.xml?id=151": "report-recent-person.xml",
    "rss.xml": "feed.xml",
    ...overrides,
  };
  const fragments = Object.keys(routes).sort((a, b) => b.length - a.length);

  return makeFetch((url) => {
    const decoded = decodeURIComponent(url);
    for (const fragment of fragments) {
      if (decoded.includes(fragment)) {
        return xmlResponse(fixtureText(routes[fragment] as string));
      }
    }
    throw new Error(`unexpected url in test: ${url}`);
  });
}

/** Asserts a call fails as an AnnError carrying a given code, and returns it. */
export function expectAnnError(fn: () => unknown, code: ErrorCode): AnnError {
  let thrown: unknown;
  try {
    fn();
  } catch (raised) {
    thrown = raised;
  }

  expect(thrown, `expected an AnnError with code "${code}", nothing was thrown`).toBeInstanceOf(
    AnnError,
  );
  const error = thrown as AnnError;
  expect(error.code, `error message was: ${error.message}`).toBe(code);
  expect(error.message, "an error must say something a model can act on").not.toBe("");
  return error;
}
