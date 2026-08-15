import { AccountType, isAsset, isEquity, isLiability } from "../AccountTypes.js";
import { Currency, Money } from "../Money.js";
import { AccountTypeTotal } from "./ProfitAndLoss.js";

/** The same row shape a P&L is made of — re-exported so a mapper building a
 *  balance sheet doesn't have to import from the P&L to name its own input. */
export type { AccountTypeTotal } from "./ProfitAndLoss.js";

/**
 * Position, not flow — cumulative to `asOf`, never a month's movement
 * (docs/architecture_phase1.md §4). The `asOf` field travels with the numbers
 * because a balance without its date is the plausible-looking wrong number.
 */
export class BalanceSheet {
  constructor(
    readonly byType: readonly AccountTypeTotal[],
    readonly asOf: Date,
    readonly currency: Currency,
  ) {}

  assets(): Money {
    return this.sumWhere(isAsset);
  }

  liabilities(): Money {
    return this.sumWhere(isLiability);
  }

  equity(): Money {
    return this.sumWhere(isEquity);
  }

  private sumWhere(matches: (type: AccountType) => boolean): Money {
    return Money.sum(
      this.byType.filter((total) => matches(total.accountType)).map((total) => total.amount),
      this.currency,
    );
  }
}
