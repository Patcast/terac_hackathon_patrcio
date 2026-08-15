import { Invoice } from "../model/Invoice.js";
import { InvoiceLedger } from "../model/InvoiceLedger.js";
import { Currency, Money } from "../model/Money.js";

export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null;
  amount: Money;
  invoices: readonly Invoice[];
}

/**
 * The bucket boundaries, in days overdue. `current` is everything not yet due;
 * the `90+` label follows the convention every accountant reads, though the
 * bucket actually starts at 91 because `61-90` is inclusive of 90.
 */
const BUCKETS: readonly { label: string; minDays: number; maxDays: number | null }[] = [
  { label: "current", minDays: 0, maxDays: 0 },
  { label: "1-30", minDays: 1, maxDays: 30 },
  { label: "31-60", minDays: 31, maxDays: 60 },
  { label: "61-90", minDays: 61, maxDays: 90 },
  { label: "90+", minDays: 91, maxDays: null },
];

export class Aging {
  constructor(
    readonly buckets: readonly AgingBucket[],
    readonly currency: Currency,
  ) {}

  total(): Money {
    return Money.sum(
      this.buckets.map((bucket) => bucket.amount),
      this.currency,
    );
  }

  /**
   * Everything aged past `days` — `over(60)` is the "$X is 60+ days out" line.
   *
   * Answered from bucket boundaries rather than by re-ageing the invoices,
   * because `Aging` deliberately doesn't carry the `asOf` it was built with.
   * So pass a boundary (30, 60, 90): `over(45)` returns the 61+ buckets, not
   * the 46-60 slice, and there is nothing here that could tell you otherwise.
   */
  over(days: number): Money {
    return Money.sum(
      this.buckets.filter((bucket) => bucket.minDays > days).map((bucket) => bucket.amount),
      this.currency,
    );
  }

  bucket(label: string): AgingBucket | null {
    return this.buckets.find((bucket) => bucket.label === label) ?? null;
  }
}

/**
 * Aging buckets are **derived, never queried** (docs/architecture_phase1.md §4).
 * Odoo can produce an aged partner balance, but re-deriving it from the open
 * documents we already hold is pure, instant, testable — and one fewer report to
 * lose to a timeout.
 *
 * `asOf` is passed in rather than read from a clock; for a monthly book it is
 * `month.endsOn()`, so the answer describes the month, not today.
 */
export class AgingAnalyzer {
  analyze(ledger: InvoiceLedger, asOf: Date): Aging {
    const open = ledger.documents.filter((document) => document.isOpen());

    const buckets = BUCKETS.map<AgingBucket>((definition) => {
      const invoices = open.filter((document) => {
        const days = document.daysOverdue(asOf);
        return days >= definition.minDays && (definition.maxDays === null || days <= definition.maxDays);
      });
      return {
        ...definition,
        // Outstanding, not total: aging answers what is still owed.
        amount: Money.sum(
          invoices.map((invoice) => invoice.outstanding),
          ledger.currency,
        ),
        invoices,
      };
    });

    // Every bucket is always present, empty ones included, so `bucket("31-60")`
    // never has to distinguish "nothing there" from "no such bucket".
    return new Aging(buckets, ledger.currency);
  }
}
