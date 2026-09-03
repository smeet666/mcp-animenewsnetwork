/**
 * The in-memory cache, on the paths that decide what it forgets.
 *
 * Two rules govern it, and each can silently stop holding. A stale entry served
 * past its lifetime answers a question about the encyclopedia as it was, and an
 * entry evicted while a fresher one stays sends the next question to the site
 * for no gain. Neither shows up in an answer, so both are stated here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlLruCache } from "../../src/ann/cache.js";

const HOUR_MS = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("what the cache holds", () => {
  it("answers with the value it was given", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");

    expect(cache.get("a")).toBe("first");
  });

  it("answers a key it never held with nothing", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);

    expect(cache.get("absent")).toBeUndefined();
  });

  it("replaces a key written twice, holding it once", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");
    cache.set("a", "second");

    expect(cache.get("a")).toBe("second");
    expect(cache.size).toBe(1);
  });

  it("forgets everything when told to", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("the lifetime of an entry", () => {
  it("serves it up to the last moment of its lifetime", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");
    vi.advanceTimersByTime(HOUR_MS - 1);

    expect(cache.get("a")).toBe("first");
  });

  it("forgets it once the lifetime is spent", () => {
    // The boundary is the moment itself: an entry served at its expiry answers
    // a question about the encyclopedia as it was.
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");
    vi.advanceTimersByTime(HOUR_MS);

    expect(cache.get("a")).toBeUndefined();
  });

  it("drops the expired entry rather than keeping it to answer nothing", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");
    vi.advanceTimersByTime(HOUR_MS);
    cache.get("a");

    expect(cache.size).toBe(0);
  });

  it("gives a value written later its own full lifetime", () => {
    const cache = new TtlLruCache<string>(10, HOUR_MS);
    cache.set("a", "first");
    vi.advanceTimersByTime(HOUR_MS / 2);
    cache.set("a", "second");
    vi.advanceTimersByTime(HOUR_MS / 2 + 1);

    expect(cache.get("a")).toBe("second");
  });
});

describe("which entry goes when the cache is full", () => {
  it("drops the one read longest ago", () => {
    const cache = new TtlLruCache<string>(2, HOUR_MS);
    cache.set("a", "first");
    cache.set("b", "second");
    cache.set("c", "third");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("second");
    expect(cache.get("c")).toBe("third");
  });

  it("counts a read as a use, so a key asked for again outlives a newer one", () => {
    // Re-inserting on a hit is what makes the first key the least recently used
    // one, and it is the whole of the eviction order.
    const cache = new TtlLruCache<string>(2, HOUR_MS);
    cache.set("a", "first");
    cache.set("b", "second");
    cache.get("a");
    cache.set("c", "third");

    expect(cache.get("a")).toBe("first");
    expect(cache.get("b")).toBeUndefined();
  });

  it("holds no more than it was told to", () => {
    const cache = new TtlLruCache<string>(3, HOUR_MS);
    for (const key of ["a", "b", "c", "d", "e"]) {
      cache.set(key, key);
    }

    expect(cache.size).toBe(3);
  });
});

describe("a cache configured to hold nothing", () => {
  it("holds nothing when it is allowed no entries", () => {
    const cache = new TtlLruCache<string>(0, HOUR_MS);
    cache.set("a", "first");

    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it("holds nothing when an entry is given no lifetime", () => {
    const cache = new TtlLruCache<string>(10, 0);
    cache.set("a", "first");

    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });
});
