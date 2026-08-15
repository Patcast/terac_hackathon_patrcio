import { AccountRef } from "../Ids.js";
import { Currency, Money } from "../Money.js";

export interface AccountBalance {
  account: AccountRef;
  balance: Money;
}

/**
 * Bank balances at month end — the first number of the monthly close-out and
 * the numerator of every runway figure.
 *
 * Per account rather than one total, because "you have $180k" reads differently
 * once it's "$40k current, $140k in the savings account you were treating as
 * untouchable".
 */
export class CashPosition {
  constructor(
    readonly accounts: readonly AccountBalance[],
    readonly asOf: Date,
    readonly currency: Currency,
  ) {}

  total(): Money {
    return Money.sum(
      this.accounts.map((account) => account.balance),
      this.currency,
    );
  }
}
