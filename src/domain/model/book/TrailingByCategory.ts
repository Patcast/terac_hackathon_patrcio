import type { AccountType } from "../AccountTypes.js";
import { isExpense, isIncome } from "../AccountTypes.js";
import type { AccountRef } from "../Ids.js";
import { Month } from "../Month.js";
import { Currency, Money } from "../Money.js";

export interface CategoryMonth {
  month: Month;
  amount: Money;
}

/**
 * One account's month-by-month history across the trailing window, zero-filled.
 *
 * Zero-filled on purpose: a month with no rows is a month where nothing was
 * spent, and dropping it would make a quarterly bill look like a monthly one by
 * shortening its own series.
 */
export class CategorySeries {
  constructor(
    readonly account: AccountRef,
    readonly accountType: AccountType,
    readonly anchor: Month,
    readonly months: readonly CategoryMonth[],
    readonly currency: Currency,
  ) {}

  at(month: Month): Money | null {
    return this.months.find((entry) => entry.month.equals(month))?.amount ?? null;
  }

  /** The anchor month's figure — the one the question is usually about. */
  latest(): Money {
    return this.at(this.anchor) ?? Money.zero(this.currency);
  }

  total(): Money {
    return Money.sum(
      this.months.map((entry) => entry.amount),
      this.currency,
    );
  }

  /** Mean over the `n` months ending at the anchor. Null when we hold fewer. */
  average(n: number): Money | null {
    return mean(this.upTo(this.anchor), n, this.currency);
  }

  /**
   * Mean over the `n` months ending *before* the anchor — the honest baseline to
   * put a spike against, since including the spike in its own average is how a
   * one-off gets talked into looking normal.
   */
  averageBefore(n: number): Money | null {
    return mean(this.upTo(this.anchor.previous()), n, this.currency);
  }

  /**
   * How many of the trailing months this account moved at all.
   *
   * **This is what tells an annual premium apart from a payroll run** — the
   * failure mode of monthly reporting (docs/architecture_phase1.md §4). An
   * insurance bill booked whole into July shows 1 of 13; rent shows 13 of 13.
   * The same figure means opposite things in those two cases, and nothing else
   * in the book distinguishes them.
   */
  monthsWithActivity(): number {
    return this.months.filter((entry) => !entry.amount.isZero()).length;
  }

  /**
   * Consecutive month-on-month increases ending at the anchor.
   *
   * 3 means "has risen three months running" — the only grounded way to say
   * that sentence, which both beat 1's watch-item and beat 3's trend line need.
   */
  risingStreak(): number {
    const series = this.upTo(this.anchor);
    let streak = 0;
    for (let i = series.length - 1; i > 0; i -= 1) {
      const current = series[i];
      const previous = series[i - 1];
      if (!current || !previous || current.amount.compareTo(previous.amount) <= 0) break;
      streak += 1;
    }
    return streak;
  }

  /** Oldest first, up to and including `end`. */
  private upTo(end: Month): CategoryMonth[] {
    return [...this.months]
      .sort((a, b) => a.month.compareTo(b.month))
      .filter((entry) => entry.month.compareTo(end) <= 0);
  }
}

/**
 * Report 16 — the trailing window broken down by account, not just by account
 * type (docs/architecture_phase1.md §4).
 *
 * Report 6 answers "were expenses higher in July"; this answers "was *this cost*
 * higher in July", which is the question an owner actually asks. Without it, a
 * month's biggest cost can only be stated, never compared — and a bare monthly
 * cost figure invites the wrong reaction, while the same figure against its own
 * twelve-month average is a finding.
 *
 * Capped to the accounts that carry the money, because the tail of a chart of
 * accounts is a hundred lines that never move.
 */
export class TrailingByCategory {
  constructor(
    readonly anchor: Month,
    readonly categories: readonly CategorySeries[],
    readonly currency: Currency,
  ) {}

  find(accountId: string): CategorySeries | null {
    return this.categories.find((series) => series.account.id === accountId) ?? null;
  }

  /** The `n` accounts carrying the most money over the window, largest first. */
  top(n: number): CategorySeries[] {
    return [...this.categories]
      .sort((a, b) => b.total().abs().compareTo(a.total().abs()))
      .slice(0, Math.max(0, n));
  }

  expenses(): CategorySeries[] {
    return this.categories.filter((series) => isExpense(series.accountType));
  }

  income(): CategorySeries[] {
    return this.categories.filter((series) => isIncome(series.accountType));
  }

  /**
   * Accounts whose anchor-month figure is at least `factor`× their prior
   * average *and* big enough to matter — the candidates for "what's unusual",
   * grounded in each line's own series rather than in a sense of a big number.
   *
   * The materiality floor is what keeps this useful. A lumpy €1,100 travel
   * month is easily 3× the average of a line that is zero most months, and
   * saying so out loud spends the owner's attention on nothing. `minShare` of
   * the month's total expenses is the cheapest honest filter; 2% is a starting
   * point, not a law.
   *
   * A line with no prior spend is not a spike either — it is a one-off, which
   * `monthsWithActivity` says better and without implying a trend broke.
   */
  spikes(factor = 2, over = 6, minShare = 0.02): CategorySeries[] {
    const monthTotal = Money.sum(
      this.expenses().map((series) => series.latest()),
      this.currency,
    );

    return this.expenses().filter((series) => {
      const baseline = series.averageBefore(over);
      if (baseline === null || baseline.isZero()) return false;
      if (!monthTotal.isZero() && series.latest().dividedBy(monthTotal) < minShare) return false;
      return series.latest().dividedBy(baseline) >= factor;
    });
  }

  size(): number {
    return this.categories.length;
  }
}

function mean(entries: CategoryMonth[], n: number, currency: Currency): Money | null {
  if (!Number.isInteger(n) || n < 1 || entries.length < n) return null;
  const window = entries.slice(entries.length - n);
  return Money.sum(
    window.map((entry) => entry.amount),
    currency,
  ).times(1 / n);
}
