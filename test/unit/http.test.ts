import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, fetchText } from "../../src/ann/http.js";
import { RateLimiter } from "../../src/ann/rateLimiter.js";
import { createLogger } from "../../src/config.js";
import { AnnError } from "../../src/errors.js";
import { makeFetch, testConfig, xmlResponse } from "./_helpers.js";

const logger = createLogger("silent");
const URL = "https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=13";
const BODY = '<ann><anime id="13" name="Placeholder"/></ann>';

function deps(overrides: { maxRetries?: number; limiter?: RateLimiter } = {}) {
  const limiter = overrides.limiter ?? new RateLimiter({ minIntervalMs: 0 });
  return {
    limiter,
    config: testConfig({ maxRetries: overrides.maxRetries ?? 0 }),
    logger,
  };
}

/** Keeps the backoff deterministic and as short as the layer allows. */
function pinBackoff(): void {
  vi.spyOn(Math, "random").mockReturnValue(0);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchText", () => {
  it("returns the body of a successful response", async () => {
    const stub = makeFetch(() => xmlResponse(BODY));
    await expect(fetchText(URL, { ...deps(), fetchImpl: stub.impl })).resolves.toBe(BODY);
    expect(stub.calls).toEqual([URL]);
  });

  it("identifies itself and asks for XML", async () => {
    let init: RequestInit | undefined;
    const stub = makeFetch((_url, requestInit) => {
      init = requestInit;
      return xmlResponse(BODY);
    });
    await fetchText(URL, { ...deps(), fetchImpl: stub.impl });

    const headers = new Headers((init?.headers ?? {}) as Record<string, string>);
    expect(headers.get("user-agent")).toBe("mcp-animenewsnetwork-test");
    expect(headers.get("accept")).toContain("xml");
  });

  it("hands the body to the caller without judging whether it succeeded", async () => {
    // Failures arrive as HTTP 200 with a <warning> element, which only the
    // parsers can read. This layer must not try.
    const warning = "<ann><warning>no result for anime=13</warning></ann>";
    const stub = makeFetch(() => xmlResponse(warning));
    await expect(fetchText(URL, { ...deps(), fetchImpl: stub.impl })).resolves.toBe(warning);
  });

  describe("statuses", () => {
    it("reports a 4xx as a network error without retrying", async () => {
      const stub = makeFetch(() => new Response("nope", { status: 404 }));
      await expect(
        fetchText(URL, { ...deps({ maxRetries: 2 }), fetchImpl: stub.impl }),
      ).rejects.toMatchObject({ code: "network_error", details: { status: 404 } });
      expect(stub.calls, "a 4xx will not get better by asking again").toHaveLength(1);
    });

    it("reports a 503 as rate limiting rather than as a missing entry", async () => {
      const limiter = new RateLimiter({ minIntervalMs: 10 });
      const stub = makeFetch(() => new Response("busy", { status: 503 }));
      await expect(
        fetchText(URL, { ...deps({ limiter }), fetchImpl: stub.impl }),
      ).rejects.toMatchObject({ code: "rate_limited" });
      expect(limiter.currentIntervalMs, "the client did not slow down").toBeGreaterThan(10);
    });

    it("treats an empty body as the refusal it is", async () => {
      // A stressed CDN answers 200 with nothing. Parsing that would read as
      // "this title does not exist".
      const stub = makeFetch(() => xmlResponse("   "));
      await expect(fetchText(URL, { ...deps(), fetchImpl: stub.impl })).rejects.toMatchObject({
        code: "rate_limited",
      });
    });

    it("reports a 5xx as an upstream failure", async () => {
      const stub = makeFetch(() => new Response("boom", { status: 502 }));
      await expect(fetchText(URL, { ...deps(), fetchImpl: stub.impl })).rejects.toMatchObject({
        code: "network_error",
        details: { status: 502 },
      });
    });
  });

  describe("transport failures", () => {
    it("reports a dropped connection as a network error", async () => {
      const stub = makeFetch(() => {
        throw new Error("socket hang up");
      });
      await expect(fetchText(URL, { ...deps(), fetchImpl: stub.impl })).rejects.toMatchObject({
        code: "network_error",
      });
    });

    it("reports a timeout as a timeout, with something to act on", async () => {
      const stub = makeFetch(() => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      });
      const error = (await fetchText(URL, { ...deps(), fetchImpl: stub.impl }).catch(
        (caught: unknown) => caught,
      )) as AnnError;

      expect(error).toBeInstanceOf(AnnError);
      expect(error.code).toBe("timeout");
      expect(error.details.hint).toContain("ANN_TIMEOUT_MS");
    });
  });

  describe("retries", () => {
    it("recovers when a transient failure is followed by a success", async () => {
      pinBackoff();
      let call = 0;
      const stub = makeFetch(() => {
        call += 1;
        return call === 1 ? new Response("busy", { status: 503 }) : xmlResponse(BODY);
      });

      await expect(
        fetchText(URL, { ...deps({ maxRetries: 1 }), fetchImpl: stub.impl }),
      ).resolves.toBe(BODY);
      expect(stub.calls).toHaveLength(2);
    });

    it("claims a pacing slot before every attempt, retries included", async () => {
      // The retry chain runs inside one queue slot, so the only thing keeping
      // its attempts apart is the per-request claim.
      pinBackoff();
      const limiter = new RateLimiter({ minIntervalMs: 0 });
      const claims = vi.spyOn(limiter, "beforeRequest");
      let call = 0;
      const stub = makeFetch(() => {
        call += 1;
        return call === 1 ? new Response("busy", { status: 503 }) : xmlResponse(BODY);
      });

      await fetchText(URL, { ...deps({ maxRetries: 1, limiter }), fetchImpl: stub.impl });

      expect(claims).toHaveBeenCalledTimes(2);
      expect(claims.mock.calls.length).toBe(stub.calls.length);
    });

    it("gives up with the last failure once the retries are spent", async () => {
      pinBackoff();
      const stub = makeFetch(() => new Response("busy", { status: 503 }));
      await expect(
        fetchText(URL, { ...deps({ maxRetries: 1 }), fetchImpl: stub.impl }),
      ).rejects.toMatchObject({ code: "rate_limited" });
      expect(stub.calls).toHaveLength(2);
    });
  });

  it("relaxes the interval again after a success", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 10 });
    limiter.penalize();
    limiter.penalize();
    const penalized = limiter.currentIntervalMs;

    const stub = makeFetch(() => xmlResponse(BODY));
    await fetchText(URL, { ...deps({ limiter }), fetchImpl: stub.impl });

    expect(limiter.currentIntervalMs).toBeLessThan(penalized);
  });
});

describe("backoffDelay", () => {
  it("grows with each attempt", () => {
    const half = () => 0;
    expect(backoffDelay(1, half)).toBeGreaterThan(backoffDelay(0, half));
    expect(backoffDelay(2, half)).toBeGreaterThan(backoffDelay(1, half));
  });

  it("caps the wait, so a long outage does not park a request forever", () => {
    expect(backoffDelay(20, () => 1)).toBeLessThanOrEqual(20_000);
  });

  it("jitters between half and all of the delay, so callers do not resynchronise", () => {
    const lowest = backoffDelay(0, () => 0);
    const highest = backoffDelay(0, () => 1);
    expect(lowest).toBeLessThan(highest);
    expect(lowest).toBeGreaterThanOrEqual(highest / 2);
  });
});
