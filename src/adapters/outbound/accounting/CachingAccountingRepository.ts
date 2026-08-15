import type { AccountingRepository } from "../../../application/ports/driven/AccountingRepository.js";
import type { Clock } from "../../../application/ports/driven/Clock.js";
import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import type { MonthlyBook } from "../../../domain/model/MonthlyBook.js";

export interface BookStore {
  get(key: string): MonthlyBook | null;
  set(key: string, book: MonthlyBook, opts?: { ttlMs: number }): void;
}

/**
 * Twelve books a year per client, tens of KB each, so there is nothing to evict
 * and therefore no eviction policy to get wrong (docs/architecture_phase1.md §11).
 */
export class InMemoryStore implements BookStore {
  private readonly entries = new Map<string, { book: MonthlyBook; expiresAt: number | null }>();

  constructor(private readonly clock: Clock = { now: () => new Date() }) {}

  get(key: string): MonthlyBook | null {
    const entry = this.entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.clock.now().getTime()) {
      this.entries.delete(key);
      return null;
    }
    return entry.book;
  }

  set(key: string, book: MonthlyBook, opts?: { ttlMs: number }): void {
    const expiresAt = opts === undefined ? null : this.clock.now().getTime() + opts.ttlMs;
    this.entries.set(key, { book, expiresAt });
  }

  size(): number {
    return this.entries.size;
  }
}

/** Long enough that a demo's follow-up questions hit, short enough that a re-post shows up. */
const UNSETTLED_TTL_MS = 5 * 60_000;

/**
 * Skips all fifteen Odoo queries for a month already assembled
 * (docs/architecture_phase1.md §11).
 *
 * Together with the prompt-prefix cache this is what makes the second question
 * about a month cost no Odoo calls and a fraction of the tokens — the first
 * answer takes four seconds and every follow-up takes one.
 *
 * The cache-forever rule needs both conditions: a **settled** month is immutable,
 * and a book with gaps would otherwise pin a transient failure in memory for the
 * life of the process.
 *
 * > ⚠️ Report 6 spans twelve months, so caching a settled month forever is a
 * > claim about the whole trailing window, not just the month. A backdated entry
 * > posted into May changes the trailing series inside July's book without
 * > touching July, and this cache will not notice. The cheap guard is one
 * > `search_count` on `account.move` where `write_date > book.assembledAt`;
 * > Phase 1 does not do it and accepts the stale book knowingly. This is
 * > strictly more exposure than the quarterly design had.
 */
export class CachingAccountingRepository implements AccountingRepository {
  constructor(
    private readonly inner: AccountingRepository,
    private readonly store: BookStore,
    private readonly clock: Clock,
    private readonly settlingDays: number,
    private readonly unsettledTtlMs: number = UNSETTLED_TTL_MS,
  ) {}

  async getMonthlyBook(clientId: ClientId, month: Month): Promise<MonthlyBook> {
    // `key()` rather than `label()`: "2026-07" is locale-proof, and the label is not.
    const key = `${clientId.value}:${month.key()}`;

    const cached = this.store.get(key);
    if (cached !== null) return cached;

    const book = await this.inner.getMonthlyBook(clientId, month);

    if (month.isSettled(this.clock.now(), this.settlingDays) && book.gaps.length === 0) {
      this.store.set(key, book);
    } else {
      this.store.set(key, book, { ttlMs: this.unsettledTtlMs });
    }
    return book;
  }
}
