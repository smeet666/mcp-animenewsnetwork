import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, fetchText } from "../../src/ann/http.js";
import { RateLimiter } from "../../src/ann/rateLimiter.js";
import { createLogger } from "../../src/config.js";
import { AnnError } from "../../src/errors.js";
import { makeFetch, testConfig } from "./_helpers.js";

/**
 * The wait Anime News Network asks for, and what the client does with it.
 *
 * The clock is pinned and moved by hand, so an assertion states the wait the
 * retry loop asked for.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const httpSource = readFileSync(join(ROOT, "src", "ann", "http.ts"), "utf8");

const logger = createLogger("silent");
const URL = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=13";

/** The longest wait the client will hold a caller for, in milliseconds. */
const RETRY_AFTER_CEILING_MS = 60_000;

/** The ceiling on the client's own backoff guess, in milliseconds. */
const BACKOFF_CEILING_MS = 20_000;

/** The statuses on which the site is understood to be pushing this client back. */
const PUSHBACK_STATUSES = [429, 503, 403];

beforeEach(() => {
  vi.useFakeTimers();
  // A whole second, so a Retry-After written as an HTTP date names an exact
  // number of milliseconds ahead of the pinned clock.
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deps(maxRetries: number) {
  return {
    limiter: new RateLimiter({ minIntervalMs: 0 }),
    // The request timeout sits far beyond anything these tests advance the
    // clock to, so every wait they measure is a retry wait.
    config: testConfig({ maxRetries, timeoutMs: 10 * 60_000 }),
    logger,
  };
}

interface Refusal {
  impl: typeof fetch;
  /** The pinned-clock instant of each attempt, in call order. */
  sentAt: number[];
  calls: string[];
}

/** A site that refuses every request, optionally naming when to come back. */
function refusing(retryAfter: string | null, status = 503): Refusal {
  const sentAt: number[] = [];
  const stub = makeFetch(() => {
    sentAt.push(Date.now());
    const headers = retryAfter === null ? {} : { "retry-after": retryAfter };
    return new Response("busy", { status, headers });
  });
  return { impl: stub.impl, sentAt, calls: stub.calls };
}

/** An HTTP-date Retry-After naming an instant a given distance ahead. */
function httpDateIn(ms: number): string {
  return new Date(Date.now() + ms).toUTCString();
}

/** Pins the jitter so the local backoff guess is a single known number. */
function pinBackoff(): void {
  vi.spyOn(Math, "random").mockReturnValue(0);
}

/** Starts a request and captures its outcome, leaving the clock untouched. */
function start(refusal: Refusal, maxRetries: number) {
  const outcome: { settledAt: number | null; error: unknown } = { settledAt: null, error: null };
  const settled = fetchText(URL, { ...deps(maxRetries), fetchImpl: refusal.impl }).then(
    (body) => {
      outcome.settledAt = Date.now();
      return body;
    },
    (raised: unknown) => {
      outcome.settledAt = Date.now();
      outcome.error = raised;
    },
  );
  return { settled, outcome };
}

describe("the wait Anime News Network asks for", () => {
  describe("a wait within what a caller can be held for", () => {
    it("sleeps for the whole of a wait counted in seconds", async () => {
      const refusal = refusing("45");
      const { settled } = start(refusal, 1);

      await vi.advanceTimersByTimeAsync(0);
      expect(refusal.calls).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(44_999);
      expect(
        refusal.calls,
        "a site that names its own stand-down is obeyed for the whole of it",
      ).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(refusal.calls).toHaveLength(2);

      await vi.runAllTimersAsync();
      await settled;
    });

    it("sleeps for the whole of a wait written as an HTTP date", async () => {
      const refusal = refusing(httpDateIn(45_000));
      const { settled } = start(refusal, 1);

      await vi.advanceTimersByTimeAsync(44_999);
      expect(refusal.calls, "both spellings of the header carry the same instruction").toHaveLength(
        1,
      );

      await vi.advanceTimersByTimeAsync(1);
      expect(refusal.calls).toHaveLength(2);

      await vi.runAllTimersAsync();
      await settled;
    });

    it("sleeps for a wait sitting exactly on the ceiling", async () => {
      const refusal = refusing(String(RETRY_AFTER_CEILING_MS / 1000));
      const { settled } = start(refusal, 1);

      await vi.advanceTimersByTimeAsync(RETRY_AFTER_CEILING_MS - 1);
      expect(refusal.calls, "the ceiling is a wait the client will serve").toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(refusal.calls).toHaveLength(2);

      await vi.runAllTimersAsync();
      await settled;
    });

    it("hands the caller the figure the site sent once the retries are spent", async () => {
      const refusal = refusing("45");
      const { settled, outcome } = start(refusal, 1);
      await vi.runAllTimersAsync();
      await settled;

      const error = outcome.error as AnnError;
      expect(error).toBeInstanceOf(AnnError);
      expect(error.code).toBe("rate_limited");
      expect(error.details.retryAfterMs).toBe(45_000);
    });
  });

  describe("a wait longer than a caller can be held for", () => {
    it("raises rate_limited as soon as the refusal arrives", async () => {
      const refusal = refusing("120");
      const startedAt = Date.now();
      const { settled, outcome } = start(refusal, 3);

      await vi.advanceTimersByTimeAsync(0);
      expect(
        outcome.settledAt,
        "a stand-down the client cannot serve ends the chain where it arrived",
      ).toBe(startedAt);
      expect(refusal.calls).toHaveLength(1);

      await settled;
    });

    it("sends no further request inside the stand-down the site asked for", async () => {
      const refusal = refusing("120");
      const { settled } = start(refusal, 3);

      await vi.advanceTimersByTimeAsync(120_000);
      expect(
        refusal.calls,
        "a volunteer-run site that asks for two minutes gets two minutes",
      ).toHaveLength(1);

      await settled;
    });

    it("tells the caller the wait the site asked for", async () => {
      const refusal = refusing("120");
      const { settled, outcome } = start(refusal, 3);
      await vi.runAllTimersAsync();
      await settled;

      const error = outcome.error as AnnError;
      expect(error).toBeInstanceOf(AnnError);
      expect(error.code).toBe("rate_limited");
      // The advice in the message is the figure a caller acts on, so it has to
      // be a wait the client itself respected.
      expect(error.details.retryAfterMs).toBe(120_000);
      expect(error.message).toContain("rate limiting");
    });

    it("reads a long stand-down written as an HTTP date the same way", async () => {
      const refusal = refusing(httpDateIn(120_000));
      const { settled, outcome } = start(refusal, 3);

      await vi.advanceTimersByTimeAsync(120_000);
      expect(refusal.calls).toHaveLength(1);
      await settled;

      const error = outcome.error as AnnError;
      expect(error.code).toBe("rate_limited");
      expect(error.details.retryAfterMs).toBe(120_000);
    });

    for (const status of PUSHBACK_STATUSES) {
      it(`stops at once on HTTP ${status} carrying a long wait`, async () => {
        const refusal = refusing("120", status);
        const { settled, outcome } = start(refusal, 3);

        await vi.advanceTimersByTimeAsync(120_000);
        expect(refusal.calls).toHaveLength(1);
        await settled;

        const error = outcome.error as AnnError;
        expect(error).toBeInstanceOf(AnnError);
        expect(error.code).toBe("rate_limited");
        expect(error.details.retryAfterMs).toBe(120_000);
      });
    }
  });

  describe("a refusal naming no wait", () => {
    it("falls back on the client's own backoff guess", async () => {
      pinBackoff();
      const guess = backoffDelay(0, () => 0);
      const refusal = refusing(null);
      const { settled } = start(refusal, 1);

      await vi.advanceTimersByTimeAsync(guess - 1);
      expect(refusal.calls, "a site that said nothing is guessed at, briefly").toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(refusal.calls).toHaveLength(2);

      await vi.runAllTimersAsync();
      await settled;
    });

    it("keeps every guessed wait under the backoff ceiling", async () => {
      // The guess is the client's own invention, so it stays short enough that
      // a caller is never parked on an outage the site never described.
      vi.spyOn(Math, "random").mockReturnValue(1);
      const refusal = refusing(null);
      const { settled } = start(refusal, 5);
      await vi.runAllTimersAsync();
      await settled;

      const gaps = refusal.sentAt
        .slice(1)
        .map((at, index) => at - (refusal.sentAt[index] as number));
      expect(gaps).toHaveLength(5);
      for (const gap of gaps) {
        expect(gap).toBeLessThanOrEqual(BACKOFF_CEILING_MS);
      }
    });
  });

  describe("the ceiling as a budget for the whole call", () => {
    it("counts the waits it has already served against the ceiling", async () => {
      // Three refusals of thirty seconds each: two fit inside the minute, and
      // the third would carry the caller past it.
      const refusal = refusing("30");
      const startedAt = Date.now();
      const { settled, outcome } = start(refusal, 5);

      await vi.runAllTimersAsync();
      await settled;

      expect(refusal.calls).toHaveLength(3);
      expect(outcome.settledAt).toBe(startedAt + 60_000);
    });

    it("holds a caller inside the ceiling when every refusal names it", async () => {
      // A minute-long stand-down served three times over is three minutes of a
      // tool call that reads as a hang to whoever is waiting on it.
      const refusal = refusing(String(RETRY_AFTER_CEILING_MS / 1000));
      const startedAt = Date.now();
      const { settled, outcome } = start(refusal, 3);

      await vi.runAllTimersAsync();
      await settled;

      expect(refusal.calls).toHaveLength(2);
      expect((outcome.settledAt as number) - startedAt).toBeLessThanOrEqual(RETRY_AFTER_CEILING_MS);
    });

    it("stops before a wait that would carry the total past the ceiling", async () => {
      const refusal = refusing("45");
      const startedAt = Date.now();
      const { settled, outcome } = start(refusal, 5);

      await vi.runAllTimersAsync();
      await settled;

      expect(
        refusal.calls,
        "forty-five seconds twice over is ninety, and the budget is sixty",
      ).toHaveLength(2);
      expect(outcome.settledAt).toBe(startedAt + 45_000);
    });

    it("sends no request inside the stand-down it stopped on", async () => {
      const refusal = refusing("45");
      const { settled } = start(refusal, 5);

      await vi.advanceTimersByTimeAsync(45_000);
      expect(refusal.calls).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(45_000);
      expect(
        refusal.calls,
        "the chain ends where the budget does, and the site is left alone",
      ).toHaveLength(2);

      await settled;
    });

    it("hands back the figure the site sent when the budget runs out", async () => {
      const refusal = refusing("45");
      const { settled, outcome } = start(refusal, 5);
      await vi.runAllTimersAsync();
      await settled;

      const error = outcome.error as AnnError;
      expect(error).toBeInstanceOf(AnnError);
      expect(error.code).toBe("rate_limited");
      // The caller acts on this figure, so it states the wait the site named.
      expect(error.details.retryAfterMs).toBe(45_000);
    });

    for (const status of PUSHBACK_STATUSES) {
      it(`spends one budget across a chain of HTTP ${status} refusals`, async () => {
        const refusal = refusing("45", status);
        const { settled } = start(refusal, 5);
        await vi.runAllTimersAsync();
        await settled;

        expect(refusal.calls).toHaveLength(2);
      });
    }

    it("leaves the client's own backoff guess outside the budget", async () => {
      // The guess is bounded by BACKOFF_MAX_MS and by ANN_MAX_RETRIES, both of
      // which an operator sets, so a chain of guesses is free to run past the
      // minute the site-named waits are budgeted at.
      vi.spyOn(Math, "random").mockReturnValue(1);
      const refusal = refusing(null);
      const startedAt = Date.now();
      const { settled, outcome } = start(refusal, 8);

      await vi.runAllTimersAsync();
      await settled;

      expect(refusal.calls).toHaveLength(9);
      expect((outcome.settledAt as number) - startedAt).toBeGreaterThan(RETRY_AFTER_CEILING_MS);
    });
  });

  describe("the comment beside the ceiling", () => {
    /** The block of comment lines sitting immediately above the constant. */
    function commentAboveTheCeiling(): string {
      const upTo = httpSource.slice(0, httpSource.indexOf("const RETRY_AFTER_MAX_MS"));
      return upTo.slice(upTo.lastIndexOf("\n\n"));
    }

    it("names what bounds the client's own guess", async () => {
      // The ceiling buys a bound on the figure a site names, which nothing else
      // bounds. The comment has to say which knobs cover the other wait.
      const beside = commentAboveTheCeiling();
      expect(beside, beside).toContain("BACKOFF_MAX_MS");
      expect(beside, beside).toContain("ANN_MAX_RETRIES");
    });

    it("states what the ceiling does in a direct sentence", async () => {
      const beside = commentAboveTheCeiling();
      expect(beside, beside).not.toContain("instead of slept through");
    });
  });
});
