import { describe, expect, it } from "vitest";

import { Money } from "../../src/domain/model/Money.js";
import { CurrencyMismatchError } from "../../src/domain/errors/DomainError.js";

describe("Money", () => {
  it("refuses to combine currencies", () => {
    const dollars = Money.of(100, "USD");
    const euros = Money.of(100, "EUR");

    expect(() => dollars.plus(euros)).toThrow(CurrencyMismatchError);
    expect(() => dollars.minus(euros)).toThrow(CurrencyMismatchError);
    expect(() => dollars.compareTo(euros)).toThrow(CurrencyMismatchError);
    expect(() => dollars.dividedBy(euros)).toThrow(CurrencyMismatchError);
    expect(() => Money.sum([euros], "USD")).toThrow(CurrencyMismatchError);
  });

  it("rounds to the minor unit once, at the boundary", () => {
    expect(Money.of(12.345, "USD").amountMinor).toBe(1235);
    expect(Money.of(-4200, "USD").amountMinor).toBe(-420_000);
    // Odoo hands back floats, so the rounding has to survive their artefacts.
    expect(Money.of(0.1, "USD").plus(Money.of(0.2, "USD")).amountMinor).toBe(30);
    expect(Money.minor(100, "USD").times(1 / 3).amountMinor).toBe(33);
  });

  it("normalises the currency code", () => {
    expect(Money.of(1, " usd ").currency).toBe("USD");
    expect(Money.of(1, "usd").equals(Money.of(1, "USD"))).toBe(true);
  });

  it("sums an empty list to zero in the stated currency", () => {
    const empty = Money.sum([], "EUR");
    expect(empty.isZero()).toBe(true);
    expect(empty.currency).toBe("EUR");
    expect(empty.equals(Money.zero("EUR"))).toBe(true);
  });

  it("divides into a unitless ratio and refuses a zero divisor", () => {
    expect(Money.of(60_000, "USD").dividedBy(Money.of(5_000, "USD"))).toBe(12);
    expect(() => Money.of(1, "USD").dividedBy(Money.zero("USD"))).toThrow(RangeError);
  });

  it("rejects a non-finite amount rather than carrying a NaN forward", () => {
    expect(() => Money.of(Number.NaN, "USD")).toThrow(TypeError);
    expect(() => Money.of(Number.POSITIVE_INFINITY, "USD")).toThrow(TypeError);
  });
});
