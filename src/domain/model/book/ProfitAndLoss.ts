import { AccountType, isCostOfSales, isExpense, isIncome } from "../AccountTypes.js";
import { Currency, Money } from "../Money.js";

export interface AccountTypeTotal {
  accountType: AccountType;
  amount: Money;
}

/**
 * The headline: revenue, cost of sales, expenses, net — for one month.
 *
 * **Signs are already right when they get here.** Odoo stores credits negative,
 * so income accounts arrive from the API with a negative balance; `OdooMapper`
 * flips that once, at the boundary (docs/architecture_phase1.md §4). By the time
 * a `Money` reaches this class, revenue and expenses are *both positive* and
 * `net() = revenue - expenses`. Nothing downstream should negate anything —
 * a re-flip here shows a business losing money on every sale.
 */
export class ProfitAndLoss {
  constructor(
    readonly byType: readonly AccountTypeTotal[],
    readonly currency: Currency,
  ) {}

  revenue(): Money {
    return this.sumWhere(isIncome);
  }

  /** A subset of `expenses()`, not a sibling of it — don't add the two. */
  costOfSales(): Money {
    return this.sumWhere(isCostOfSales);
  }

  expenses(): Money {
    return this.sumWhere(isExpense);
  }

  net(): Money {
    return this.revenue().minus(this.expenses());
  }

  /** A fraction: 0.62 is 62%. Null when there is no revenue to divide by. */
  grossMargin(): number | null {
    const revenue = this.revenue();
    if (revenue.isZero()) return null;
    return revenue.minus(this.costOfSales()).dividedBy(revenue);
  }

  private sumWhere(matches: (type: AccountType) => boolean): Money {
    return Money.sum(
      this.byType.filter((total) => matches(total.accountType)).map((total) => total.amount),
      this.currency,
    );
  }
}
