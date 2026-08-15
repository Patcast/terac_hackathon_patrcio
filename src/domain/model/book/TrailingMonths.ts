import { Month } from "../Month.js";
import { Currency, Money } from "../Money.js";

export interface MonthlyTotal {
  month: Month;
  revenue: Money;
  expenses: Money;
  net: Money;
}

/**
 * Twelve months of P&L totals, one row each — the most valuable object in the
 * book (docs/architecture_phase1.md §4).
 *
 * A single prior month is noise: one late invoice or a 28-day February moves it
 * more than the business did. A series answers month-over-month, same-month-last-
 * year, trend *and* burn from one `read_group`, and burn is what makes runway a
 * pure calculation over data we already hold instead of a new query.
 */
export class TrailingMonths {
  constructor(
    readonly anchor: Month,
    readonly months: readonly MonthlyTotal[],
    readonly currency: Currency,
  ) {}

  at(month: Month): MonthlyTotal | null {
    return this.months.find((total) => total.month.equals(month)) ?? null;
  }

  current(): MonthlyTotal | null {
    return this.at(this.anchor);
  }

  priorMonth(): MonthlyTotal | null {
    return this.at(this.anchor.previous());
  }

  sameMonthLastYear(): MonthlyTotal | null {
    return this.at(this.anchor.sameMonthLastYear());
  }

  /**
   * Mean net over the last `n` months ending at the anchor.
   *
   * Null rather than a smaller average when fewer than `n` months are held:
   * "your average over the last 3 months" said about two months of data is a
   * quietly wrong number, and quietly wrong is the failure mode this product
   * cannot afford.
   */
  averageNet(n: number): Money | null {
    const window = this.window(n);
    if (window === null) return null;
    return Money.sum(
      window.map((total) => total.net),
      this.currency,
    ).times(1 / n);
  }

  /**
   * Burn is a *positive* number describing money leaving — so this is the
   * negated average net, and only when that average is actually negative.
   *
   * Null covers both "profitable" and "not enough history", which is exactly
   * what `RunwayEstimator` needs: there is no honest runway figure in either
   * case. A break-even average is null too — dividing cash by zero burn is the
   * infinity that has no business being read out loud.
   */
  averageBurn(n: number): Money | null {
    const average = this.averageNet(n);
    if (average === null || !average.isNegative()) return null;
    return average.negated();
  }

  /** A fraction: 0.12 is +12%. Null when there is no prior month, or it was zero. */
  revenueDeltaVsPriorMonth(): number | null {
    return delta(this.current(), this.priorMonth());
  }

  revenueDeltaVsLastYear(): number | null {
    return delta(this.current(), this.sameMonthLastYear());
  }

  /**
   * Oldest first. Sorted here rather than trusted from the constructor because
   * the rows come out of a `read_group` whose ordering is Odoo's business, and
   * every consumer of a series assumes chronology.
   */
  series(): readonly MonthlyTotal[] {
    return [...this.months].sort((a, b) => a.month.compareTo(b.month));
  }

  /** The `n` months up to and including the anchor, or null if we hold fewer. */
  private window(n: number): MonthlyTotal[] | null {
    if (!Number.isInteger(n) || n < 1) return null;
    const upToAnchor = this.series().filter((total) => total.month.compareTo(this.anchor) <= 0);
    if (upToAnchor.length < n) return null;
    return upToAnchor.slice(upToAnchor.length - n);
  }
}

function delta(current: MonthlyTotal | null, baseline: MonthlyTotal | null): number | null {
  if (!current || !baseline || baseline.revenue.isZero()) return null;
  return current.revenue.minus(baseline.revenue).dividedBy(baseline.revenue);
}
