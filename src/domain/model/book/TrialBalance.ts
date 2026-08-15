import { AccountRef } from "../Ids.js";
import { AccountType, isExpense } from "../AccountTypes.js";
import { Currency, Money } from "../Money.js";

export interface TrialBalanceLine {
  account: AccountRef;
  accountType: AccountType;
  movement: Money;
}

/**
 * The general ledger at account granularity — month *movement*, not a balance
 * (docs/architecture_phase1.md §4). It is what turns "expenses were up" into
 * "rent and contractors were up".
 */
export class TrialBalance {
  constructor(
    readonly lines: readonly TrialBalanceLine[],
    readonly currency: Currency,
  ) {}

  /** Where the money went, biggest first — the follow-up to every bad month. */
  largestExpenses(n: number): TrialBalanceLine[] {
    return this.lines
      .filter((line) => isExpense(line.accountType))
      .sort((a, b) => b.movement.compareTo(a.movement))
      .slice(0, Math.max(0, n));
  }

  /** Every movement summed. A balanced month lands on zero; a drift is a signal. */
  total(): Money {
    return Money.sum(
      this.lines.map((line) => line.movement),
      this.currency,
    );
  }

  find(accountId: string): TrialBalanceLine | null {
    return this.lines.find((line) => line.account.id === accountId) ?? null;
  }
}
