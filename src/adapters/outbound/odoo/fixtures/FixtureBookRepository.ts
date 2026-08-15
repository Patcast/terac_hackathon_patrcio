import type { AccountingRepository } from "../../../../application/ports/driven/AccountingRepository.js";
import type { ClientId } from "../../../../domain/model/Ids.js";
import type { Month } from "../../../../domain/model/Month.js";
import type { MonthlyBook } from "../../../../domain/model/MonthlyBook.js";
import { demoBook } from "./demoBook.js";

/**
 * The `USE_FIXTURES` half of the composition root — the highest-value line in
 * that file (docs §12).
 *
 * Odoo's external API varies by version and between Online and self-hosted
 * (docs §4), and the failure that costs the demo is the one discovered on the
 * day. This is the same port, satisfied without a network, without credentials
 * and without a clock: every one of the seven beats in
 * docs/imessage_flow_phase1.md runs off it.
 *
 * It answers for *any* month, because a fixture that only covers the month it
 * was captured from dies the moment someone asks about June — and the script's
 * closing offer is to pull June and May.
 */
export class FixtureBookRepository implements AccountingRepository {
  private readonly books = new Map<string, MonthlyBook>();

  constructor(private readonly settlingDays = 10) {}

  async getMonthlyBook(clientId: ClientId, month: Month): Promise<MonthlyBook> {
    const key = `${clientId.value}:${month.key()}`;
    const cached = this.books.get(key);
    if (cached) return cached;

    // Built once per key so repeated questions get the identical object, which
    // is what makes the offline demo behave like the cached live path.
    const book = demoBook(month, clientId, this.settlingDays);
    this.books.set(key, book);
    return book;
  }
}
