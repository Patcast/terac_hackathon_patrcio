import { Currency, Money } from "../Money.js";

export interface CashFlowWeek {
  weekStarting: Date;
  journal: string;
  inflow: Money;
  outflow: Money;
}

export interface CashLine {
  date: Date;
  label: string;
  journal: string;
  amount: Money;
}

/**
 * Money actually in and out, weekly, plus the individual lines big enough to
 * explain a week on their own.
 *
 * Distinct from `CashPosition` the way flow is distinct from stock: this says
 * what moved during the month, not what was left at the end of it. Both
 * `inflow` and `outflow` are positive; `net()` is the subtraction.
 */
export class CashMovements {
  constructor(
    readonly weeks: readonly CashFlowWeek[],
    readonly largestLines: readonly CashLine[],
    readonly currency: Currency,
  ) {}

  totalIn(): Money {
    return Money.sum(
      this.weeks.map((week) => week.inflow),
      this.currency,
    );
  }

  totalOut(): Money {
    return Money.sum(
      this.weeks.map((week) => week.outflow),
      this.currency,
    );
  }

  net(): Money {
    return this.totalIn().minus(this.totalOut());
  }
}
