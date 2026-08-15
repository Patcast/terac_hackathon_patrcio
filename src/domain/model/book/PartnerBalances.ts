import { PartyRef } from "../Ids.js";
import { Currency, Money } from "../Money.js";

export interface PartyBalance {
  party: PartyRef;
  balance: Money;
}

/**
 * Who owes what, in both directions, at month end.
 *
 * Overlaps `openReceivables` on purpose: that ledger is documents, this is the
 * GL's own partner balances. When the two disagree the books need attention,
 * which is itself worth knowing.
 */
export class PartnerBalances {
  constructor(
    readonly receivable: readonly PartyBalance[],
    readonly payable: readonly PartyBalance[],
    readonly currency: Currency,
  ) {}

  totalReceivable(): Money {
    return this.sum(this.receivable);
  }

  totalPayable(): Money {
    return this.sum(this.payable);
  }

  /**
   * Largest single receivable as a fraction of everything owed to the client —
   * the concentration risk behind "what should worry me".
   *
   * Null when nothing is open, because 0/0 is not "no risk", it is "no answer".
   */
  concentration(): number | null {
    const total = this.totalReceivable();
    if (total.isZero()) return null;

    const largest = this.receivable.reduce<Money | null>(
      (biggest, entry) =>
        biggest === null || entry.balance.compareTo(biggest) > 0 ? entry.balance : biggest,
      null,
    );
    return largest === null ? null : largest.dividedBy(total);
  }

  private sum(entries: readonly PartyBalance[]): Money {
    return Money.sum(
      entries.map((entry) => entry.balance),
      this.currency,
    );
  }
}
