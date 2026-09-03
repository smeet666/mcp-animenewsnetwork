/**
 * The promises this client keeps whoever built it.
 *
 * The environment parser enforces both, and the client is published on its own
 * through the `./client` export, where a program hands it a configuration it
 * built itself. Anime News Network asks callers to identify themselves and to
 * stay under one request per second, so the two hold on that path as well.
 *
 * A caller naming their own application is welcome. Passing the traffic off as
 * a browser is a different thing, and gets the project's identity appended so
 * the request stays attributable to something a person can write to.
 */

import { describe, expect, it } from "vitest";
import { AnnClient } from "../../src/ann/client.js";
import { DEFAULT_USER_AGENT, MIN_ALLOWED_INTERVAL_MS, createLogger } from "../../src/config.js";
import { fixtureRouter, testConfig } from "./_helpers.js";

const logger = createLogger("silent");

/** The headers the client actually sent, read off the stubbed fetch. */
async function headersSentWith(userAgent: string): Promise<Headers> {
  let seen: Headers | undefined;
  const routed = fixtureRouter();
  const fetchImpl: typeof fetch = async (input, init) => {
    seen = new Headers(init?.headers);
    return await routed.impl(input, init);
  };
  const client = new AnnClient({
    config: testConfig({ userAgent }),
    logger,
    fetchImpl,
  });
  await client.getTitle("anime", 4241);

  if (!seen) {
    throw new Error("the client sent no request, so it sent no headers to read");
  }
  return seen;
}

describe("who the client says it is", () => {
  it("sends the identity a caller named for their own application", async () => {
    const headers = await headersSentWith("some-app/2.0 (+https://example.invalid/contact)");

    expect(headers.get("user-agent")).toBe("some-app/2.0 (+https://example.invalid/contact)");
  });

  it("appends its own identity to a name that reads as a browser", async () => {
    const headers = await headersSentWith(
      "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    );
    const sent = headers.get("user-agent") ?? "";

    expect(sent).toContain(DEFAULT_USER_AGENT);
    expect(sent).toContain("Mozilla/5.0");
  });

  it("reads the disguise whatever case it is written in", async () => {
    const headers = await headersSentWith("mozilla/5.0 (compatible)");

    expect(headers.get("user-agent")).toContain(DEFAULT_USER_AGENT);
  });
});

describe("what the client asks for", () => {
  it("asks for XML, which is what these endpoints answer with", async () => {
    const headers = await headersSentWith("some-app/1.0");

    expect(headers.get("accept")).toContain("xml");
  });
});

describe("the pacing floor a caller cannot go under", () => {
  it("holds when a configuration asks for a faster rate", async () => {
    // The floor is what the site asks for, so it stands whatever a program that
    // imported this client wrote in its own configuration.
    const client = new AnnClient({
      config: testConfig({ minIntervalMs: 0 }),
      logger,
      fetchImpl: fixtureRouter().impl,
    });

    const started = Date.now();
    await client.getTitle("anime", 4241);
    await client.getTitle("anime", 4242);

    expect(Date.now() - started).toBeGreaterThanOrEqual(MIN_ALLOWED_INTERVAL_MS - 50);
  });
});

describe("a client built with nothing at all", () => {
  it("reads its configuration from the environment and stands up", () => {
    // The published export is meant to be usable as `new AnnClient()`, so the
    // paths that fill in a configuration and a logger are the common ones.
    expect(() => new AnnClient()).not.toThrow();
  });
});
