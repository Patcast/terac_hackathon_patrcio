import { describe, expect, it } from "vitest";

import type { BookRequest, LedgerReport } from "../../../src/adapters/outbound/accounting/LedgerReport.js";
import { MonthlyBookAssembler } from "../../../src/adapters/outbound/accounting/MonthlyBookAssembler.js";
import type { BookPart, BookParts } from "../../../src/domain/model/BookPart.js";
import { Tier } from "../../../src/domain/model/BookPart.js";
import { AccountRef } from "../../../src/domain/model/Ids.js";
import { InvoiceLedger } from "../../../src/domain/model/InvoiceLedger.js";
import { Money } from "../../../src/domain/model/Money.js";
import { CashPosition } from "../../../src/domain/model/book/CashPosition.js";
import { CompanyProfile } from "../../../src/domain/model/book/CompanyProfile.js";
import { ProfitAndLoss } from "../../../src/domain/model/book/ProfitAndLoss.js";
import { ACME, JULY_2026, StubClock, USD } from "../../support/books.js";

/**
 * Partial failure is the behaviour most likely to break in production and the
 * cheapest to test (docs/architecture_phase1.md §14). Three fake reports —
 * one succeeds, one throws, one hangs — cover it in milliseconds.
 */

class FakeReport<K extends BookPart> implements LedgerReport<K> {
  calls = 0;

  constructor(
    readonly part: K,
    readonly tier: Tier,
    private readonly behaviour: () => Promise<BookParts[K]>,
  ) {}

  run(_request: BookRequest): Promise<BookParts[K]> {
    this.calls += 1;
    return this.behaviour();
  }
}

function succeeds<K extends BookPart>(part: K, tier: Tier, value: BookParts[K]): FakeReport<K> {
  return new FakeReport(part, tier, async () => value);
}

function throws<K extends BookPart>(part: K, tier: Tier): FakeReport<K> {
  return new FakeReport(part, tier, async () => {
    throw new Error(`${part} blew up`);
  });
}

/** Never settles — no timer, so it can't keep the event loop alive after the test. */
function hangs<K extends BookPart>(part: K, tier: Tier): FakeReport<K> {
  return new FakeReport(part, tier, () => new Promise<BookParts[K]>(() => {}));
}

const pnl = new ProfitAndLoss(
  [
    { accountType: "income", amount: Money.of(80_000, USD) },
    { accountType: "expense", amount: Money.of(85_000, USD) },
  ],
  USD,
);
const cash = new CashPosition(
  [{ account: AccountRef.of(1, "101000", "Bank"), balance: Money.of(60_000, USD) }],
  JULY_2026.endsOn(),
  USD,
);
const receivables = InvoiceLedger.empty(USD);
const company = new CompanyProfile("Acme Ltd", USD, 12, 31);

function allRequired(): LedgerReport[] {
  return [
    succeeds("pnl", Tier.Required, pnl),
    succeeds("cash", Tier.Required, cash),
    succeeds("openReceivables", Tier.Required, receivables),
    succeeds("company", Tier.Required, company),
  ];
}

function assembler(reports: readonly LedgerReport[], perReportMs = 30): MonthlyBookAssembler {
  return new MonthlyBookAssembler(reports, new StubClock(), {
    concurrency: 6,
    perReportMs,
    trailingMonths: 12,
    settlingDays: 10,
  });
}

describe("MonthlyBookAssembler", () => {
  it("collects what succeeded and turns what failed into gaps", async () => {
    const book = await assembler([
      succeeds("pnl", Tier.Required, pnl),
      succeeds("cash", Tier.Required, cash),
      throws("tax", Tier.Standard),
      hangs("cashMovements", Tier.Optional),
    ]).assemble(ACME, JULY_2026);

    expect(book.pnl).toBe(pnl);
    expect(book.cash).toBe(cash);
    expect(book.tax).toBeNull();
    expect(book.cashMovements).toBeNull();

    expect(book.gaps).toHaveLength(2);
    expect(book.gaps.map((gap) => gap.part).sort()).toEqual(["cashMovements", "tax"]);
    // The tier travels with the gap — that's what lets the domain judge severity.
    expect(book.gaps.map((gap) => gap.tier).sort()).toEqual([Tier.Optional, Tier.Standard].sort());
  });

  it("leaves isUsable() false when a Required report fails", async () => {
    const reports = allRequired().filter((report) => report.part !== "cash");
    const book = await assembler([...reports, throws("cash", Tier.Required)]).assemble(ACME, JULY_2026);

    expect(book.isUsable()).toBe(false);
    expect(book.missingRequired()).toContain("cash");
    expect(book.gaps[0]?.isFatal()).toBe(true);
  });

  it("still answers when only an Optional report fails", async () => {
    const book = await assembler([...allRequired(), throws("balanceSheet", Tier.Optional)]).assemble(
      ACME,
      JULY_2026,
    );

    expect(book.isUsable()).toBe(true);
    expect(book.missingRequired()).toEqual([]);
    expect(book.gaps).toHaveLength(1);
    expect(book.gaps[0]?.isFatal()).toBe(false);
  });

  it("times out per report, so one hang doesn't eat the others' budget", async () => {
    const started = Date.now();
    const book = await assembler(
      [...allRequired(), hangs("tax", Tier.Standard), hangs("partners", Tier.Standard)],
      40,
    ).assemble(ACME, JULY_2026);

    // Two hangs at 40ms each: sequential timeouts would cost 80ms+, one budget costs ~40ms.
    expect(Date.now() - started).toBeLessThan(400);
    expect(book.isUsable()).toBe(true);
    expect(book.gaps).toHaveLength(2);
  });

  it("caps how many reports are in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = <K extends BookPart>(part: K, value: BookParts[K]): FakeReport<K> =>
      new FakeReport(part, Tier.Optional, async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return value;
      });

    const reports: LedgerReport[] = [
      ...allRequired(),
      slow("pnl", pnl),
      slow("cash", cash),
      slow("openReceivables", receivables),
      slow("company", company),
    ];

    await new MonthlyBookAssembler(reports, new StubClock(), { concurrency: 2 }).assemble(ACME, JULY_2026);

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("passes every report the same precomputed boundaries", async () => {
    const seen: BookRequest[] = [];
    const capturing: LedgerReport<"cash"> = {
      part: "cash",
      tier: Tier.Required,
      run: async (request) => {
        seen.push(request);
        return cash;
      },
    };

    await new MonthlyBookAssembler([capturing], new StubClock(), { trailingMonths: 12 }).assemble(
      ACME,
      JULY_2026,
      7,
    );

    const request = seen[0];
    expect(request).toBeDefined();
    expect(request?.asOf.getTime()).toBe(JULY_2026.endsOn().getTime());
    expect(request?.period.fromIso()).toBe(JULY_2026.period().fromIso());
    expect(request?.trailingMonths).toBe(12);
    expect(request?.companyId).toBe(7);
  });
});
