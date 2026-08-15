import { describe, expect, it } from "vitest";

import {
  CachingAccountingRepository,
  InMemoryStore,
} from "../../../src/adapters/outbound/accounting/CachingAccountingRepository.js";
import type { AccountingRepository } from "../../../src/application/ports/driven/AccountingRepository.js";
import { BookGap } from "../../../src/domain/model/BookGap.js";
import { Tier } from "../../../src/domain/model/BookPart.js";
import type { ClientId } from "../../../src/domain/model/Ids.js";
import type { Month } from "../../../src/domain/model/Month.js";
import type { MonthlyBook } from "../../../src/domain/model/MonthlyBook.js";
import { ACME, JULY_2026, StubClock, buildBook } from "../../support/books.js";

class CountingRepository implements AccountingRepository {
  calls = 0;

  constructor(private readonly book: MonthlyBook) {}

  async getMonthlyBook(_clientId: ClientId, _month: Month): Promise<MonthlyBook> {
    this.calls += 1;
    return this.book;
  }
}

const FIVE_MINUTES = 5 * 60_000;

describe("CachingAccountingRepository", () => {
  it("serves a settled, gapless month from the store forever", async () => {
    const clock = new StubClock(); // 15 Aug 2026 — July settled on the 10th
    const inner = new CountingRepository(buildBook());
    const repo = new CachingAccountingRepository(inner, new InMemoryStore(clock), clock, 10);

    await repo.getMonthlyBook(ACME, JULY_2026);
    await repo.getMonthlyBook(ACME, JULY_2026);
    clock.advance(FIVE_MINUTES * 100);
    await repo.getMonthlyBook(ACME, JULY_2026);

    expect(inner.calls).toBe(1);
  });

  it("re-fetches an unsettled month once the short TTL lapses", async () => {
    // A 20-day settling window means July is still moving on 15 Aug.
    const clock = new StubClock();
    const inner = new CountingRepository(buildBook({ settlingDays: 20 }));
    const repo = new CachingAccountingRepository(inner, new InMemoryStore(clock), clock, 20);

    await repo.getMonthlyBook(ACME, JULY_2026);
    await repo.getMonthlyBook(ACME, JULY_2026);
    expect(inner.calls).toBe(1);

    clock.advance(FIVE_MINUTES + 1);
    await repo.getMonthlyBook(ACME, JULY_2026);

    expect(inner.calls).toBe(2);
  });

  it("never caches a book with gaps forever, settled or not", async () => {
    const clock = new StubClock();
    const gap = BookGap.from("tax", Tier.Standard, new Error("timed out"));
    const inner = new CountingRepository(buildBook({ gaps: [gap] }));
    const repo = new CachingAccountingRepository(inner, new InMemoryStore(clock), clock, 10);

    await repo.getMonthlyBook(ACME, JULY_2026);
    clock.advance(FIVE_MINUTES + 1);
    await repo.getMonthlyBook(ACME, JULY_2026);

    // A transient Odoo failure must not pin itself in memory for the process's life.
    expect(inner.calls).toBe(2);
  });

  it("keys by client and month, so two clients never share a book", async () => {
    const clock = new StubClock();
    const inner = new CountingRepository(buildBook());
    const store = new InMemoryStore(clock);
    const repo = new CachingAccountingRepository(inner, store, clock, 10);

    await repo.getMonthlyBook(ACME, JULY_2026);
    await repo.getMonthlyBook(ACME, JULY_2026.previous());

    expect(inner.calls).toBe(2);
    expect(store.size()).toBe(2);
  });
});
