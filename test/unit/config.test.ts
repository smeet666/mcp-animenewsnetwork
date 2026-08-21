import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULTS,
  DEFAULT_USER_AGENT,
  MIN_ALLOWED_INTERVAL_MS,
  createLogger,
  loadConfig,
} from "../../src/config.js";
import { PKG_VERSION, REPO_URL } from "../../src/version.js";

/** Collects everything a call writes to stderr, whichever channel it uses. */
function captureStderr(): { lines: () => string; restore: () => void } {
  const chunks: string[] = [];
  const writeSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown): boolean => {
      chunks.push(String(chunk));
      return true;
    });
  const consoleSpies = (["error", "warn", "info", "debug", "log"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      chunks.push(args.map(String).join(" "));
    }),
  );
  return {
    lines: () => chunks.join("\n"),
    restore: () => {
      writeSpy.mockRestore();
      for (const spy of consoleSpies) {
        spy.mockRestore();
      }
    },
  };
}

describe("loadConfig", () => {
  it("falls back to every default on an empty environment", () => {
    expect(loadConfig({})).toEqual({
      userAgent: DEFAULT_USER_AGENT,
      minIntervalMs: DEFAULTS.minIntervalMs,
      timeoutMs: DEFAULTS.timeoutMs,
      maxRetries: DEFAULTS.maxRetries,
      cacheTtlMs: DEFAULTS.cacheTtlMs,
      newsCacheTtlMs: DEFAULTS.newsCacheTtlMs,
      cacheMaxEntries: DEFAULTS.cacheMaxEntries,
      logLevel: DEFAULTS.logLevel,
    });
  });

  it("does not read process.env when an explicit environment is passed", () => {
    const previous = process.env.ANN_USER_AGENT;
    process.env.ANN_USER_AGENT = "leaked-from-process-env";
    try {
      expect(loadConfig({}).userAgent).toBe(DEFAULT_USER_AGENT);
    } finally {
      if (previous === undefined) {
        delete process.env.ANN_USER_AGENT;
      } else {
        process.env.ANN_USER_AGENT = previous;
      }
    }
  });

  it("reads every documented variable", () => {
    expect(
      loadConfig({
        ANN_USER_AGENT: "my-agent/1.0 (mailto:me@example.com)",
        ANN_MIN_INTERVAL_MS: "1500",
        ANN_TIMEOUT_MS: "2500",
        ANN_MAX_RETRIES: "5",
        ANN_CACHE_TTL_MS: "1000",
        ANN_NEWS_CACHE_TTL_MS: "2000",
        ANN_CACHE_MAX_ENTRIES: "7",
        ANN_LOG_LEVEL: "debug",
      }),
    ).toEqual({
      userAgent: "my-agent/1.0 (mailto:me@example.com)",
      minIntervalMs: 1500,
      timeoutMs: 2500,
      maxRetries: 5,
      cacheTtlMs: 1000,
      newsCacheTtlMs: 2000,
      cacheMaxEntries: 7,
      logLevel: "debug",
    });
  });

  describe("the two cache lifetimes", () => {
    // The encyclopedia barely moves and the news wire publishes several times an
    // hour, so one lifetime cannot serve both.

    it("reads each one independently of the other", () => {
      const encyclopediaOnly = loadConfig({ ANN_CACHE_TTL_MS: "1234" });
      expect(encyclopediaOnly.cacheTtlMs).toBe(1234);
      expect(encyclopediaOnly.newsCacheTtlMs).toBe(DEFAULTS.newsCacheTtlMs);

      const newsOnly = loadConfig({ ANN_NEWS_CACHE_TTL_MS: "4321" });
      expect(newsOnly.newsCacheTtlMs).toBe(4321);
      expect(newsOnly.cacheTtlMs).toBe(DEFAULTS.cacheTtlMs);
    });

    it("holds the encyclopedia longer than the wire by default", () => {
      expect(DEFAULTS.cacheTtlMs).toBeGreaterThan(DEFAULTS.newsCacheTtlMs);
    });

    it("lets either cache be switched off with a zero lifetime", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ ANN_CACHE_TTL_MS: "0" }).cacheTtlMs).toBe(0);
        expect(loadConfig({ ANN_NEWS_CACHE_TTL_MS: "0" }).newsCacheTtlMs).toBe(0);
      } finally {
        capture.restore();
      }
    });
  });

  describe("the 1000 ms floor on the request interval", () => {
    // Anime News Network limits callers to one request per second and delays
    // anything above it, so pacing faster only queues requests on their side.

    it("exports the floor as 1000", () => {
      expect(MIN_ALLOWED_INTERVAL_MS).toBe(1000);
    });

    it("ignores a value below the floor and uses the default, not the floor", () => {
      const capture = captureStderr();
      try {
        for (const value of ["0", "50", "999", "-1000"]) {
          expect(loadConfig({ ANN_MIN_INTERVAL_MS: value }).minIntervalMs, value).toBe(
            DEFAULTS.minIntervalMs,
          );
        }
      } finally {
        capture.restore();
      }
    });

    it("accepts exactly the floor", () => {
      expect(
        loadConfig({ ANN_MIN_INTERVAL_MS: String(MIN_ALLOWED_INTERVAL_MS) }).minIntervalMs,
      ).toBe(MIN_ALLOWED_INTERVAL_MS);
    });

    it("accepts an interval slower than the default", () => {
      expect(loadConfig({ ANN_MIN_INTERVAL_MS: "5000" }).minIntervalMs).toBe(5000);
    });

    it("paces at least as slowly as the floor by default", () => {
      expect(DEFAULTS.minIntervalMs).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS);
    });
  });

  describe("values outside the accepted range", () => {
    // Clamping would turn a typo into a silent behaviour change: -1 retries
    // reads as "never retry" and 0 cache entries as "no cache", both of which
    // look like working configuration. The default is the only safe reading.

    const outOfRange: [string, string, keyof ReturnType<typeof loadConfig>][] = [
      ["ANN_TIMEOUT_MS", "-1", "timeoutMs"],
      ["ANN_TIMEOUT_MS", "0", "timeoutMs"],
      ["ANN_TIMEOUT_MS", "999999999", "timeoutMs"],
      ["ANN_MAX_RETRIES", "-1", "maxRetries"],
      ["ANN_MAX_RETRIES", "1000", "maxRetries"],
      ["ANN_CACHE_TTL_MS", "-1", "cacheTtlMs"],
      ["ANN_CACHE_TTL_MS", "999999999999", "cacheTtlMs"],
      ["ANN_NEWS_CACHE_TTL_MS", "-1", "newsCacheTtlMs"],
      ["ANN_NEWS_CACHE_TTL_MS", "999999999999", "newsCacheTtlMs"],
      ["ANN_CACHE_MAX_ENTRIES", "-1", "cacheMaxEntries"],
      ["ANN_CACHE_MAX_ENTRIES", "10000000", "cacheMaxEntries"],
    ];

    it("falls back to the default rather than clamping to the nearest bound", () => {
      const capture = captureStderr();
      try {
        for (const [name, value, field] of outOfRange) {
          const config = loadConfig({ [name]: value });
          expect(config[field], `${name}=${value}`).toBe(
            DEFAULTS[field as keyof typeof DEFAULTS] as number,
          );
        }
      } finally {
        capture.restore();
      }
    });

    it("says on stderr which variable was rejected", () => {
      const capture = captureStderr();
      let output: string;
      try {
        loadConfig({ ANN_TIMEOUT_MS: "-1" });
        output = capture.lines();
      } finally {
        capture.restore();
      }
      expect(output).toMatch(/ANN_TIMEOUT_MS/);
    });
  });

  describe("garbage values", () => {
    const garbage = [
      "abc",
      "",
      "   ",
      "NaN",
      "Infinity",
      "-Infinity",
      "null",
      "undefined",
      "12abc",
      "{}",
      "1,5",
    ];

    it("never throws, whatever the environment holds", () => {
      const capture = captureStderr();
      try {
        for (const value of garbage) {
          expect(() =>
            loadConfig({
              ANN_MIN_INTERVAL_MS: value,
              ANN_TIMEOUT_MS: value,
              ANN_MAX_RETRIES: value,
              ANN_CACHE_TTL_MS: value,
              ANN_NEWS_CACHE_TTL_MS: value,
              ANN_CACHE_MAX_ENTRIES: value,
              ANN_LOG_LEVEL: value,
              ANN_USER_AGENT: value,
            }),
          ).not.toThrow();
        }
      } finally {
        capture.restore();
      }
    });

    it("falls back to defaults for unparseable numbers", () => {
      const capture = captureStderr();
      try {
        for (const value of garbage) {
          const config = loadConfig({
            ANN_MIN_INTERVAL_MS: value,
            ANN_TIMEOUT_MS: value,
            ANN_MAX_RETRIES: value,
            ANN_CACHE_TTL_MS: value,
            ANN_NEWS_CACHE_TTL_MS: value,
            ANN_CACHE_MAX_ENTRIES: value,
          });
          expect({ value, ...config }).toMatchObject({
            minIntervalMs: DEFAULTS.minIntervalMs,
            timeoutMs: DEFAULTS.timeoutMs,
            maxRetries: DEFAULTS.maxRetries,
            cacheTtlMs: DEFAULTS.cacheTtlMs,
            newsCacheTtlMs: DEFAULTS.newsCacheTtlMs,
            cacheMaxEntries: DEFAULTS.cacheMaxEntries,
          });
        }
      } finally {
        capture.restore();
      }
    });

    it("ignores a blank user agent", () => {
      expect(loadConfig({ ANN_USER_AGENT: "" }).userAgent).toBe(DEFAULT_USER_AGENT);
      expect(loadConfig({ ANN_USER_AGENT: "   " }).userAgent).toBe(DEFAULT_USER_AGENT);
    });

    it("rejects an unknown log level and keeps the default", () => {
      const capture = captureStderr();
      try {
        expect(loadConfig({ ANN_LOG_LEVEL: "verbose" }).logLevel).toBe(DEFAULTS.logLevel);
      } finally {
        capture.restore();
      }
    });

    it("accepts every valid log level", () => {
      for (const level of ["silent", "error", "info", "debug"] as const) {
        expect(loadConfig({ ANN_LOG_LEVEL: level }).logLevel).toBe(level);
      }
    });

    it("stays silent when every value is valid", () => {
      const capture = captureStderr();
      let output: string;
      try {
        loadConfig({ ANN_TIMEOUT_MS: "3000", ANN_LOG_LEVEL: "info" });
        output = capture.lines();
      } finally {
        capture.restore();
      }
      expect(output).toBe("");
    });
  });
});

