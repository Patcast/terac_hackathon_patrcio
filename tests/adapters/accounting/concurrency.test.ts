import { describe, expect, it, vi } from "vitest";

import {
  TimeoutError,
  mapWithConcurrency,
  withTimeout,
} from "../../../src/adapters/outbound/accounting/concurrency.js";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1];
    const results = await mapWithConcurrency(delays, 4, async (ms, index) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return index;
    });

    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("never exceeds the limit, and still runs everything", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_value, index) => index);

    const results = await mapWithConcurrency(items, 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return item * 2;
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(results).toHaveLength(12);
    expect(results[11]).toBe(22);
  });

  it("handles an empty list without spawning a runner", async () => {
    const worker = vi.fn();
    expect(await mapWithConcurrency([], 6, worker)).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});

describe("withTimeout", () => {
  it("passes a value through untouched", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects with TimeoutError when the work overruns", async () => {
    const hang = new Promise<string>(() => {});
    await expect(withTimeout(hang, 10)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("clears the timer on success, so nothing keeps the loop alive", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const before = clear.mock.calls.length;

    await withTimeout(Promise.resolve(1), 10_000);

    expect(clear.mock.calls.length).toBeGreaterThan(before);
    clear.mockRestore();
  });

  it("clears the timer when the work rejects too", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const before = clear.mock.calls.length;

    await expect(withTimeout(Promise.reject(new Error("nope")), 10_000)).rejects.toThrow("nope");

    expect(clear.mock.calls.length).toBeGreaterThan(before);
    clear.mockRestore();
  });
});
