import { describe, expect, it } from "vitest";

import { CostSignalKind } from "../../src/domain/model/CostSignal.js";
import { AccountRef, InvoiceId, PartyRef } from "../../src/domain/model/Ids.js";
import { Invoice } from "../../src/domain/model/Invoice.js";
import { InvoiceLedger } from "../../src/domain/model/InvoiceLedger.js";
import { Money } from "../../src/domain/model/Money.js";
import type { Month } from "../../src/domain/model/Month.js";
import { WatchKind } from "../../src/domain/model/WatchItem.js";
import { PartnerRevenue } from "../../src/domain/model/book/PartnerRevenue.js";
import {
  CategorySeries,
  TrailingByCategory,
} from "../../src/domain/model/book/TrailingByCategory.js";
import { HighlightSelector } from "../../src/domain/services/HighlightSelector.js";
import { addDays } from "../../src/domain/model/Period.js";
import { demoBook } from "../../src/adapters/outbound/odoo/fixtures/demoBook.js";
import { buildBook, JULY_2026, USD } from "../support/books.js";

/**
 * The selection rules of docs/imessage_flow_phase1.md beat 1, tested as rules —
 * because they are what both the text message and the web brief say out loud,
 * and a threshold that quietly stops firing is a product that quietly stops
 * warning anyone.
 */

/** A 13-month series for one account, oldest first. */
function series(code: string, name: string, amounts: number[], anchor: Month = JULY_2026) {
  return new CategorySeries(
    AccountRef.of(code, code, name),
    "expense",
    anchor,
    anchor.trailingMonths(amounts.length).map((month, index) => ({
      month,
      amount: Money.of(amounts[index] ?? 0, USD),
    })),
    USD,
  );
}

function categories(...list: CategorySeries[]) {
  return new TrailingByCategory(JULY_2026, list, USD);
}

/** One open customer invoice, `daysLate` days past due at month end. */
function openInvoice(party: string, amount: number, daysLate: number) {
  const end = JULY_2026.endsOn();
  return new Invoice(
    InvoiceId.of(`INV-${party}-${daysLate}`),
    `INV/${daysLate}`,
    PartyRef.of(party, party),
    "outbound",
    addDays(end, -(daysLate + 30)),
    addDays(end, -daysLate),
    Money.of(amount, USD),
    Money.of(amount, USD),
    "not_paid",
  );
}

const selector = new HighlightSelector();

describe("HighlightSelector — the watch item", () => {
  it("leads with customer concentration when one customer clears the share", () => {
    const book = buildBook({
      parts: {
        partnerRevenue: new PartnerRevenue(
          [
            { party: PartyRef.of(1, "Northwind"), revenue: Money.of(41_000, USD) },
            { party: PartyRef.of(2, "Devlin"), revenue: Money.of(30_000, USD) },
            { party: PartyRef.of(3, "Harbour"), revenue: Money.of(29_000, USD) },
          ],
          USD,
        ),
      },
    });

    const watch = selector.watchItem(book);
    expect(watch.kind).toBe(WatchKind.Concentration);
    expect(watch.subject).toBe("Northwind");
    expect(watch.share).toBeCloseTo(0.41, 2);
  });

  it("does not call a spread-out revenue month concentrated", () => {
    const book = buildBook({
      parts: {
        partnerRevenue: new PartnerRevenue(
          [
            { party: PartyRef.of(1, "Northwind"), revenue: Money.of(25_000, USD) },
            { party: PartyRef.of(2, "Devlin"), revenue: Money.of(25_000, USD) },
            { party: PartyRef.of(3, "Harbour"), revenue: Money.of(25_000, USD) },
            { party: PartyRef.of(4, "Kestrel"), revenue: Money.of(25_000, USD) },
          ],
          USD,
        ),
      },
    });

    expect(selector.watchItem(book).kind).toBe(WatchKind.Nothing);
  });

  it("falls to aged receivables, aged to month end rather than to now", () => {
    const book = buildBook({
      parts: {
        openReceivables: new InvoiceLedger(
          [openInvoice("Northwind", 18_400, 75), openInvoice("Kestrel", 3_000, 0)],
          USD,
        ),
      },
    });

    const watch = selector.watchItem(book);
    expect(watch.kind).toBe(WatchKind.OverdueReceivables);
    expect(watch.subject).toBe("Northwind");
    // 75 days late lands in the 61-90 bucket, so `over(60)` carries exactly it.
    expect(watch.amount?.toMajor()).toBe(18_400);
  });

  it("ignores receivables that are late but immaterial against the book", () => {
    const book = buildBook({
      parts: {
        openReceivables: new InvoiceLedger(
          [openInvoice("Small", 400, 75), openInvoice("Big", 40_000, 0)],
          USD,
        ),
      },
    });

    expect(selector.watchItem(book).kind).toBe(WatchKind.Nothing);
  });

  it("falls last to a cost that has climbed three months running", () => {
    const book = buildBook({
      parts: {
        trailingByCategory: categories(
          series("6000", "Payroll", [40, 40, 40, 40, 40, 40, 40, 40, 40, 40, 41, 42, 43]),
        ),
      },
    });

    const watch = selector.watchItem(book);
    expect(watch.kind).toBe(WatchKind.RisingCost);
    expect(watch.subject).toBe("Payroll");
    expect(watch.months).toBe(3);
  });

  it("says nothing rather than manufacture a worry", () => {
    expect(selector.watchItem(buildBook()).isNothing()).toBe(true);
  });
});

