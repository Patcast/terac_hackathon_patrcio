import { CostSignal, CostSignalKind } from "../model/CostSignal.js";
import { Money } from "../model/Money.js";
import { MonthlyBook } from "../model/MonthlyBook.js";
import { WatchItem } from "../model/WatchItem.js";
import type { CategorySeries } from "../model/book/TrailingByCategory.js";
import { AgingAnalyzer } from "./AgingAnalyzer.js";

/**
 * The thresholds that turn a number into a claim.
 *
 * They are constructor options rather than constants because they are product
 * judgements, not arithmetic: "how concentrated is too concentrated" is a thing
 * a CFO would argue about, and a test that has to fake a 41% customer to
 * exercise the concentration branch is testing the fixture, not the rule.
 */
export interface HighlightThresholds {
  /** A customer at or above this share of revenue is worth naming. */
  concentrationShare: number;
  /** Days past due that count as "out" — a bucket boundary, see `Aging.over`. */
  overdueDays: number;
  /** Overdue money below this share of total receivables isn't the month's story. */
  overdueShare: number;
  /** Consecutive rises that justify saying "three months running". */
  risingMonths: number;
  /** This month over its own prior average, at or above which it is a spike. */
  spikeFactor: number;
  /** Months of history the spike baseline is averaged over. */
  baselineMonths: number;
  /** At or below this many active months in the window, a cost is a one-off. */
  oneOffMonths: number;
}

export const DEFAULT_THRESHOLDS: HighlightThresholds = {
  concentrationShare: 0.3,
  overdueDays: 60,
  overdueShare: 0.15,
  risingMonths: 3,
  spikeFactor: 1.5,
  baselineMonths: 6,
  oneOffMonths: 2,
};

/**
 * Picks what a month's books are actually *saying* — the one watch item and the
 * handful of cost lines that are not behaving normally.
 *
 * This is business logic, so it lives in `domain/` and it is pure: a book in,
 * value objects out, no clock, no I/O (docs/architecture_phase1.md §5). Both the
 * iMessage close-out and the web brief are surfaces over the same selection, so
 * the two can never disagree about which risk mattered — which they would within
 * a week if each computed its own.
 *
 * Every branch here is one of the grounded shapes named in
 * docs/imessage_flow_phase1.md beat 1. There is no fallback that invents a
 * worry: when nothing clears a threshold the answer is `WatchItem.nothing()`.
 */
export class HighlightSelector {
  constructor(
    /**
     * Public so a caller that reports the same figure separately — the brief's
     * receivables block states "€X is 60+ days out" — reads the boundary off the
     * selector instead of hard-coding a second 60 that can drift from this one.
     */
    readonly thresholds: HighlightThresholds = DEFAULT_THRESHOLDS,
    private readonly aging = new AgingAnalyzer(),
  ) {}

  /**
   * The single most notable thing, in the doc's order of preference:
   * concentration, then overdue receivables, then a rising cost.
   *
   * First match wins rather than best-score wins, because the order encodes what
   * a CFO would lead with, and a scoring function would need units that compare
   * "41% of revenue" against "€18,400 is late" — a comparison with no meaning.
   */
  watchItem(book: MonthlyBook): WatchItem {
    return (
      this.concentration(book) ?? this.overdue(book) ?? this.rising(book) ?? WatchItem.nothing()
    );
  }

  /**
   * The month's cost lines worth printing: the largest one always, then any
   * others that are misbehaving, capped at `limit`.
   *
   * The largest is unconditional because "what was my biggest cost" is the
   * question owners actually ask (beat 2), and it is a useful answer even when
   * the honest verdict on it is "in line".
   *
   * Four rather than three by default, and the extra row is worth the space: a
   * one-off is usually a small line (an annual premium next to payroll), so a
   * tighter cap prints the two alarming rows and drops the reassuring one — the
   * opposite of what the trailing series was added to do.
   */
  costSignals(book: MonthlyBook, limit = 4): CostSignal[] {
    const trailing = book.trailingByCategory;
    if (trailing === null) return [];

    const expenses = trailing
      .expenses()
      .map((series) => this.signal(series, book))
      .filter((signal) => signal.amount.isPositive())
      .sort((a, b) => b.amount.compareTo(a.amount));

    const largest = expenses[0];
    if (largest === undefined) return [];

    // Notable lines after the largest, biggest first — `expenses` is already
    // sorted, so this preserves size order within the notable ones.
    const notable = expenses.slice(1).filter((signal) => signal.isNotable());
    return [largest, ...notable].slice(0, Math.max(1, limit));
  }

  /** One account's month against its own history. */
  private signal(series: CategorySeries, book: MonthlyBook): CostSignal {
    const { baselineMonths, spikeFactor, risingMonths, oneOffMonths } = this.thresholds;

    const amount = series.latest();
    const baseline = series.averageBefore(baselineMonths);
    const active = series.monthsWithActivity();
    const streak = series.risingStreak();

    // Order matters. One-off is checked before spike because an annual premium
    // is *both* — it is 12× its average and it is not a problem, and calling it
    // a spike is the false alarm this whole class exists to avoid.
    let kind: CostSignalKind = CostSignalKind.InLine;
    if (active <= oneOffMonths && amount.isPositive()) kind = CostSignalKind.OneOff;
    else if (baseline !== null && !baseline.isZero() && amount.dividedBy(baseline) >= spikeFactor) {
      kind = CostSignalKind.Spike;
    } else if (streak >= risingMonths) kind = CostSignalKind.Rising;

    return new CostSignal(
      series.account,
      amount,
      baseline,
      kind,
      active,
      streak,
      this.shareOfExpenses(amount, book),
    );
  }

  private shareOfExpenses(amount: Money, book: MonthlyBook): number | null {
    const pnl = book.pnl;
    if (pnl === null) return null;
    const total = pnl.expenses();
    if (total.isZero()) return null;
    return amount.dividedBy(total);
  }

  private concentration(book: MonthlyBook): WatchItem | null {
    const revenue = book.partnerRevenue;
    if (revenue === null) return null;

    const largest = revenue.concentration();
    if (largest === null || largest.share < this.thresholds.concentrationShare) return null;

    const amount = revenue.top(1)[0]?.revenue;
    if (amount === undefined) return null;
    return WatchItem.concentration(largest.party.name, largest.share, amount);
  }

  private overdue(book: MonthlyBook): WatchItem | null {
    const receivables = book.openReceivables;
    if (receivables === null) return null;

    // As of month end, not today: the book describes a closed month, and ageing
    // it to now would report invoices as later than the month ever saw them.
    const aging = this.aging.analyze(receivables, book.asOf());
    const total = aging.total();
    const late = aging.over(this.thresholds.overdueDays);
    if (total.isZero() || !late.isPositive()) return null;
    if (late.dividedBy(total) < this.thresholds.overdueShare) return null;

    // Whose it is, by outstanding — the ledger is already sorted that way.
    const largest = receivables.byParty()[0];
    return WatchItem.overdueReceivables(late, late.dividedBy(total), largest?.party.name ?? "");
  }

  private rising(book: MonthlyBook): WatchItem | null {
    const trailing = book.trailingByCategory;
    if (trailing === null) return null;

    const climbing = trailing
      .expenses()
      .filter((series) => series.risingStreak() >= this.thresholds.risingMonths)
      .sort((a, b) => b.latest().compareTo(a.latest()));

    const worst = climbing[0];
    if (worst === undefined) return null;
    return WatchItem.risingCost(worst.account.name, worst.latest(), worst.risingStreak());
  }
}
