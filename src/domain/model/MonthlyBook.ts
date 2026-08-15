import { ALL_BOOK_PARTS, BookPart, BookParts, REQUIRED_PARTS } from "./BookPart.js";
import { BookGap } from "./BookGap.js";
import { ClientId } from "./Ids.js";
import { Month } from "./Month.js";
import { Currency } from "./Money.js";
import { InvoiceLedger } from "./InvoiceLedger.js";
import { BalanceSheet } from "./book/BalanceSheet.js";
import { CashMovements } from "./book/CashMovements.js";
import { CashPosition } from "./book/CashPosition.js";
import { ChartOfAccounts } from "./book/ChartOfAccounts.js";
import { CompanyProfile } from "./book/CompanyProfile.js";
import { PartnerBalances } from "./book/PartnerBalances.js";
import { PartnerRevenue } from "./book/PartnerRevenue.js";
import { ProfitAndLoss } from "./book/ProfitAndLoss.js";
import { TaxSummary } from "./book/TaxSummary.js";
import { TrailingByCategory } from "./book/TrailingByCategory.js";
import { TrailingMonths } from "./book/TrailingMonths.js";
import { TrialBalance } from "./book/TrialBalance.js";

/** The four parts made of documents — what `documentCount()` counts (§9's footer). */
const LEDGER_PARTS = ["invoicesIssued", "billsReceived", "openReceivables", "openPayables"] as const;

/**
 * Everything known about one client for one month — the unit of grounding.
 *
 * Inert by design (docs/architecture_phase1.md §5): a snapshot of a period, no
 * I/O, no lazy loading. That is what makes it cacheable, serialisable to a
 * fixture, and trivial to hand a test.
 *
 * Every part is nullable because fifteen queries give fourteen ways to be partly
 * successful. `isUsable()` — not the caller — is what decides whether answering
 * at all is defensible.
 */
export class MonthlyBook {
  private constructor(
    readonly clientId: ClientId,
    readonly month: Month,
    private readonly parts: Readonly<Partial<BookParts>>,
    readonly gaps: readonly BookGap[],
    readonly assembledAt: Date,
    readonly settling: boolean,
    readonly partial: boolean,
  ) {}

  /**
   * The domain factory (§7). The assembler collects; this judges.
   *
   * It is the only way to build a book, so `settling` and `partial` cannot be
   * set by a caller who guessed. Both are derived from the assembly instant
   * against the month, which is also why `assembledAt` is passed in rather than
   * read from a clock — `domain/` never asks what time it is.
   */
  static assemble(
    clientId: ClientId,
    month: Month,
    parts: Partial<BookParts>,
    gaps: readonly BookGap[],
    assembledAt: Date,
    settlingDays: number,
  ): MonthlyBook {
    const ended = month.hasEnded(assembledAt);
    return new MonthlyBook(
      clientId,
      month,
      { ...parts },
      [...gaps],
      new Date(assembledAt.getTime()),
      // Read fine, may still move: late vendor bills and the bank rec land over
      // the days after month end. Distinct from a gap, which means unread.
      ended && !month.isSettled(assembledAt, settlingDays),
      !ended,
    );
  }

  get invoicesIssued(): InvoiceLedger | null {
    return this.parts.invoicesIssued ?? null;
  }

  get billsReceived(): InvoiceLedger | null {
    return this.parts.billsReceived ?? null;
  }

  get openReceivables(): InvoiceLedger | null {
    return this.parts.openReceivables ?? null;
  }

  get openPayables(): InvoiceLedger | null {
    return this.parts.openPayables ?? null;
  }

  get pnl(): ProfitAndLoss | null {
    return this.parts.pnl ?? null;
  }

  get trailing(): TrailingMonths | null {
    return this.parts.trailing ?? null;
  }

  get trailingByCategory(): TrailingByCategory | null {
    return this.parts.trailingByCategory ?? null;
  }

  get trialBalance(): TrialBalance | null {
    return this.parts.trialBalance ?? null;
  }

  get balanceSheet(): BalanceSheet | null {
    return this.parts.balanceSheet ?? null;
  }

  get cash(): CashPosition | null {
    return this.parts.cash ?? null;
  }

  get cashMovements(): CashMovements | null {
    return this.parts.cashMovements ?? null;
  }

  get tax(): TaxSummary | null {
    return this.parts.tax ?? null;
  }

  get partners(): PartnerBalances | null {
    return this.parts.partners ?? null;
  }

  get partnerRevenue(): PartnerRevenue | null {
    return this.parts.partnerRevenue ?? null;
  }

  get accounts(): ChartOfAccounts | null {
    return this.parts.accounts ?? null;
  }

  get company(): CompanyProfile | null {
    return this.parts.company ?? null;
  }

  /** Generic access, for code that iterates the catalogue rather than naming a part. */
  part<K extends BookPart>(key: K): BookParts[K] | null {
    return this.parts[key] ?? null;
  }

  /** Which parts came back — the shape of the evidence, in book order. */
  partsPresent(): BookPart[] {
    return ALL_BOOK_PARTS.filter((key) => this.parts[key] !== undefined);
  }

  isUsable(): boolean {
    return this.missingRequired().length === 0;
  }

  missingRequired(): BookPart[] {
    return REQUIRED_PARTS.filter((key) => this.parts[key] === undefined);
  }

  /**
   * The company profile is the authority; the fallback exists so a book that
   * lost `company` but kept its numbers can still be formatted rather than
   * crash. An empty string is the honest answer for a book holding nothing —
   * `isUsable()` has already rejected it by then.
   */
  currency(): Currency {
    const company = this.company;
    if (company) return company.currency;

    for (const key of ALL_BOOK_PARTS) {
      const part = this.parts[key];
      if (part !== undefined && "currency" in part) return part.currency;
    }
    return "";
  }

  /** The `87 documents` of the reply footer: everything across the four ledgers. */
  documentCount(): number {
    return LEDGER_PARTS.reduce((count, key) => count + (this.parts[key]?.count() ?? 0), 0);
  }

  /**
   * What makes grounding possible: every invoice id we actually handed the
   * model. A cited id outside this set was invented (§5).
   *
   * Strings rather than `InvoiceId`s because the check is a set membership test
   * and value objects don't hash — `has(id.value)` is the whole point.
   */
  knownInvoiceIds(): Set<string> {
    const ids = new Set<string>();
    for (const key of LEDGER_PARTS) {
      for (const document of this.parts[key]?.documents ?? []) ids.add(document.id.value);
    }
    return ids;
  }

  /** Month end — the as-of date for every point-in-time figure in the book. */
  asOf(): Date {
    return this.month.endsOn();
  }
}
