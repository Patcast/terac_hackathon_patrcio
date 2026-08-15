/**
 * Two primitives the assembler needs and nothing else does. Deliberately
 * generic and free of any book vocabulary — they know about promises, not
 * ledgers.
 */

/** Raised when a unit of work outlives its budget. A timeout is a gap, not an outage. */
export class TimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Runs `worker` over every item with at most `limit` in flight, preserving
 * input order in the result.
 *
 * A fixed pool of runners pulling from a shared cursor, rather than chunking:
 * chunks make every batch wait for its slowest member, which for fifteen Odoo
 * calls of wildly different cost is most of the latency.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const queue = items.map((item, index) => ({ item, index }));
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runner = async (): Promise<void> => {
    for (;;) {
      // `undefined` here means the queue is drained, never a hole: `queue` is dense.
      const next = queue[cursor];
      if (next === undefined) return;
      cursor += 1;
      results[next.index] = await worker(next.item, next.index);
    }
  };

  const width = Math.max(1, Math.min(Math.floor(limit), queue.length));
  await Promise.all(Array.from({ length: width }, runner));
  return results;
}

/**
 * Rejects with `TimeoutError` if `work` hasn't settled within `ms`.
 *
 * The timer is cleared on both outcomes. Left dangling it keeps the event loop
 * alive for its full duration, which turns a fast CLI run into an eight-second
 * one for no visible reason.
 *
 * It cannot cancel the underlying work — nothing in a promise can — so a slow
 * report keeps running in the background. That is acceptable because the result
 * is discarded and the socket is the vendor client's to close.
 */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const alarm = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });

  return Promise.race([work, alarm]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
