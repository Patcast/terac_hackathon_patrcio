import { Invoice } from "./Invoice.js";
import { InvoiceId, PartyRef } from "./Ids.js";
import { Currency, Money } from "./Money.js";

export interface PartyTotals {
  party: PartyRef;
  billed: Money;
  outstanding: Money;
}

/**
 * A set of documents read in one query — what we invoiced in July, or what was
 * still open at 31 July. Inert: every method is a fold over `documents`.
 *
 * The ledger carries its own `currency` so an empty one still knows what zero
 * means; `Money` then refuses to sum across currencies for free.
 */
export class InvoiceLedger {
  constructor(
    readonly documents: readonly Invoice[],
    readonly currency: Currency,
  ) {}

  static empty(currency: Currency): InvoiceLedger {
    return new InvoiceLedger([], currency);
  }

  count(): number {
    return this.documents.length;
  }

  totalBilled(): Money {
    return Money.sum(
      this.documents.map((document) => document.total),
      this.currency,
    );
  }

  /** Not the same number as `totalBilled` — this is what is still owed (§4). */
  totalOutstanding(): Money {
    return Money.sum(
      this.documents.map((document) => document.outstanding),
      this.currency,
    );
  }

  /** Rolled up per customer or supplier, biggest debt first — "who owes me". */
  byParty(): PartyTotals[] {
    const totals = new Map<string, PartyTotals>();

    for (const document of this.documents) {
      const existing = totals.get(document.party.id);
      if (existing) {
        totals.set(document.party.id, {
          party: existing.party,
          billed: existing.billed.plus(document.total),
          outstanding: existing.outstanding.plus(document.outstanding),
        });
      } else {
        totals.set(document.party.id, {
          party: document.party,
          billed: document.total,
          outstanding: document.outstanding,
        });
      }
    }

    return [...totals.values()].sort((a, b) => b.outstanding.compareTo(a.outstanding));
  }

  /** By absolute size, so a large credit note ranks as the large document it is. */
  largest(n: number): Invoice[] {
    return [...this.documents]
      .sort((a, b) => b.total.abs().compareTo(a.total.abs()))
      .slice(0, Math.max(0, n));
  }

  overdue(asOf: Date): Invoice[] {
    return this.documents
      .filter((document) => document.isOverdue(asOf))
      .sort((a, b) => b.daysOverdue(asOf) - a.daysOverdue(asOf));
  }

  ids(): InvoiceId[] {
    return this.documents.map((document) => document.id);
  }
}
