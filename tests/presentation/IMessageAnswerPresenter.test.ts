import { describe, expect, it } from "vitest";
import { AnswerResult } from "../../src/application/dto/AnswerResult.js";
import { BookGap } from "../../src/domain/model/BookGap.js";
import { Tier } from "../../src/domain/model/BookPart.js";
import { Evidence } from "../../src/domain/model/Evidence.js";
import { GroundedAnswer } from "../../src/domain/model/GroundedAnswer.js";
import { Invoice } from "../../src/domain/model/Invoice.js";
import { InvoiceLedger } from "../../src/domain/model/InvoiceLedger.js";
import { InvoiceId, PartyRef } from "../../src/domain/model/Ids.js";
import { Money } from "../../src/domain/model/Money.js";
import type { MonthlyBook } from "../../src/domain/model/MonthlyBook.js";
import { IMessageAnswerPresenter } from "../../src/presentation/presenters/IMessageAnswerPresenter.js";
import { MoneyFormatter } from "../../src/presentation/presenters/MoneyFormatter.js";
import { AUG_15_2026, buildBook, USD } from "../support/books.js";

const presenter = new IMessageAnswerPresenter(new MoneyFormatter());

/** 87 documents, so the footer is the one printed in §9 verbatim. */
function ledgerOf(count: number): InvoiceLedger {
  const documents = Array.from(
    { length: count },
    (_, index) =>
      new Invoice(
        InvoiceId.of(4000 + index),
        `INV/2026/${String(index).padStart(4, "0")}`,
        PartyRef.of(index, `Party ${index}`),
        "outbound",
        new Date("2026-07-14T00:00:00.000Z"),
        new Date("2026-08-13T00:00:00.000Z"),
        Money.of(1_000, USD),
        Money.of(1_000, USD),
        "not_paid",
      ),
  );
  return new InvoiceLedger(documents, USD);
}

function present(book: MonthlyBook, text = "Revenue was $80,000."): string {
  const answer = new GroundedAnswer(text, Evidence.fromBook(book), AUG_15_2026);
  return presenter.present(AnswerResult.from(answer, book, null)).text;
}

describe("IMessageAnswerPresenter", () => {
  it("prints the footer exactly as §9 prints it", () => {
    const book = buildBook({ parts: { invoicesIssued: ledgerOf(87) } });

    expect(present(book)).toBe(
      ["Revenue was $80,000.", "", "_July 2026 · 87 documents · as of 31 Jul 2026_"].join("\n"),
    );
  });

  it("adds the settling line only when the books are still settling", () => {
    const settled = buildBook({ assembledAt: AUG_15_2026 });
    const settling = buildBook({ assembledAt: new Date("2026-08-05T09:00:00.000Z") });

    expect(present(settled)).not.toContain("still settling");
    expect(present(settling)).toContain("_books for this month may still be settling_");
  });

  it("adds the gap line only when something could not be read, in client words", () => {
    const clean = buildBook();
    const gapped = buildBook({
      gaps: [
        BookGap.from("tax", Tier.Standard, new Error("timed out")),
        BookGap.from("trailing", Tier.Standard, new Error("timed out")),
      ],
    });

    expect(present(clean)).not.toContain("couldn't read");
    expect(present(gapped)).toContain("_⚠️ couldn't read: the tax lines, the month-by-month trend_");
  });

  it("carries both extra lines when both apply, in footer order", () => {
    const book = buildBook({
      assembledAt: new Date("2026-08-05T09:00:00.000Z"),
      gaps: [BookGap.from("tax", Tier.Standard, new Error("timed out"))],
    });

    const lines = present(book).split("\n");

    expect(lines.at(-3)).toContain("as of 31 Jul 2026");
    expect(lines.at(-2)).toBe("_books for this month may still be settling_");
    expect(lines.at(-1)).toBe("_⚠️ couldn't read: the tax lines_");
  });

  it("never touches the answer text", () => {
    const book = buildBook();
    const text = "Biggest expense line in July was Contractors — $18,400, 31% of the month.";

    expect(present(book, text).startsWith(text)).toBe(true);
  });
});
