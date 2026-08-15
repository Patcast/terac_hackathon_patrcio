import { InvoiceId, PartyRef } from "./Ids.js";
import { Money } from "./Money.js";
import { DAY_MS } from "./Period.js";

/** We billed them, or they billed us. Odoo's `move_type`, reduced to what matters. */
export type Direction = "outbound" | "inbound";

export type InvoiceStatus = "not_paid" | "partial" | "paid" | "reversed" | "in_payment";

/**
 * One document — a customer invoice, a vendor bill, or either one's credit note.
 *
 * `total` and `outstanding` are separate fields because conflating Odoo's
 * `amount_total` with `amount_residual` is the single most likely wrong-number
 * bug in Phase 1 (docs/architecture_phase1.md §4). What was billed and what is
 * still owed are different questions and the type refuses to blur them.
 */
export class Invoice {
  constructor(
    readonly id: InvoiceId,
    readonly number: string,
    readonly party: PartyRef,
    readonly direction: Direction,
    readonly issuedOn: Date,
    readonly dueDate: Date,
    readonly total: Money,
    readonly outstanding: Money,
    readonly status: InvoiceStatus,
  ) {}

  /**
   * Whole days past the due date, 0 when not yet due or already settled.
   *
   * Counted in whole UTC calendar days rather than elapsed milliseconds: Odoo
   * stores accounting dates with no time, and "due yesterday" has to read as 1
   * day whether the as-of instant is `month.endsOn()` at 23:59 or midnight.
   */
  daysOverdue(asOf: Date): number {
    if (!this.isOpen()) return 0;
    const days = (utcMidnight(asOf) - utcMidnight(this.dueDate)) / DAY_MS;
    return days > 0 ? days : 0;
  }

  /** Still money on the table: something outstanding, and not written off. */
  isOpen(): boolean {
    return (
      !this.outstanding.isZero() && this.status !== "paid" && this.status !== "reversed"
    );
  }

  isOverdue(asOf: Date): boolean {
    return this.daysOverdue(asOf) > 0;
  }
}

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
