/**
 * HTTP layer: one GET, with backoff.
 *
 * Anime News Network answers almost everything with HTTP 200, so this layer
 * deliberately does not decide whether a response is a success. It returns the
 * body and leaves that judgement to the parsers, which read the <warning>
 * element the site uses to report failures.
 *
 * Statuses are still read where they carry meaning: 503 is what the site returns
 * when a caller goes over one request per second, and 403 is how an edge blocks
 * a client it dislikes. Both are refusals to back off from, and a `Retry-After`
 * the site sends is served for the whole of what it names. The waits the site
 * asks for share one budget across the call: once the total would pass it, the
 * chain ends and the figure the site sent is handed back, so the wait the caller
 * is told about is the wait this client observed.
 */

import type { Config, Logger } from "../config.js";
import { AnnError, emptyResponse, rateLimited, upstreamError } from "../errors.js";
import { type RateLimiter, sleep } from "./rateLimiter.js";

const BACKOFF_BASE_MS = 2000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 20_000;

// The budget one call may spend sleeping on the site's own instruction, counted
// across every refusal it meets. A tool call that blocks for minutes reads as a
// hang to whoever is waiting on it, so a wait that would carry the total past
// this figure ends the chain and is reported, leaving the caller free to come
// back when the site said to.
//
// This bounds the one part of the wait nobody here controls. The rest answers to
// an operator and is spent outside the budget: the backoff guess to
// BACKOFF_MAX_MS and ANN_MAX_RETRIES, each attempt to ANN_TIMEOUT_MS.
const RETRY_AFTER_MAX_MS = 60_000;

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
 * The retry loop runs inside a single limiter slot, so a queued request cannot
 * interleave with a chain that is backing off. Each attempt claims its own slot
 * through `beforeRequest`, which is what keeps the pacing honest between the
 * last request of one chain and the first request of the next.
 */
export async function fetchText(url: string, deps: HttpDeps): Promise<string> {
  const { config, limiter, logger } = deps;
  const doFetch = deps.fetchImpl ?? fetch;

  return await limiter.schedule(async () => {
    let lastError: AnnError | undefined;

    // Set when the site says how long to stay away; it replaces our own guess
    // for the next attempt. Applied here rather than where it is read, so no
    // wait is ever served after the last attempt, when nobody would use it.
    let askedWaitMs: number | null = null;

    // What the waits the site asked for have already cost this call. They share
    // one RETRY_AFTER_MAX_MS budget, so a chain of refusals each naming a wait
    // inside the ceiling cannot hold a caller for a multiple of it.
    let servedAskedWaitMs = 0;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const delay = askedWaitMs ?? backoffDelay(attempt - 1);
        askedWaitMs = null;
        logger.info(`retry ${attempt}/${config.maxRetries} in ${delay}ms for ${url}`);
        await sleep(delay);
      }

      let status: number;
      let body: string;
      let retryAfterMs: number | null = null;
      try {
        await limiter.beforeRequest();
        const response = await doFetch(url, {
          headers: {
            "User-Agent": config.userAgent,
            Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(config.timeoutMs),
        });
        status = response.status;
        retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
        body = await response.text();
      } catch (error) {
        lastError = asTransportError(error, url);
        logger.debug(`${lastError.code} for ${url}: ${lastError.message}`);
        continue;
      }

      const verdict = readResponse({
        url,
        status,
        body,
        retryAfterMs,
        attempt,
        servedAskedWaitMs,
        limiter,
        logger,
      });
      if (verdict.outcome === "accept") {
        return body;
      }
      if (verdict.outcome === "give-up") {
        throw verdict.error;
      }
      lastError = verdict.error;
      askedWaitMs = verdict.waitMs ?? null;
      servedAskedWaitMs += verdict.waitMs ?? 0;
      if (verdict.outcome === "stop") {
        break;
      }
    }

    throw lastError ?? new AnnError("network_error", `Could not fetch ${url}.`, { url });
  });
}

