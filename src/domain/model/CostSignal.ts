import { AccountRef } from "./Ids.js";
import { Money } from "./Money.js";

/**
 * What the trailing series says about one month's figure for one account.
 *
 * `OneOff` exists because of the failure mode the architecture doc calls the
 * characteristic one of monthly reporting: an annual premium booked whole into
 * July makes July look broken, and in a quarterly view it would have averaged
 * out. Distinguishing it from `Spike` is the difference between a finding and a
 * false alarm (docs/architecture_phase1.md §4).
 */
export const CostSignalKind = {
  /** Well above its own trailing average, and it is a cost that recurs. */
  Spike: "spike",
  /** Barely appears in the window — an annual bill, not a new problem. */
  OneOff: "one_off",
  /** Up every month for three months or more. */
  Rising: "rising",
  /** Inside its normal range. Most rows are this, and saying so is the point. */
  InLine: "in_line",
} as const;

export type CostSignalKind = (typeof CostSignalKind)[keyof typeof CostSignalKind];

/**
 * One cost line, this month, next to what it usually is.
 *
 * The whole value of the object is the pairing: a bare monthly cost figure
 * invites the wrong reaction, and the same figure against its own twelve-month
 * average is a finding (docs/imessage_flow_phase1.md, beat 2). A `CostSignal`
 * with a null `baseline` is therefore a weaker claim by construction — there is
 * no comparison, and the surface rendering it must not imply one.
 */
export class CostSignal {
  constructor(
    readonly account: AccountRef,
    /** This month's movement on the account. */
    readonly amount: Money,
    /** Mean over the months *before* this one — null when history is short. */
    readonly baseline: Money | null,
    readonly kind: CostSignalKind,
    /** Of the trailing window, how many months this account moved at all. */
    readonly monthsWithActivity: number,
    /** Consecutive month-on-month increases ending at this month. */
    readonly risingMonths: number,
    /** This line as a fraction of the month's total expenses; null if unknown. */
    readonly shareOfExpenses: number | null,
  ) {}

  /** `2.04` — this month over its baseline. Null when there is nothing to divide by. */
  ratio(): number | null {
    if (this.baseline === null || this.baseline.isZero()) return null;
    return this.amount.dividedBy(this.baseline);
  }

  /** True for anything a reader should look at twice. */
  isNotable(): boolean {
    return this.kind !== CostSignalKind.InLine;
  }
}