describe("HighlightSelector — cost signals", () => {
  it("calls an annual bill a one-off, not a spike", () => {
    // 12× its average and completely unalarming: the characteristic failure of
    // monthly reporting (docs/architecture_phase1.md §4).
    const book = buildBook({
      parts: {
        trailingByCategory: categories(
          series("6600", "Insurance", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1_400]),
        ),
      },
    });

    const [insurance] = selector.costSignals(book);
    expect(insurance?.kind).toBe(CostSignalKind.OneOff);
    expect(insurance?.monthsWithActivity).toBe(1);
  });

  it("calls a recurring cost that doubled a spike", () => {
    const book = buildBook({
      parts: {
        trailingByCategory: categories(
          series("6100", "Software", [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 9]),
        ),
      },
    });

    const [software] = selector.costSignals(book);
    expect(software?.kind).toBe(CostSignalKind.Spike);
    expect(software?.ratio()).toBeCloseTo(2.25, 2);
  });

  it("always includes the largest cost, even when the verdict is 'in line'", () => {
    const book = buildBook({
      parts: {
        trailingByCategory: categories(
          series("6200", "Rent", [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]),
        ),
      },
    });

    const [rent] = selector.costSignals(book);
    expect(rent?.account.name).toBe("Rent");
    expect(rent?.kind).toBe(CostSignalKind.InLine);
    expect(rent?.isNotable()).toBe(false);
  });

  it("states each line as a share of the month's expenses", () => {
    const book = buildBook({
      parts: {
        trailingByCategory: categories(
          series("6000", "Payroll", Array(13).fill(42_500) as number[]),
        ),
      },
    });

    // `requiredParts` books $85,000 of expenses for the month.
    expect(selector.costSignals(book)[0]?.shareOfExpenses).toBeCloseTo(0.5, 3);
  });
});

describe("HighlightSelector — over the demo book", () => {
  const book = demoBook(JULY_2026);

  it("flags the concentration the fixture was built to carry", () => {
    const watch = selector.watchItem(book);
    expect(watch.kind).toBe(WatchKind.Concentration);
    expect(watch.subject).toBe("Northwind Systems");
    // €27,300 of the month's €68,200 of customer revenue.
    expect(Math.round((watch.share ?? 0) * 100)).toBe(40);
  });

  it("prints the biggest cost, the renewal and the one-off together", () => {
    const signals = selector.costSignals(book);
    const byName = new Map(signals.map((signal) => [signal.account.name, signal]));

    expect(signals[0]?.account.name).toBe("Payroll");
    expect(byName.get("Software & Tooling")?.kind).toBe(CostSignalKind.Spike);
    // The reassuring row has to survive the cap — it is the one that stops a
    // reader panicking about a €1,400 insurance premium.
    expect(byName.get("Insurance")?.kind).toBe(CostSignalKind.OneOff);
  });
});