/**
 * What one completed response means for the chain.
 *
 * Four answers, and each is a different fact: the body is usable, the request
 * will never work, the site asked to be left alone for longer than this call may
 * spend, or another attempt is worth making. Reading them in one place keeps the
 * loop to what it does with them.
 */
type Verdict =
  | { outcome: "accept" }
  | { outcome: "give-up"; error: AnnError }
  | { outcome: "stop"; error: AnnError; waitMs: number | null }
  | { outcome: "retry"; error: AnnError; waitMs: number | null };

function readResponse(input: {
  url: string;
  status: number;
  body: string;
  retryAfterMs: number | null;
  attempt: number;
  servedAskedWaitMs: number;
  limiter: RateLimiter;
  logger: Logger;
}): Verdict {
  const { url, status, body, limiter, logger } = input;

  if (isPushback(status)) {
    limiter.penalize();
    logger.info(`refused on ${url} with ${status}, interval now ${limiter.currentIntervalMs}ms`);
    const refusal = standDown(url, input.retryAfterMs, input.attempt, input.servedAskedWaitMs);
    return {
      outcome: refusal.done ? "stop" : "retry",
      error: refusal.error,
      waitMs: refusal.waitMs,
    };
  }

  if (status >= 500) {
    return { outcome: "retry", error: upstreamError(url, status), waitMs: null };
  }
  if (status >= 400) {
    // A server-side fault may pass. Anything a client sent wrongly will not.
    return { outcome: "give-up", error: upstreamError(url, status) };
  }

  // An empty body is not a valid answer from any of these endpoints, and is how
  // a stressed edge sometimes answers. Retrying is safer than handing an empty
  // document to the parser, which would read as "nothing found".
  if (body.trim() === "") {
    limiter.penalize();
    logger.info(`empty body on ${url}, interval now ${limiter.currentIntervalMs}ms`);
    return { outcome: "retry", error: emptyResponse(url), waitMs: null };
  }

  limiter.relax();
  return { outcome: "accept" };
}

/**
 * The statuses that mean "back off", as this site uses them.
 *
 * 503 is what it answers over one request per second, and 403 is how an edge
 * turns away a client it dislikes. Both are refusals to wait out.
 */
function isPushback(status: number): boolean {
  return status === 429 || status === 503 || status === 403;
}

/**
 * What to do about a refusal: how long to stay away, and the error to hand back
 * if the attempts run out.
 *
 * A server that says when to come back knows better than our own guess, so a
 * wait it names is served for the whole of what it names, as long as the call
 * still has budget for it. `servedAskedWaitMs` is what earlier refusals in this
 * chain already cost, and a wait carrying that total past RETRY_AFTER_MAX_MS
 * ends the chain, which `done` says: sleeping a trimmed version of it would put
 * the next request inside the very window the site asked to be left alone in,
 * while telling the caller a figure this client did not observe. The status that
 * carried the refusal makes no difference here, since a wait the site names is
 * a wait the site named.
 */
function standDown(
  url: string,
  retryAfterMs: number | null,
  attempt: number,
  servedAskedWaitMs: number,
): { waitMs: number | null; error: AnnError; done: boolean } {
  if (retryAfterMs === null) {
    return { waitMs: null, error: rateLimited(url, backoffDelay(attempt)), done: false };
  }
  if (servedAskedWaitMs + retryAfterMs > RETRY_AFTER_MAX_MS) {
    return { waitMs: null, error: rateLimited(url, retryAfterMs), done: true };
  }
  return { waitMs: retryAfterMs, error: rateLimited(url, retryAfterMs), done: false };
}

/** `Retry-After` carries either seconds or an HTTP date. */
function parseRetryAfter(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const when = Date.parse(raw);
  if (Number.isNaN(when)) {
    return null;
  }
  return Math.max(0, when - Date.now());
}

function asTransportError(error: unknown, url: string): AnnError {
  if (error instanceof AnnError) {
    return error;
  }
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
