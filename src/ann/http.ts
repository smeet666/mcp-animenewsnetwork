/**
 * HTTP layer: one GET, with backoff.
 *
 * Anime News Network answers almost everything with HTTP 200, so this layer
 * deliberately does not decide whether a response is a success. It returns the
 * body and leaves that judgement to the parsers, which read the <warning>
 * element the site uses to report failures.
 *
 * The one status worth acting on is 503, which is what the nodelay variant of
 * the API returns when a caller goes over one request per second.
 */

import type { Config, Logger } from "../config.js";
import { AnnError, rateLimited, upstreamError } from "../errors.js";
import { RateLimiter, sleep } from "./rateLimiter.js";

const BACKOFF_BASE_MS = 2000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 20_000;

/** Exponential backoff with jitter, so parallel clients do not resynchronise. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const capped = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** attempt);
  return Math.round(capped * (0.5 + random() * 0.5));
}

export interface HttpDeps {
  config: Config;
  limiter: RateLimiter;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch one URL as text, retrying transient conditions.
 *
 * The retry loop and its sleeps run inside a single limiter slot, so a queued
 * request cannot slip into the window the current one is backing away from.
 */
export async function fetchText(url: string, deps: HttpDeps): Promise<string> {
  const { config, limiter, logger } = deps;
  const doFetch = deps.fetchImpl ?? fetch;

  return limiter.schedule(async () => {
    let lastError: AnnError | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const delay = backoffDelay(attempt - 1);
        logger.info(`retry ${attempt}/${config.maxRetries} in ${delay}ms for ${url}`);
        await sleep(delay);
      }

      let status: number;
      let body: string;
      try {
        const response = await doFetch(url, {
          headers: {
            "User-Agent": config.userAgent,
            Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        status = response.status;
        body = await response.text();
      } catch (error) {
        lastError = asTransportError(error, url);
        logger.debug(`${lastError.code} for ${url}: ${lastError.message}`);
        continue;
      }

      if (status === 429 || status === 503) {
        limiter.penalize();
        lastError = rateLimited(url, backoffDelay(attempt));
        logger.info(`rate limited on ${url}, interval now ${limiter.currentIntervalMs}ms`);
        continue;
      }
      if (status >= 500) {
        lastError = upstreamError(url, status);
        continue;
      }
      if (status >= 400) throw upstreamError(url, status);

      // An empty body is not a valid answer from any of these endpoints, and is
      // how a stressed CDN sometimes refuses. Retrying is safer than handing an
      // empty document to the parser, which would read as "nothing found".
      if (body.trim() === "") {
        limiter.penalize();
        lastError = rateLimited(url, backoffDelay(attempt));
        logger.info(`empty body on ${url}, treating as rate limiting`);
        continue;
      }

      limiter.relax();
      return body;
    }

    throw lastError ?? new AnnError("network_error", `Could not fetch ${url}.`, { url });
  });
}

function asTransportError(error: unknown, url: string): AnnError {
  if (error instanceof AnnError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new AnnError("timeout", "Anime News Network did not answer in time.", {
      url,
      hint: "Raise ANN_TIMEOUT_MS if this happens often on a slow connection.",
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AnnError("network_error", `Could not reach Anime News Network: ${message}`, { url });
}
