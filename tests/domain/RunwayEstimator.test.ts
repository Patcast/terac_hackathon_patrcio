import { describe, expect, it } from "vitest";

import { AccountRef, ClientId } from "../../src/domain/model/Ids.js";
import { BookParts } from "../../src/domain/model/BookPart.js";
import { CashPosition } from "../../src/domain/model/book/CashPosition.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month, MonthIndex } from "../../src/domain/model/Month.js";
import { MonthlyBook } from "../../src/domain/model/MonthlyBook.js";
import { MonthlyTotal, TrailingMonths } from "../../src/domain/model/book/TrailingMonths.js";
import { RunwayEstimator } from "../../src/domain/services/RunwayEstimator.js";

const JULY = Month.of(2026, 7);
const estimator = new RunwayEstimator();

const month = (index: MonthIndex, revenue: number, expenses: number): MonthlyTotal => ({
  month: Month.of(2026, index),
  revenue: Money.of(revenue, "USD"),
  expenses: Money.of(expenses, "USD"),
  net: Money.of(revenue - expenses, "USD"),
});

const cashOf = (amount: number): CashPosition =>
  new CashPosition(
    [{ account: AccountRef.of(1, "1000", "Bank"), balance: Money.of(amount, "USD") }],
    JULY.endsOn(),
    "USD",
  );

const bookOf = (parts: Partial<BookParts>): MonthlyBook =>
  MonthlyBook.assemble(ClientId.of("acme"), JULY, parts, [], new Date(Date.UTC(2026, 7, 20)), 10);

const burning = (): TrailingMonths =>
  new TrailingMonths(JULY, [month(5, 30_000, 35_000), month(6, 30_000, 35_000), month(7, 30_000, 35_000)], "USD");

describe("RunwayEstimator", () => {
  it("divides cash by the burn it can actually see", () => {
    const runway = estimator.estimate(bookOf({ cash: cashOf(60_000), trailing: burning() }));

    expect(runway?.months).toBe(12);
    expect(runway?.rounded()).toBe(12);
    expect(runway?.windowMonths).toBe(3);
    expect(runway?.monthlyBurn.toString()).toBe("5000.00 USD");
    expect(runway?.asOf.toISOString()).toBe("2026-07-31T23:59:59.999Z");
    expect(runway?.label()).toBe("~12 months at the last 3 months' burn");
  });

  it("rounds the months it reports to one decimal", () => {
    const runway = estimator.estimate(bookOf({ cash: cashOf(37_800), trailing: burning() }));
    expect(runway?.rounded()).toBe(7.6);
    expect(runway?.label()).toBe("~7.6 months at the last 3 months' burn");
  });

  it("honours a different window", () => {
    const runway = estimator.estimate(bookOf({ cash: cashOf(60_000), trailing: burning() }), 1);
    expect(runway?.months).toBe(12);
    expect(runway?.label()).toBe("~12 months at the last month's burn");
  });

  it("is null when the client is profitable", () => {
    const profitable = new TrailingMonths(
      JULY,
      [month(5, 40_000, 30_000), month(6, 40_000, 30_000), month(7, 40_000, 30_000)],
      "USD",
    );
    expect(estimator.estimate(bookOf({ cash: cashOf(60_000), trailing: profitable }))).toBeNull();
  });

  it("is null when there are fewer months than the window", () => {
    const thin = new TrailingMonths(JULY, [month(6, 30_000, 35_000), month(7, 30_000, 35_000)], "USD");
    expect(estimator.estimate(bookOf({ cash: cashOf(60_000), trailing: thin }))).toBeNull();
  });

  it("is null when the account is already overdrawn", () => {
    // "~-2.4 months" is arithmetically honest and useless — past zero the number
    // to say is cash and burn, not a duration.
    expect(estimator.estimate(bookOf({ cash: cashOf(-12_000), trailing: burning() }))).toBeNull();
    expect(estimator.estimate(bookOf({ cash: cashOf(0), trailing: burning() }))).toBeNull();
  });

  it("is null when either input is a gap", () => {
    expect(estimator.estimate(bookOf({ trailing: burning() }))).toBeNull();
    expect(estimator.estimate(bookOf({ cash: cashOf(60_000) }))).toBeNull();
    expect(estimator.estimate(bookOf({}))).toBeNull();
  });
});
