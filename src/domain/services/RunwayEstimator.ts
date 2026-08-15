import { MonthlyBook } from "../model/MonthlyBook.js";
import { Runway } from "../model/Runway.js";

/**
 * Cash at month end ÷ the burn we have actually seen. No query, no forecast.
 *
 * Runway is in Phase 1 only because the monthly cadence made it free: report 6
 * already holds twelve months of net and report 9 holds cash, so this is a pure
 * function over data the book carries (docs/architecture_phase1.md §5).
 */
export class RunwayEstimator {
  estimate(book: MonthlyBook, over = 3): Runway | null {
    const trailing = book.trailing;
    const cash = book.cash;
    // Either part can be a gap — Standard and Required respectively — and a
    // runway figure invented from half the inputs is worse than no figure.
    if (trailing === null || cash === null) return null;

    // Null when the client is profitable or has fewer than `over` months of
    // history. Both are cases where there is no honest number to say out loud.
    const burn = trailing.averageBurn(over);
    if (burn === null || burn.isZero()) return null;

    // An overdrawn client would otherwise get "~-2.4 months of runway", which is
    // arithmetically honest and useless: past zero, the number to say is not a
    // duration. The reply falls back to stating cash and burn plainly.
    const cashAtMonthEnd = cash.total();
    if (!cashAtMonthEnd.isPositive()) return null;

    return Runway.of(cashAtMonthEnd.dividedBy(burn), book.month.endsOn(), over, burn);
  }
}
