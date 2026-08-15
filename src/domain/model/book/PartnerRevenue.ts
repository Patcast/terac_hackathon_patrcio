import { PartyRef } from "../Ids.js";
import { Currency, Money } from "../Money.js";

export interface PartyRevenue {
  party: PartyRef;
  revenue: Money;
}

/**
 * Revenue by customer for the month — top accounts, and how much of the month
 * rests on one of them.
 */
export class PartnerRevenue {
  constructor(
    readonly parties: readonly PartyRevenue[],
    readonly currency: Currency,
  ) {}

  total(): Money {
    return Money.sum(
      this.parties.map((entry) => entry.revenue),
      this.currency,
    );
  }

  top(n: number): PartyRevenue[] {
    return [...this.parties]
      .sort((a, b) => b.revenue.compareTo(a.revenue))
      .slice(0, Math.max(0, n));
  }

  /**
   * The biggest customer and their share as a fraction — "40% of July was one
   * client" is a risk sentence, and it needs the name attached to be one.
   */
  concentration(): { party: PartyRef; share: number } | null {
    const total = this.total();
    if (total.isZero()) return null;

    const largest = this.top(1)[0];
    if (largest === undefined) return null;
    return { party: largest.party, share: largest.revenue.dividedBy(total) };
  }
}
