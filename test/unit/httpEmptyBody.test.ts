import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchText } from "../../src/ann/http.js";
import { RateLimiter } from "../../src/ann/rateLimiter.js";
import { createLogger } from "../../src/config.js";
import { AnnError } from "../../src/errors.js";
import { makeFetch, testConfig, xmlResponse } from "./_helpers.js";

/**
 * What the client reports when Anime News Network answers HTTP 200 with nothing.
 *
 * The site sends no 429, no 503, no 403 and no Retry-After on this path, so the
 * error it produces has to describe what arrived. A caller told it was rate
 * limited slows its pacing down to cure a fault pacing has no part in, and a
 * reader of the logs records a refusal the site never made.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const errorsSource = readFileSync(join(ROOT, "src", "errors.ts"), "utf8");

const logger = createLogger("silent");
const URL = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=13";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function deps(overrides: { maxRetries?: number; limiter?: RateLimiter } = {}) {
  const limiter = overrides.limiter ?? new RateLimiter({ minIntervalMs: 0 });
  return {
    limiter,
    config: testConfig({ maxRetries: overrides.maxRetries ?? 0, timeoutMs: 10 * 60_000 }),
    logger,
  };
}

/** An endpoint answering HTTP 200 with a body carrying nothing to parse. */
function emptyBodied() {
  return makeFetch(() => xmlResponse("   "));
}

/** Runs a fetch to its end through the fake clock and returns what it raised. */
async function raisedBy(
  stub: { impl: typeof fetch },
  overrides: { maxRetries?: number; limiter?: RateLimiter } = {},
): Promise<AnnError> {
  let caught: unknown;
  const settled = fetchText(URL, { ...deps(overrides), fetchImpl: stub.impl }).catch(
    (error: unknown) => {
      caught = error;
    },
  );
  await vi.runAllTimersAsync();
  await settled;

  expect(caught, "an empty body has to be reported, and reported as a failure").toBeInstanceOf(
    AnnError,
  );
  return caught as AnnError;
}

describe("an empty body under HTTP 200", () => {
  describe("the error it produces", () => {
    it("is a network error", async () => {
      const error = await raisedBy(emptyBodied());
      expect(error.code).toBe("network_error");
    });

    it("names the empty response body", async () => {
      const error = await raisedBy(emptyBodied());
      expect(error.message).toMatch(/empty/i);
      expect(error.message).toMatch(/body/i);
    });

    it("says nothing about rate limiting", async () => {
      // The site sent no refusal on this path, so a message announcing one
      // describes an event nobody observed.
      const error = await raisedBy(emptyBodied());
      expect(error.message).not.toMatch(/rate limit/i);
      expect(error.details.retryAfterMs).toBeUndefined();
    });

    it("carries a hint a caller can act on", async () => {
      const error = await raisedBy(emptyBodied());
      expect(typeof error.details.hint).toBe("string");
      expect((error.details.hint ?? "").length).toBeGreaterThan(0);
    });

    it("keeps the pacing knob out of its advice", async () => {
      // ANN_MIN_INTERVAL_MS is the answer to a site pushing this client back.
      // Offering it here sends the caller to fix the one thing that is working.
      const error = await raisedBy(emptyBodied());
      expect(error.details.hint ?? "").not.toContain("ANN_MIN_INTERVAL_MS");
    });

    it("names the address that answered", async () => {
      const error = await raisedBy(emptyBodied());
      expect(error.details.url).toBe(URL);
    });

    it("is built beside the other constructors in the error module", async () => {
      // The six codes are a closed list, and every error a caller sees is
      // assembled in one place so its wording and its hint stay reviewable.
      const declared = /export function \w+\([\s\S]{0,400}?empty/i.test(errorsSource);
      expect(declared, "src/errors.ts declares no constructor for an empty body").toBe(true);
    });
  });

  describe("what the client does before giving up", () => {
    it("asks again for every retry the operator allowed", async () => {
      const stub = emptyBodied();
      await raisedBy(stub, { maxRetries: 2 });
      expect(
        stub.calls,
        "an empty body from a stressed edge is worth asking a second time",
      ).toHaveLength(3);
    });

    it("eases off the pacing", async () => {
      // A body arriving empty is a sign of an edge under strain, so the client
      // widens its own interval whatever it ends up reporting.
      const limiter = new RateLimiter({ minIntervalMs: 10 });
      await raisedBy(emptyBodied(), { limiter });
      expect(limiter.currentIntervalMs).toBeGreaterThan(10);
    });
  });
});
