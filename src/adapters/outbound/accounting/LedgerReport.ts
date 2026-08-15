import type { BookPart, BookParts, Tier } from "../../../domain/model/BookPart.js";
import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import type { Period } from "../../../domain/model/Period.js";

/**
 * Everything a report needs to know about what it is being asked for. Computed
 * once by the assembler so fifteen reports don't each recompute the same
 * boundaries — and so they can't disagree about them.
 */
export interface BookRequest {
  clientId: ClientId;
  month: Month;
  /** `month.period()`, precomputed. */
  period: Period;
  /** `month.endsOn()` — every point-in-time report uses this, not "now". */
  asOf: Date;
  /** Window for the trailing series; 12 gives same-month-last-year. */
  trailingMonths: number;
  /** Odoo company to scope to, when the client's registry entry names one. */
  companyId: number | null;
}

/**
 * One slot of the book, and how to fill it.
 *
 * Vendor-neutral on purpose: it names no HTTP, no Odoo and no SDK, which is why
 * it lives in `accounting/` rather than `odoo/`. A second ledger vendor is a
 * second set of implementations and the same assembler
 * (docs/architecture_phase1.md §7, §15).
 *
 * Generic in `K` so `BookParts[K]` is checked per report — a tax report cannot
 * return a `CashPosition` into the cash slot.
 */
export interface LedgerReport<K extends BookPart = BookPart> {
  readonly part: K;
  readonly tier: Tier;
  run(request: BookRequest): Promise<BookParts[K]>;
}
