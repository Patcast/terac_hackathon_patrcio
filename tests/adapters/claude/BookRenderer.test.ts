import { describe, expect, it } from "vitest";
import { BookRenderer } from "../../../src/adapters/outbound/claude/BookRenderer.js";
import { BookGap } from "../../../src/domain/model/BookGap.js";
import { Tier } from "../../../src/domain/model/BookPart.js";
import { Invoice } from "../../../src/domain/model/Invoice.js";
import { InvoiceLedger } from "../../../src/domain/model/InvoiceLedger.js";
import { InvoiceId, PartyRef } from "../../../src/domain/model/Ids.js";
import { Money } from "../../../src/domain/model/Money.js";
import { Runway } from "../../../src/domain/model/Runway.js";
import { AccountRef } from "../../../src/domain/model/Ids.js";
import { Month } from "../../../src/domain/model/Month.js";
import {
  CategorySeries,
  TrailingByCategory,
} from "../../../src/domain/model/book/TrailingByCategory.js";
import {
  buildBook,
  burningTrailingMonths,
  JULY_2026,
  USD,
} from "../../support/books.js";

function ledger(): InvoiceLedger {
  return new InvoiceLedger(
    [
      new Invoice(
        InvoiceId.of(4101),
        "INV/2026/0042",
        PartyRef.of(7, "Northwind Ltd"),
        "outbound",
        new Date("2026-05-14T00:00:00.000Z"),
        new Date("2026-06-13T00:00:00.000Z"),
        Money.of(12_000, USD),
        Money.of(12_000, USD),
        "not_paid",
      ),
    ],
    USD,
  );
}

const renderer = new BookRenderer();

describe("BookRenderer", () => {
  it("renders a book that is missing every Optional part", () => {
    // The four Required parts and nothing else — no chart of accounts, no
    // balance sheet, no cash movements, no revenue by customer.
    const rendered = renderer.render(buildBook(), null);

    expect(rendered.stablePrefix).toContain("Acme Ltd");
    expect(rendered.volatile).toContain("July 2026");
    // Honest rather than silent: the model can only say what it could not read
    // if the hole is visible to it.
    expect(rendered.stablePrefix).toContain("Not available");
    expect(rendered.volatile).toContain("Not available");
  });

  it("puts the trailing months before the document tables — §11's order is the design", () => {
    const book = buildBook({
      parts: { trailing: burningTrailingMonths(), invoicesIssued: ledger() },
    });

    const { volatile } = renderer.render(book, null);

    const headline = volatile.indexOf("## Headline");
    const trailing = volatile.indexOf("## Trailing months");
    const aggregates = volatile.indexOf("## Account and partner detail");
    const documents = volatile.indexOf("## Documents");
    const gaps = volatile.indexOf("## What could not be read");

    for (const index of [headline, trailing, aggregates, documents, gaps]) {
      expect(index).toBeGreaterThan(-1);
    }
    // The model reads the trend before July's own detail — the structural
    // defence against a one-off annual bill reading as a crisis (§4).
    expect(headline).toBeLessThan(trailing);
    expect(trailing).toBeLessThan(aggregates);
    expect(aggregates).toBeLessThan(documents);
    expect(documents).toBeLessThan(gaps);
  });

  it("prints one row per trailing month, oldest first", () => {
    const book = buildBook({ parts: { trailing: burningTrailingMonths() } });

    const { volatile } = renderer.render(book, null);

    expect(volatile).toContain("month | revenue | expenses | net");
    expect(volatile).toContain("2025-08 |");
    expect(volatile).toContain("2026-07 |");
    expect(volatile.indexOf("2025-08 |")).toBeLessThan(volatile.indexOf("2026-07 |"));
  });

  it("carries the as-of date on the book and on every point-in-time section", () => {
    const { volatile } = renderer.render(buildBook(), null);

    expect(volatile).toContain("as of | 2026-07-31");
    expect(volatile).toContain("### Cash position — as of 2026-07-31");
    expect(volatile).toContain("### Partner balances — as of 2026-07-31");
  });

  it("names a gap in the words a client would use, not the part key", () => {
    const book = buildBook({
      gaps: [BookGap.from("tax", Tier.Standard, new Error("timed out after 8000ms"))],
    });

    const { volatile } = renderer.render(book, null);

    expect(volatile).toContain("## What could not be read");
    expect(volatile).toContain("the tax lines");
    expect(volatile).not.toContain("| tax |"); // the key never reaches the prompt as a label
    expect(volatile).toContain("timed out after 8000ms");
  });

  it("says the books are still settling when the month has ended but not closed", () => {
    const book = buildBook({ assembledAt: new Date("2026-08-05T09:00:00.000Z") });

    const { volatile } = renderer.render(book, null);

    expect(volatile).toContain("still settling");
  });

  it("states runway as an already-calculated figure, or says it has none", () => {
    const runway = Runway.of(7.2, JULY_2026.endsOn(), 3, Money.of(5_000, USD));

    expect(renderer.render(buildBook(), runway).volatile).toContain(
      "~7.2 months at the last 3 months' burn",
    );
    expect(renderer.render(buildBook(), null).volatile).toContain(
      "Not available — the client is profitable",
    );
  });

  it("keeps the chart of accounts out of the volatile half so it can be cached", () => {
    const book = buildBook();

    const { stablePrefix, volatile } = renderer.render(book, null);

    expect(stablePrefix).toContain("## Chart of accounts");
    expect(volatile).not.toContain("## Chart of accounts");
  });
});

describe("BookRenderer — each cost's own history", () => {
  it("fills the avg-before column on a 12-month window, not just a 13-month one", async () => {
    // `averageBefore(n)` needs n months *preceding* the anchor, and a 12-month
    // window holds 11 of them. Asking for 12 silently blanked the column — on a
    // live book, while the 13-month fixture looked fine.
    const anchor = Month.of(2026, 7);
    const window = anchor.trailingMonths(12);
    const payroll = new CategorySeries(
      AccountRef.of(1, "6000", "Payroll"),
      "expense",
      anchor,
      window.map((month, i) => ({ month, amount: Money.of(40_000 + i * 500, "EUR") })),
      "EUR",
    );

    const book = buildBook({
      currency: "EUR",
      parts: { trailingByCategory: new TrailingByCategory(anchor, [payroll], "EUR") },
    });
    const rendered = new BookRenderer().render(book, null);
    const row = rendered.volatile
      .split("\n")
      .find((line) => line.startsWith("6000 Payroll |"));

    expect(row).toBeDefined();
    expect(row).not.toContain("not available");
    expect(row?.split("|")[3]?.trim()).toMatch(/^42250\.00|^4[0-9]{4}\.[0-9]{2}$/);
  });

  it("puts each cost's history above the document tables", () => {
    const rendered = new BookRenderer().render(buildBook(), null);
    const body = rendered.volatile;

    expect(body.indexOf("Each cost's own history")).toBeGreaterThan(-1);
    expect(body.indexOf("Each cost's own history")).toBeLessThan(body.indexOf("## Documents"));
  });
});
