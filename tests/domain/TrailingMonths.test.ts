import { describe, expect, it } from "vitest";

import { Month } from "../../src/domain/model/Month.js";
import { Money } from "../../src/domain/model/Money.js";
import { MonthlyTotal, TrailingMonths } from "../../src/domain/model/book/TrailingMonths.js";

const JULY = Month.of(2026, 7);

/** Revenue and expenses both positive; net is the subtraction — see ProfitAndLoss. */
const total = (month: Month, revenue: number, expenses: number): MonthlyTotal => ({
  month,
  revenue: Money.of(revenue, "USD"),
  expenses: Money.of(expenses, "USD"),
  net: Money.of(revenue - expenses, "USD"),
});

const series = (...totals: MonthlyTotal[]): TrailingMonths =>
  new TrailingMonths(JULY, totals, "USD");

describe("TrailingMonths.averageBurn", () => {
  it("is null when the client is profitable", () => {
    const trailing = series(
      total(Month.of(2026, 5), 50_000, 40_000),
      total(Month.of(2026, 6), 50_000, 40_000),
      total(JULY, 50_000, 40_000),
    );

    expect(trailing.averageNet(3)?.toString()).toBe("10000.00 USD");
    expect(trailing.averageBurn(3)).toBeNull();
  });

  it("is null at break-even — there is no runway to divide by zero burn", () => {
    const trailing = series(
      total(Month.of(2026, 6), 40_000, 40_000),
      total(JULY, 40_000, 40_000),
    );

    expect(trailing.averageNet(2)?.isZero()).toBe(true);
    expect(trailing.averageBurn(2)).toBeNull();
  });

  it("is null when fewer than n months are held", () => {
    const trailing = series(total(Month.of(2026, 6), 10_000, 20_000), total(JULY, 10_000, 20_000));

    expect(trailing.averageNet(3)).toBeNull();
    expect(trailing.averageBurn(3)).toBeNull();
    // Two months of history still answers a two-month question.
    expect(trailing.averageBurn(2)?.toString()).toBe("10000.00 USD");
  });

  it("returns a positive burn from a negative average net", () => {
    const trailing = series(
      total(Month.of(2026, 5), 30_000, 31_000),
      total(Month.of(2026, 6), 30_000, 32_000),
      total(JULY, 30_000, 33_000),
    );

    expect(trailing.averageNet(3)?.toString()).toBe("-2000.00 USD");
    const burn = trailing.averageBurn(3);
    expect(burn?.isPositive()).toBe(true);
    expect(burn?.toString()).toBe("2000.00 USD");
  });

  it("averages only the n months up to the anchor, ignoring older history", () => {
    const trailing = series(
      total(Month.of(2026, 1), 0, 90_000), // a disaster, long before the window
      total(Month.of(2026, 5), 30_000, 31_000),
      total(Month.of(2026, 6), 30_000, 32_000),
      total(JULY, 30_000, 33_000),
    );

    expect(trailing.averageBurn(3)?.toString()).toBe("2000.00 USD");
  });

  it("rejects a window that isn't a whole number of months", () => {
    const trailing = series(total(Month.of(2026, 6), 1, 2), total(JULY, 1, 2));
    expect(trailing.averageNet(0)).toBeNull();
    expect(trailing.averageNet(2.5)).toBeNull();
  });
});

describe("TrailingMonths lookups and deltas", () => {
  const trailing = series(
    total(Month.of(2025, 7), 20_000, 10_000),
    total(Month.of(2026, 6), 40_000, 10_000),
    total(JULY, 50_000, 10_000),
  );

  it("finds the anchor, the prior month and the same month last year", () => {
    expect(trailing.current()?.month.key()).toBe("2026-07");
    expect(trailing.priorMonth()?.month.key()).toBe("2026-06");
    expect(trailing.sameMonthLastYear()?.month.key()).toBe("2025-07");
    expect(trailing.at(Month.of(2026, 3))).toBeNull();
  });

  it("expresses revenue movement as a fraction", () => {
    expect(trailing.revenueDeltaVsPriorMonth()).toBeCloseTo(0.25);
    expect(trailing.revenueDeltaVsLastYear()).toBeCloseTo(1.5);
  });

  it("is null rather than infinite when the baseline had no revenue", () => {
    const fromZero = series(total(Month.of(2026, 6), 0, 5_000), total(JULY, 10_000, 5_000));
    expect(fromZero.revenueDeltaVsPriorMonth()).toBeNull();
    expect(fromZero.revenueDeltaVsLastYear()).toBeNull();
  });

  it("returns the series oldest first whatever order it was built in", () => {
    const shuffled = series(
      total(JULY, 1, 1),
      total(Month.of(2025, 7), 1, 1),
      total(Month.of(2026, 6), 1, 1),
    );
    expect(shuffled.series().map((entry) => entry.month.key())).toEqual([
      "2025-07",
      "2026-06",
      "2026-07",
    ]);
  });
});
