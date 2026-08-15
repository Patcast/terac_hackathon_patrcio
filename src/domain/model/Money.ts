import { CurrencyMismatchError } from "../errors/DomainError.js";

/** ISO 4217 code, uppercased. Kept as a string — Phase 1 has no currency table. */
export type Currency = string;

/**
 * An amount of money as integer minor units plus a currency.
 *
 * **Never a `number`** (docs/architecture_phase1.md §5). Floats accumulate the
 * kind of error that shows up as a P&L that misses by a cent on stage, and a
 * bare number silently sums dollars into euros. Both are cheap to prevent here
 * and expensive to find later.
 *
 * Odoo hands back major-unit floats (`-4200.0`), so `Money.of` is the mapper's
 * entry point and rounds once, at the boundary.
 */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: Currency,
  ) {}

  /** From major units — what Odoo returns. Rounds to the nearest minor unit. */
  static of(amount: number, currency: Currency): Money {
    if (!Number.isFinite(amount)) {
      throw new TypeError(`Money.of received a non-finite amount: ${amount}`);
    }
    return new Money(Math.round(amount * 100), normalize(currency));
  }

  /** From minor units — for arithmetic results and fixtures. */
  static minor(amountMinor: number, currency: Currency): Money {
    return new Money(Math.round(amountMinor), normalize(currency));
  }

  static zero(currency: Currency): Money {
    return new Money(0, normalize(currency));
  }

  /** Sums a list, keeping the currency check. Empty list needs the fallback. */
  static sum(values: readonly Money[], currency: Currency): Money {
    return values.reduce<Money>((total, value) => total.plus(value), Money.zero(currency));
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  times(factor: number): Money {
    return new Money(Math.round(this.amountMinor * factor), this.currency);
  }

  /** Ratio of two amounts — unitless, which is why it returns a number. */
  dividedBy(other: Money): number {
    this.assertSameCurrency(other);
    if (other.amountMinor === 0) throw new RangeError("Money.dividedBy: divisor is zero");
    return this.amountMinor / other.amountMinor;
  }

  negated(): Money {
    return new Money(-this.amountMinor, this.currency);
  }

  abs(): Money {
    return new Money(Math.abs(this.amountMinor), this.currency);
  }

  isZero(): boolean {
    return this.amountMinor === 0;
  }

  isNegative(): boolean {
    return this.amountMinor < 0;
  }

  isPositive(): boolean {
    return this.amountMinor > 0;
  }

  compareTo(other: Money): number {
    this.assertSameCurrency(other);
    return this.amountMinor - other.amountMinor;
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  /** Major units, for rendering only. Do not do arithmetic on the result. */
  toMajor(): number {
    return this.amountMinor / 100;
  }

  toString(): string {
    return `${this.toMajor().toFixed(2)} ${this.currency}`;
  }

  toJSON(): { amountMinor: number; currency: Currency } {
    return { amountMinor: this.amountMinor, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

function normalize(currency: Currency): Currency {
  return currency.trim().toUpperCase();
}
