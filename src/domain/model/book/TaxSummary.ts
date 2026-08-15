import { Currency, Money } from "../Money.js";

export interface TaxLine {
  name: string;
  kind: "sales" | "purchase";
  amount: Money;
}

/**
 * Tax **accrued in the month** — never a filing figure
 * (docs/architecture_phase1.md §4).
 *
 * A month is an accrual period, not usually a filing period: VAT is quarterly
 * across much of Europe and US sales tax varies by state and volume. So
 * `netPayable()` answers "what did July accrue", *not* "what do I owe the tax
 * office", and no caller may present it as the second. That is the kind of wrong
 * that costs a client money rather than face.
 */
export class TaxSummary {
  constructor(
    readonly lines: readonly TaxLine[],
    readonly currency: Currency,
  ) {}

  /** Tax charged on sales — collected on someone else's behalf. */
  charged(): Money {
    return this.sumWhere("sales");
  }

  /** Tax paid on purchases and recoverable against the above. */
  reclaimable(): Money {
    return this.sumWhere("purchase");
  }

  netPayable(): Money {
    return this.charged().minus(this.reclaimable());
  }

  private sumWhere(kind: TaxLine["kind"]): Money {
    return Money.sum(
      this.lines.filter((line) => line.kind === kind).map((line) => line.amount),
      this.currency,
    );
  }
}
