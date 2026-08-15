import { describe, expect, it } from "vitest";
import { FixtureBookRepository } from "../../../src/adapters/outbound/odoo/fixtures/FixtureBookRepository.js";
import { DEMO_CLIENT_ID } from "../../../src/adapters/outbound/odoo/fixtures/demoBook.js";
import { Month } from "../../../src/domain/model/Month.js";
import { RunwayEstimator } from "../../../src/domain/services/RunwayEstimator.js";
import { AgingAnalyzer } from "../../../src/domain/services/AgingAnalyzer.js";

const july = Month.of(2026, 7);
const repository = new FixtureBookRepository();

/** Book parts are nullable by design; the fixture's are not, and that is the claim. */
function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`fixture book has no ${what}`);
  return value;
}

describe("FixtureBookRepository — the offline demo", () => {
  it("produces a usable book with documents in it", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);

    expect(book.isUsable()).toBe(true);
    expect(book.missingRequired()).toEqual([]);
    expect(book.gaps).toEqual([]);
    expect(book.documentCount()).toBeGreaterThan(0);
    expect(book.currency()).toBe("EUR");
  });

  it("reads as a settled month rather than one still moving", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    expect(book.settling).toBe(false);
    expect(book.partial).toBe(false);
  });

  it("carries a receivable more than 60 days overdue — beat 4's whole point", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const receivables = present(book.openReceivables, "open receivables");
    const past60 = receivables
      .overdue(book.asOf())
      .filter((invoice) => invoice.daysOverdue(book.asOf()) > 60);

    expect(past60.length).toBeGreaterThan(0);
    expect(past60[0]?.party.name).toBe("Northwind Systems");
    expect(past60[0]?.outstanding.toMajor()).toBe(18_400);

    const aging = new AgingAnalyzer().analyze(receivables, book.asOf());
    expect(aging.over(60).toMajor()).toBe(18_400);
  });

  it("keeps billed and outstanding apart — one receivable is part-paid", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const receivables = present(book.openReceivables, "open receivables");
    expect(receivables.totalBilled().toMajor()).toBeGreaterThan(
      receivables.totalOutstanding().toMajor(),
    );
    expect(receivables.totalOutstanding().toMajor()).toBe(44_708);
  });

  it("agrees with itself: the P&L is the last row of the trailing series", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const anchor = book.trailing?.current();

    expect(book.pnl?.revenue().toMajor()).toBe(68_200);
    expect(anchor?.revenue.toMajor()).toBe(68_200);
    expect(anchor?.net.toMajor()).toBe(book.pnl?.net().toMajor());
  });

  it("has a story in it: revenue down on the prior month and on last year", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const trailing = present(book.trailing, "trailing series");

    expect(trailing.revenueDeltaVsPriorMonth()).toBeLessThan(0);
    expect(trailing.sameMonthLastYear()).not.toBeNull();
    expect(trailing.revenueDeltaVsLastYear()).toBeLessThan(0);
  });

  it("supports a runway figure of roughly seven months", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const runway = new RunwayEstimator().estimate(book, 3);

    expect(runway).not.toBeNull();
    expect(runway?.rounded()).toBeGreaterThan(6);
    expect(runway?.rounded()).toBeLessThan(8);
  });

  it("concentrates about 40% of revenue on one customer", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const top = book.partnerRevenue?.concentration();

    expect(top?.party.name).toBe("Northwind Systems");
    expect(top?.share).toBeGreaterThan(0.35);
    expect(top?.share).toBeLessThan(0.45);
  });

  it("accrues VAT the tax beat can quote", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const tax = present(book.tax, "tax summary");

    expect(tax.charged().toMajor()).toBe(14_052);
    expect(tax.reclaimable().toMajor()).toBe(7_479);
    expect(tax.netPayable().toMajor()).toBe(6_573);
  });

  it("answers for any month, because the demo offers to pull June and May", async () => {
    const june = await repository.getMonthlyBook(DEMO_CLIENT_ID, Month.of(2026, 6));
    expect(june.isUsable()).toBe(true);
    expect(june.month.key()).toBe("2026-06");
    expect(june.asOf().toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("is deterministic — the same month twice is the same numbers", async () => {
    const first = await new FixtureBookRepository().getMonthlyBook(DEMO_CLIENT_ID, july);
    const second = await new FixtureBookRepository().getMonthlyBook(DEMO_CLIENT_ID, july);

    expect(second.documentCount()).toBe(first.documentCount());
    expect(second.cash?.total().toMajor()).toBe(first.cash?.total().toMajor());
    expect([...second.knownInvoiceIds()]).toEqual([...first.knownInvoiceIds()]);
  });

  it("clamps a day-29 date into February rather than spilling into March", async () => {
    const february = await repository.getMonthlyBook(DEMO_CLIENT_ID, Month.of(2027, 2));
    for (const line of february.cashMovements?.largestLines ?? []) {
      expect(line.date.getUTCMonth()).toBe(1);
    }
  });
  it("reconciles the per-cost history against the account-type series, to the euro", async () => {
    // Both tables go into the same prompt. If March's cost lines do not add up
    // to March's expense total, the model is reading a contradiction — and the
    // one it points out on stage will be the fixture's, not the client's.
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const trailing = present(book.trailing, "trailing months");
    const byCategory = present(book.trailingByCategory, "trailing by category");

    for (const month of trailing.series()) {
      const expenses = byCategory
        .expenses()
        .reduce((total, series) => total + (series.at(month.month)?.toMajor() ?? 0), 0);
      const revenue = byCategory
        .income()
        .reduce((total, series) => total + (series.at(month.month)?.toMajor() ?? 0), 0);

      expect(expenses).toBeCloseTo(month.expenses.toMajor(), 2);
      expect(revenue).toBeCloseTo(month.revenue.toMajor(), 2);
    }
  });

  it("carries the two shapes beats 2 and 3 are written about", async () => {
    const byCategory = present(
      (await repository.getMonthlyBook(DEMO_CLIENT_ID, july)).trailingByCategory,
      "trailing by category",
    );

    // An annual premium booked whole into July: one month of thirteen. Calling
    // this a problem is the failure mode monthly reporting is prone to.
    const insurance = byCategory.expenses().find((s) => s.account.name === "Insurance");
    expect(insurance?.monthsWithActivity()).toBe(1);

    // And a real trend to put beside it: three consecutive rises, no more.
    const payroll = byCategory.expenses().find((s) => s.account.name === "Payroll");
    expect(payroll?.risingStreak()).toBe(3);
    expect(payroll?.latest().toMajor()).toBe(46_800);

    // The licence renewal reads as a spike against its own baseline.
    expect(byCategory.spikes(2, 6).map((s) => s.account.name)).toEqual(["Software & Tooling"]);
  });

  it("matches the anchor month's trial balance line for line", async () => {
    const book = await repository.getMonthlyBook(DEMO_CLIENT_ID, july);
    const byCategory = present(book.trailingByCategory, "trailing by category");

    for (const line of present(book.trialBalance, "trial balance").lines) {
      const series = byCategory.categories.find((s) => s.account.code === line.account.code);
      if (!series) continue; // balance-sheet accounts have no P&L history
      expect(series.latest().toMajor()).toBeCloseTo(line.movement.toMajor(), 2);
    }
  });
});
