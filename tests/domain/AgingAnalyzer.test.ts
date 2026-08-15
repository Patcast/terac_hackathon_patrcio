import { describe, expect, it } from "vitest";

import { AgingAnalyzer } from "../../src/domain/services/AgingAnalyzer.js";
import { Invoice } from "../../src/domain/model/Invoice.js";
import { InvoiceId, PartyRef } from "../../src/domain/model/Ids.js";
import { InvoiceLedger } from "../../src/domain/model/InvoiceLedger.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month } from "../../src/domain/model/Month.js";

const ASOF = Month.of(2026, 7).endsOn();
const day = (year: number, month: number, date: number): Date =>
  new Date(Date.UTC(year, month - 1, date));

const open = (id: string, dueDate: Date, outstanding: number): Invoice =>
  new Invoice(
    InvoiceId.of(id),
    `INV/${id}`,
    PartyRef.of(id, `Party ${id}`),
    "outbound",
    day(2026, 1, 1),
    dueDate,
    Money.of(outstanding, "USD"),
    Money.of(outstanding, "USD"),
    "not_paid",
  );

const ledgerOf = (...invoices: Invoice[]): InvoiceLedger => new InvoiceLedger(invoices, "USD");

const analyzer = new AgingAnalyzer();

describe("AgingAnalyzer", () => {
  it("puts an invoice exactly on a bucket boundary in the lower bucket", () => {
    // As of 31 Jul: due 1 Jul is 30 days out, due 30 Jun is 31.
    const aging = analyzer.analyze(
      ledgerOf(open("a", day(2026, 7, 1), 100), open("b", day(2026, 6, 30), 200)),
      ASOF,
    );

    expect(aging.bucket("1-30")?.invoices.map((i) => i.id.value)).toEqual(["a"]);
    expect(aging.bucket("31-60")?.invoices.map((i) => i.id.value)).toEqual(["b"]);

    // 60 and 61 are the other edge of the same seam.
    const seam = analyzer.analyze(
      ledgerOf(open("c", day(2026, 6, 1), 300), open("d", day(2026, 5, 31), 400)),
      ASOF,
    );
    expect(seam.bucket("31-60")?.invoices.map((i) => i.id.value)).toEqual(["c"]);
    expect(seam.bucket("61-90")?.invoices.map((i) => i.id.value)).toEqual(["d"]);
  });

  it("treats an invoice due on the as-of date, or later, as current", () => {
    const aging = analyzer.analyze(
      ledgerOf(open("a", day(2026, 7, 31), 100), open("b", day(2026, 9, 15), 200)),
      ASOF,
    );

    expect(aging.bucket("current")?.amount.toString()).toBe("300.00 USD");
    expect(aging.bucket("1-30")?.amount.isZero()).toBe(true);
  });

  it("sums what is 60+ days out — the number beat 4 reads aloud", () => {
    const aging = analyzer.analyze(
      ledgerOf(
        open("current", day(2026, 8, 10), 1_000),
        open("recent", day(2026, 7, 10), 2_000), // 21 days
        open("stale", day(2026, 6, 15), 4_000), // 46 days
        open("bad", day(2026, 5, 20), 8_000), // 72 days
        open("worst", day(2026, 4, 1), 16_000), // 121 days
      ),
      ASOF,
    );

    expect(aging.bucket("61-90")?.amount.toString()).toBe("8000.00 USD");
    expect(aging.bucket("90+")?.amount.toString()).toBe("16000.00 USD");
    expect(aging.over(60).toString()).toBe("24000.00 USD");
    expect(aging.over(30).toString()).toBe("28000.00 USD");
    expect(aging.over(90).toString()).toBe("16000.00 USD");
    expect(aging.total().toString()).toBe("31000.00 USD");
  });

  it("ignores documents that are no longer open", () => {
    const paid = new Invoice(
      InvoiceId.of("paid"),
      "INV/paid",
      PartyRef.unknown(),
      "outbound",
      day(2026, 1, 1),
      day(2026, 3, 1),
      Money.of(9_999, "USD"),
      Money.zero("USD"),
      "paid",
    );

    const aging = analyzer.analyze(ledgerOf(paid, open("a", day(2026, 6, 30), 200)), ASOF);
    expect(aging.total().toString()).toBe("200.00 USD");
  });

  it("always returns all five buckets, so an empty one is still an answer", () => {
    const aging = analyzer.analyze(InvoiceLedger.empty("EUR"), ASOF);

    expect(aging.buckets.map((bucket) => bucket.label)).toEqual([
      "current",
      "1-30",
      "31-60",
      "61-90",
      "90+",
    ]);
    expect(aging.total().equals(Money.zero("EUR"))).toBe(true);
    expect(aging.bucket("nonsense")).toBeNull();
  });
});
