import { describe, expect, it } from "vitest";

import { AnswerValidator } from "../../src/domain/services/AnswerValidator.js";
import { BookGap } from "../../src/domain/model/BookGap.js";
import { BookParts, Tier } from "../../src/domain/model/BookPart.js";
import { CashPosition } from "../../src/domain/model/book/CashPosition.js";
import { ClientId, InvoiceId, PartyRef } from "../../src/domain/model/Ids.js";
import { CompanyProfile } from "../../src/domain/model/book/CompanyProfile.js";
import {
  IncompleteBookError,
  UngroundedFigureError,
} from "../../src/domain/errors/BookErrors.js";
import { Invoice } from "../../src/domain/model/Invoice.js";
import { InvoiceLedger } from "../../src/domain/model/InvoiceLedger.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month } from "../../src/domain/model/Month.js";
import { MonthlyBook } from "../../src/domain/model/MonthlyBook.js";
import { ProfitAndLoss } from "../../src/domain/model/book/ProfitAndLoss.js";

const CLIENT = ClientId.of("acme");
const JULY = Month.of(2026, 7);
const NOW = new Date(Date.UTC(2026, 7, 20, 9, 30));
const validator = new AnswerValidator();

const invoice = (id: string): Invoice =>
  new Invoice(
    InvoiceId.of(id),
    `INV/2026/${id}`,
    PartyRef.of(id, `Party ${id}`),
    "outbound",
    new Date(Date.UTC(2026, 6, 1)),
    new Date(Date.UTC(2026, 6, 31)),
    Money.of(1_000, "USD"),
    Money.of(1_000, "USD"),
    "not_paid",
  );

const usableParts = (): Partial<BookParts> => ({
  pnl: new ProfitAndLoss([{ accountType: "income", amount: Money.of(50_000, "USD") }], "USD"),
  cash: new CashPosition([], JULY.endsOn(), "USD"),
  openReceivables: new InvoiceLedger([invoice("77"), invoice("78")], "USD"),
  company: new CompanyProfile("Acme Ltd", "USD", 12, 31),
});

const bookOf = (parts: Partial<BookParts>, gaps: BookGap[] = []): MonthlyBook =>
  MonthlyBook.assemble(CLIENT, JULY, parts, gaps, NOW, 10);

describe("AnswerValidator.ground", () => {
  it("returns a grounded answer carrying the evidence it was checked against", () => {
    const book = bookOf(usableParts());
    const answer = validator.ground(
      { text: "You billed $50,000 in July.", citedInvoiceIds: [InvoiceId.of("77")] },
      book,
      NOW,
    );

    expect(answer.text).toBe("You billed $50,000 in July.");
    expect(answer.askedAt).toBe(NOW);
    expect(answer.evidence.clientId.value).toBe("acme");
    expect(answer.evidence.month.key()).toBe("2026-07");
    expect(answer.evidence.documentCount).toBe(2);
    expect(answer.evidence.partsPresent).toContain("pnl");
  });

  it("accepts an answer that cites nothing at all", () => {
    const answer = validator.ground({ text: "Revenue was flat.", citedInvoiceIds: [] }, bookOf(usableParts()), NOW);
    expect(answer.text).toBe("Revenue was flat.");
  });

  it("throws when the answer cites an invoice the book never held", () => {
    const book = bookOf(usableParts());
    const draft = {
      text: "INV/2026/999 is your biggest overdue invoice.",
      citedInvoiceIds: [InvoiceId.of("77"), InvoiceId.of("999")],
    };

    expect(() => validator.ground(draft, book, NOW)).toThrow(UngroundedFigureError);
    try {
      validator.ground(draft, book, NOW);
    } catch (error) {
      // Only the invented one is reported — 77 was real.
      expect((error as UngroundedFigureError).invented.map((id) => id.value)).toEqual(["999"]);
    }
  });

  it("throws before looking at citations when a Required part is missing", () => {
    const parts = usableParts();
    delete parts.cash;

    const book = bookOf(parts, [BookGap.from("cash", Tier.Required, new Error("timed out"))]);

    expect(() =>
      validator.ground({ text: "You have plenty of cash.", citedInvoiceIds: [] }, book, NOW),
    ).toThrow(IncompleteBookError);
    // The refusal names the part in the words a client would read.
    expect(() =>
      validator.ground({ text: "You have plenty of cash.", citedInvoiceIds: [] }, book, NOW),
    ).toThrow(/your cash balances/);
  });
});
