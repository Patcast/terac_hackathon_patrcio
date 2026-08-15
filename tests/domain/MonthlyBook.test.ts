import { describe, expect, it } from "vitest";

import { BookGap } from "../../src/domain/model/BookGap.js";
import { BookParts, PART_LABELS, Tier } from "../../src/domain/model/BookPart.js";
import { CashPosition } from "../../src/domain/model/book/CashPosition.js";
import { ChartOfAccounts } from "../../src/domain/model/book/ChartOfAccounts.js";
import { CompanyProfile } from "../../src/domain/model/book/CompanyProfile.js";
import { ClientId, InvoiceId, PartyRef } from "../../src/domain/model/Ids.js";
import { Invoice } from "../../src/domain/model/Invoice.js";
import { InvoiceLedger } from "../../src/domain/model/InvoiceLedger.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month } from "../../src/domain/model/Month.js";
import { MonthlyBook } from "../../src/domain/model/MonthlyBook.js";
import { ProfitAndLoss } from "../../src/domain/model/book/ProfitAndLoss.js";

const CLIENT = ClientId.of("acme");
const JULY = Month.of(2026, 7);
const SETTLING_DAYS = 10;
const day = (year: number, month: number, date: number): Date =>
  new Date(Date.UTC(year, month - 1, date));

const invoice = (id: string): Invoice =>
  new Invoice(
    InvoiceId.of(id),
    `INV/${id}`,
    PartyRef.of(id, `Party ${id}`),
    "outbound",
    day(2026, 7, 1),
    day(2026, 7, 31),
    Money.of(1_000, "USD"),
    Money.of(1_000, "USD"),
    "not_paid",
  );

/** The four Required parts, and nothing else. */
const required = (): Partial<BookParts> => ({
  pnl: new ProfitAndLoss(
    [
      { accountType: "income", amount: Money.of(50_000, "USD") },
      { accountType: "expense", amount: Money.of(42_000, "USD") },
    ],
    "USD",
  ),
  cash: new CashPosition([], day(2026, 7, 31), "USD"),
  openReceivables: InvoiceLedger.empty("USD"),
  company: new CompanyProfile("Acme Ltd", "USD", 12, 31),
});

const assemble = (parts: Partial<BookParts>, gaps: BookGap[] = [], at = day(2026, 8, 15)) =>
  MonthlyBook.assemble(CLIENT, JULY, parts, gaps, at, SETTLING_DAYS);

describe("MonthlyBook.isUsable", () => {
  it("is true when every Required part is present", () => {
    const book = assemble(required());
    expect(book.isUsable()).toBe(true);
    expect(book.missingRequired()).toEqual([]);
  });

  it("is false when a Required part is missing", () => {
    const parts = required();
    delete parts.pnl;

    const book = assemble(parts, [BookGap.from("pnl", Tier.Required, new Error("timed out"))]);
    expect(book.isUsable()).toBe(false);
    expect(book.missingRequired()).toEqual(["pnl"]);
    expect(book.pnl).toBeNull();
    expect(book.gaps[0]?.isFatal()).toBe(true);
    expect(book.gaps[0]?.label()).toBe("the profit and loss");
  });

  it("stays usable when an Optional part is missing", () => {
    const book = assemble(required(), [
      BookGap.from("balanceSheet", Tier.Optional, new Error("timed out")),
    ]);

    expect(book.isUsable()).toBe(true);
    expect(book.balanceSheet).toBeNull();
    expect(book.gaps[0]?.isFatal()).toBe(false);
    expect(book.gaps[0]?.label()).toBe(PART_LABELS.balanceSheet);
  });

  it("stays usable when the Standard trailing months are missing — thinner, not unanswerable", () => {
    const book = assemble(required(), [
      BookGap.from("trailing", Tier.Standard, new Error("timed out")),
    ]);

    expect(book.isUsable()).toBe(true);
    expect(book.trailing).toBeNull();
    expect(book.gaps[0]?.label()).toBe("the month-by-month trend");
  });
});

describe("MonthlyBook settling and partial", () => {
  it("is settling on the 3rd of the following month with a 10-day window", () => {
    const book = assemble(required(), [], day(2026, 8, 3));
    expect(book.settling).toBe(true);
    expect(book.partial).toBe(false);
    // Settling is a boolean, not a gap: the book read fine, it may still move.
    expect(book.gaps).toEqual([]);
  });

  it("is not settling on the 20th", () => {
    const book = assemble(required(), [], day(2026, 8, 20));
    expect(book.settling).toBe(false);
    expect(book.partial).toBe(false);
  });

  it("is partial, not settling, while the month is still running", () => {
    const book = assemble(required(), [], day(2026, 7, 15));
    expect(book.partial).toBe(true);
    expect(book.settling).toBe(false);
  });
});

describe("MonthlyBook evidence", () => {
  it("counts documents across all four ledgers", () => {
    const book = assemble({
      ...required(),
      invoicesIssued: new InvoiceLedger([invoice("1"), invoice("2")], "USD"),
      billsReceived: new InvoiceLedger([invoice("3")], "USD"),
      openReceivables: new InvoiceLedger([invoice("4")], "USD"),
      openPayables: new InvoiceLedger([invoice("5"), invoice("6")], "USD"),
    });

    expect(book.documentCount()).toBe(6);
  });

  it("counts nothing from ledgers that never arrived", () => {
    expect(assemble(required()).documentCount()).toBe(0);
  });

  it("knows every invoice id it holds, and only those", () => {
    const book = assemble({
      ...required(),
      invoicesIssued: new InvoiceLedger([invoice("101")], "USD"),
      openReceivables: new InvoiceLedger([invoice("202")], "USD"),
    });

    const known = book.knownInvoiceIds();
    expect([...known].sort()).toEqual(["101", "202"]);
    expect(known.has("999")).toBe(false);
  });

  it("reports the parts it holds, in book order", () => {
    const book = assemble(required());
    expect(book.partsPresent()).toEqual(["openReceivables", "pnl", "cash", "company"]);
  });

  it("takes currency from the company profile, then from any part that has one", () => {
    expect(assemble(required()).currency()).toBe("USD");

    const parts = required();
    delete parts.company;
    expect(assemble(parts).currency()).toBe("USD");

    // A chart of accounts holds no amounts, so it cannot answer the question.
    expect(assemble({ accounts: new ChartOfAccounts([]) }).currency()).toBe("");
  });

  it("anchors as-of at month end, not at assembly time", () => {
    const book = assemble(required(), [], day(2026, 8, 20));
    expect(book.asOf().toISOString()).toBe("2026-07-31T23:59:59.999Z");
    expect(book.assembledAt.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});