describe("DEFAULT_USER_AGENT", () => {
  it("identifies the client by name, version and url", () => {
    expect(DEFAULT_USER_AGENT).toBe(`mcp-animenewsnetwork v${PKG_VERSION} (${REPO_URL})`);
  });

  // The constant the code reads and the version a release publishes live in
  // separate files, so one can be raised without the other. What the server
  // then reports about itself, and what it tells Anime News Network in the
  // User-Agent, is the number of some earlier build.
  it("carries the version the package publishes", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(PKG_VERSION).toBe(manifest.version);
  });
});

describe("createLogger", () => {
  let capture: ReturnType<typeof captureStderr>;

  beforeEach(() => {
    capture = captureStderr();
  });

  afterEach(() => {
    capture.restore();
  });

  it("writes nothing at all when silent", () => {
    const logger = createLogger("silent");
    logger.error("should-not-appear");
    logger.info("should-not-appear");
    logger.debug("should-not-appear");
    expect(capture.lines()).toBe("");
  });

  it("writes to stderr at debug level", () => {
    createLogger("debug").debug("hello-from-debug");
    expect(capture.lines()).toContain("hello-from-debug");
  });

  it("keeps a debug message out of an error-level logger", () => {
    const logger = createLogger("error");
    logger.debug("hello-from-debug");
    logger.error("hello-from-error");
    expect(capture.lines()).not.toContain("hello-from-debug");
    expect(capture.lines()).toContain("hello-from-error");
  });

  it("never writes to stdout, which carries the MCP protocol", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const logger = createLogger("debug");
      logger.error("x");
      logger.info("x");
      logger.debug("x");
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});
