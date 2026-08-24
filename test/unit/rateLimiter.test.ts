import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, sleep } from "../../src/ann/rateLimiter.js";

/**
 * The clock is pinned and moved by hand, so a gap is what the limiter asked for
 * rather than what the machine happened to take. Measured against the real
 * clock, a pacing test fails whenever the machine stalls, which says nothing
 * about the limiter.
 */
const INTERVAL = 60;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function expectPaced(gap: number, interval = INTERVAL): void {
  expect(gap, `requests were ${gap}ms apart, under the ${interval}ms floor`).toBeGreaterThanOrEqual(
    interval,
  );
}

describe("RateLimiter.schedule", () => {
  it("runs tasks in call order", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const order: number[] = [];

    const all = Promise.all(
      [1, 2, 3].map((n) =>
        limiter.schedule(async () => {
          await sleep(n === 1 ? 20 : 0);
          order.push(n);
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(100);
    await all;

    expect(order).toEqual([1, 2, 3]);
  });

  it("never runs two tasks at once", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    let running = 0;
    let overlapped = false;

    const all = Promise.all(
      [1, 2, 3].map(() =>
        limiter.schedule(async () => {
          running += 1;
          if (running > 1) {
            overlapped = true;
          }
          await sleep(5);
          running -= 1;
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(100);
    await all;

    expect(overlapped).toBe(false);
  });

  it("keeps draining the queue when a task rejects", async () => {
    // A failed request must not wedge every request that comes after it.
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const failed = limiter.schedule(async () => {
      throw new Error("boom");
    });

    await expect(failed).rejects.toThrow("boom");
    await expect(limiter.schedule(async () => "after")).resolves.toBe("after");
  });

  it("reports the rejection to the caller that queued it", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const results = await Promise.allSettled([
      limiter.schedule(async () => {
        throw new Error("first");
      }),
      limiter.schedule(async () => "second"),
    ]);

    expect(results[0]?.status).toBe("rejected");
    expect(results[1]).toMatchObject({ status: "fulfilled", value: "second" });
  });
});

describe("RateLimiter.beforeRequest", () => {
  it("paces consecutive requests", async () => {
    const limiter = new RateLimiter({ minIntervalMs: INTERVAL });
    const stamps: number[] = [];

    const all = Promise.all(
      [1, 2, 3].map(() =>
        limiter.schedule(async () => {
          await limiter.beforeRequest();
          stamps.push(Date.now());
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    await all;

    expectPaced((stamps[1] as number) - (stamps[0] as number));
    expectPaced((stamps[2] as number) - (stamps[1] as number));
  });

  it("paces every request inside one task, not just its first", async () => {
    // A retry chain sends several requests from a single slot. Pacing only the
    // first would let the retries themselves go out back to back.
    const limiter = new RateLimiter({ minIntervalMs: INTERVAL });
    const stamps: number[] = [];

    const run = limiter.schedule(async () => {
      for (const _ of [1, 2, 3]) {
        await limiter.beforeRequest();
        stamps.push(Date.now());
      }
    });
    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    await run;

    expectPaced((stamps[1] as number) - (stamps[0] as number));
    expectPaced((stamps[2] as number) - (stamps[1] as number));
  });

  it("paces the next task from the previous task's last request", async () => {
    // The regression this guards: stamping the slot once per task let a long
    // retry chain end, and the next request follow its final attempt with no
    // gap at all.
    const limiter = new RateLimiter({ minIntervalMs: INTERVAL });
    let lastOfChain = 0;
    let firstOfNext = 0;

    const chain = limiter.schedule(async () => {
      await limiter.beforeRequest();
      await limiter.beforeRequest();
      await limiter.beforeRequest();
      lastOfChain = Date.now();
    });
    const next = limiter.schedule(async () => {
      await limiter.beforeRequest();
      firstOfNext = Date.now();
    });
    await vi.advanceTimersByTimeAsync(INTERVAL * 8);
    await Promise.all([chain, next]);

    expectPaced(firstOfNext - lastOfChain);
  });

  it("does not wait at all when pacing is switched off", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const started = Date.now();

    for (const _ of [1, 2, 3, 4, 5]) {
      await limiter.beforeRequest();
    }

    expect(Date.now() - started).toBe(0);
  });

  it("does not delay the very first request", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 5_000 });
    const started = Date.now();

    await limiter.beforeRequest();

    expect(Date.now() - started).toBe(0);
  });
});

describe("RateLimiter.penalize and relax", () => {
  it("doubles the interval when the site pushes back", () => {
    const limiter = new RateLimiter({ minIntervalMs: 100 });
    limiter.penalize();
    expect(limiter.currentIntervalMs).toBe(200);
    limiter.penalize();
    expect(limiter.currentIntervalMs).toBe(400);
  });

  it("caps how far the interval can grow", () => {
    const limiter = new RateLimiter({ minIntervalMs: 100, maxIntervalMs: 500 });
    for (const _ of [1, 2, 3, 4, 5, 6]) {
      limiter.penalize();
    }
    expect(limiter.currentIntervalMs).toBe(500);
  });

  it("backs off from zero, so a disabled interval still slows down", () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    limiter.penalize();
    expect(limiter.currentIntervalMs).toBeGreaterThan(0);
  });

  it("decays back down as requests succeed", () => {
    const limiter = new RateLimiter({ minIntervalMs: 100 });
    limiter.penalize();
    limiter.penalize();
    const penalized = limiter.currentIntervalMs;

    limiter.relax();
    expect(limiter.currentIntervalMs).toBeLessThan(penalized);
  });

  it("never decays below the configured floor", () => {
    // The floor is what the site asks for. A run of successes must not talk the
    // client into going faster than that.
    const limiter = new RateLimiter({ minIntervalMs: 100 });
    limiter.penalize();
    for (const _ of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      limiter.relax();
    }
    expect(limiter.currentIntervalMs).toBe(100);
  });

  it("applies the raised interval to the next request", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 10 });
    limiter.penalize();
    limiter.penalize();
    const raised = limiter.currentIntervalMs;

    await limiter.beforeRequest();
    const started = Date.now();
    const next = limiter.beforeRequest();
    await vi.advanceTimersByTimeAsync(raised);
    await next;

    expectPaced(Date.now() - started, raised);
  });
});
