import { describe, expect, it } from "vitest";

import { AccountRef } from "../../src/domain/model/Ids.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month } from "../../src/domain/model/Month.js";
import {
  CategorySeries,
  TrailingByCategory,
} from "../../src/domain/model/book/TrailingByCategory.js";

const JULY = Month.of(2026, 7);

/** `amounts` is oldest first and ends at the anchor. */
function series(code: string, name: string, type: string, amounts: number[]): CategorySeries {
  const window = JULY.trailingMonths(amounts.length);
  return new CategorySeries(
    AccountRef.of(code, code, name),
    type,
    JULY,
    window.map((month, i) => ({ month, amount: Money.of(amounts[i] ?? 0, "EUR") })),
    "EUR",
  );
}

const payroll = () =>
  series("6000", "Payroll", "expense", [42_000, 42_000, 42_600, 42_600, 42_600, 44_200, 45_500, 46_800]);

/** An annual premium booked whole into July: nothing in any other month. */
const insurance = () =>
  series("6600", "Insurance", "expense", [0, 0, 0, 0, 0, 0, 0, 1_400]);

describe("CategorySeries", () => {
  it("averages the months up to the anchor, and excludes the anchor when asked", () => {
    const rent = series("6200", "Rent", "expense", [5_000, 5_000, 5_000, 6_000]);

    expect(rent.average(4)?.toString()).toBe("5250.00 EUR");
    // The baseline a spike is judged against must not contain the spike.
    expect(rent.averageBefore(3)?.toString()).toBe("5000.00 EUR");
  });

  it("returns null rather than an average over fewer months than asked for", () => {
    expect(series("6200", "Rent", "expense", [5_000, 5_000]).average(6)).toBeNull();
  });

  it("counts the months a line actually moved — the one-off test", () => {
    // This is what separates an annual premium from a payroll run. Same shape of
    // number, opposite meaning, and nothing else in the book distinguishes them.
    expect(insurance().monthsWithActivity()).toBe(1);
    expect(payroll().monthsWithActivity()).toBe(8);
  });

  it("counts only the consecutive rises ending at the anchor", () => {
    // 42,600 · 42,600 · 44,200 · 45,500 · 46,800 → three rises, not four.
    expect(payroll().risingStreak()).toBe(3);
    expect(series("6200", "Rent", "expense", [5_000, 5_000, 5_000]).risingStreak()).toBe(0);
    // A fall at the anchor ends the streak even after a long climb.
    expect(series("6300", "Ads", "expense", [1_000, 2_000, 3_000, 500]).risingStreak()).toBe(0);
  });

  it("reads a month with no rows as zero spent, not as a missing month", () => {
    expect(insurance().at(Month.of(2026, 3))?.toString()).toBe("0.00 EUR");
    expect(insurance().latest().toString()).toBe("1400.00 EUR");
  });
});

describe("TrailingByCategory", () => {
  const book = () =>
    new TrailingByCategory(
      JULY,
      [
        payroll(),
        insurance(),
        series("6100", "Software", "expense", [4_200, 4_300, 4_400, 4_400, 4_500, 4_600, 4_500, 9_300]),
        series("4000", "Revenue", "income", [60_000, 61_000, 62_000, 63_000, 64_000, 65_000, 66_000, 68_200]),
      ],
      "EUR",
    );

  it("ranks categories by the money they carry", () => {
    expect(book().top(2).map((entry) => entry.account.name)).toEqual(["Revenue", "Payroll"]);
  });

  it("separates income from expense lines", () => {
    expect(book().expenses()).toHaveLength(3);
    expect(book().income()).toHaveLength(1);
  });

  it("finds the spike against each line's own prior average, not against the total", () => {
    const spikes = book().spikes(2, 6);

    // Software roughly doubles on a licence renewal; payroll rises but nowhere
    // near 2×, and income is never a spike candidate.
    expect(spikes.map((entry) => entry.account.name)).toEqual(["Software"]);
  });

  it("ignores a line too small to matter, however sharply it moved", () => {
    // Travel: zero most months, €900 in this one. Three times its own average
    // and still not worth an owner's attention.
    const lumpy = new TrailingByCategory(
      JULY,
      [payroll(), series("6400", "Travel", "expense", [0, 600, 0, 0, 900, 0, 0, 900])],
      "EUR",
    );

    expect(lumpy.spikes(2, 6)).toEqual([]);
  });

  it("does not call a line a spike when it has no history to spike against", () => {
    // Insurance is 1,400 against a prior average of zero — infinite by ratio,
    // and meaningless. It is a one-off, which `monthsWithActivity` says instead.
    expect(book().spikes(2, 6).map((entry) => entry.account.name)).not.toContain("Insurance");
  });
});
