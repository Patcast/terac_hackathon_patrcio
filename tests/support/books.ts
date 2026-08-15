import type { BookGap } from "../../src/domain/model/BookGap.js";
import type { BookParts } from "../../src/domain/model/BookPart.js";
import type { Currency } from "../../src/domain/model/Money.js";
import type { MonthIndex } from "../../src/domain/model/Month.js";
import { AccountRef, ClientId } from "../../src/domain/model/Ids.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month } from "../../src/domain/model/Month.js";
import { MonthlyBook } from "../../src/domain/model/MonthlyBook.js";
import { CashPosition } from "../../src/domain/model/book/CashPosition.js";
import { CompanyProfile } from "../../src/domain/model/book/CompanyProfile.js";
import { ProfitAndLoss } from "../../src/domain/model/book/ProfitAndLoss.js";
import { TrailingMonths } from "../../src/domain/model/book/TrailingMonths.js";
import { InvoiceLedger } from "../../src/domain/model/InvoiceLedger.js";

/**
 * The worked example the docs use throughout: today is 15 Aug 2026, the settled
 * month is July 2026, every point-in-time figure is as of 31 Jul 2026.
 */
export const JULY_2026 = Month.of(2026, 7);
export const AUG_15_2026 = new Date("2026-08-15T09:00:00.000Z");
export const ACME = ClientId.of("acme");
export const USD: Currency = "USD";

/**
 * The four Required parts and nothing else — the minimum that makes a book
 * `isUsable()`. Tests that care about a specific part override it in `parts`.
 */
export function requiredParts(month: Month = JULY_2026, currency: Currency = USD): Partial<BookParts> {
  return {
    pnl: new ProfitAndLoss(
      [
        { accountType: "income", amount: Money.of(80_000, currency) },
        { accountType: "expense", amount: Money.of(85_000, currency) },
      ],
      currency,
    ),
    cash: new CashPosition(
      [{ account: AccountRef.of(1, "101000", "Bank"), balance: Money.of(60_000, currency) }],
      month.endsOn(),
      currency,
    ),
    openReceivables: InvoiceLedger.empty(currency),
    company: new CompanyProfile("Acme Ltd", currency, 12 satisfies MonthIndex, 31),
  };
}

/** Twelve months of steady $5k burn — enough for a `RunwayEstimator` to answer. */
export function burningTrailingMonths(
  anchor: Month = JULY_2026,
  currency: Currency = USD,
): TrailingMonths {
  const months = anchor.trailingMonths(12).map((month) => ({
    month,
    revenue: Money.of(80_000, currency),
    expenses: Money.of(85_000, currency),
    net: Money.of(-5_000, currency),
  }));
  return new TrailingMonths(anchor, months, currency);
}

export interface BookOptions {
  clientId?: ClientId;
  month?: Month;
  /** Merged over `requiredParts()`; pass `{}` plus `bare: true` to start empty. */
  parts?: Partial<BookParts>;
  bare?: boolean;
  gaps?: readonly BookGap[];
  assembledAt?: Date;
  settlingDays?: number;
  currency?: Currency;
}

export function buildBook(options: BookOptions = {}): MonthlyBook {
  const month = options.month ?? JULY_2026;
  const currency = options.currency ?? USD;
  const base = options.bare === true ? {} : requiredParts(month, currency);

  return MonthlyBook.assemble(
    options.clientId ?? ACME,
    month,
    { ...base, ...(options.parts ?? {}) },
    options.gaps ?? [],
    options.assembledAt ?? AUG_15_2026,
    options.settlingDays ?? 10,
  );
}

/** A `Clock` whose "now" a test can move. */
export class StubClock {
  constructor(private current: Date = AUG_15_2026) {}

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(at: Date): void {
    this.current = at;
  }
}
