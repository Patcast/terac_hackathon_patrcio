import type { Currency, Money } from "../../domain/model/Money.js";

/** Symbol and separators per currency. Anything unlisted falls back to the code. */
interface CurrencyStyle {
  symbol: string;
  /** The locale whose grouping/decimal marks that currency's readers expect. */
  locale: string;
}

const STYLES: Readonly<Record<string, CurrencyStyle>> = {
  USD: { symbol: "$", locale: "en-US" },
  EUR: { symbol: "€", locale: "de-DE" },
  GBP: { symbol: "£", locale: "en-GB" },
  CAD: { symbol: "CA$", locale: "en-CA" },
  AUD: { symbol: "A$", locale: "en-AU" },
  CHF: { symbol: "CHF ", locale: "de-CH" },
};

/**
 * Turns domain values into the strings a client reads in a message.
 *
 * It lives in `presentation/` rather than on `Money` because how a number looks
 * is a property of the surface, not of the amount: the same `Money` prints as
 * `$12,340.00` here and as `12340.00 USD` in the Claude prompt, where grouping
 * marks are tokens spent on nothing.
 */
export class MoneyFormatter {
  /**
   * `$12,340.00` / `€12.340,00` — symbol first, separators per currency.
   *
   * The sign goes outside the symbol (`-$400.00`), which is how a founder reads
   * a negative net at a glance; accounting parentheses would be ambiguous in a
   * one-line text message.
   */
  format(money: Money): string {
    const style = STYLES[money.currency.toUpperCase()];
    const digits = this.digits(Math.abs(money.toMajor()), style?.locale ?? "en-US");
    const prefix = style?.symbol ?? `${money.currency.toUpperCase()} `;
    return `${money.isNegative() ? "-" : ""}${prefix}${digits}`;
  }

  /**
   * `€68,200` — whole units, no cents.
   *
   * For a dashboard tile, where the cents are three characters of noise on a
   * figure being read at a glance from across a room. Never for a document
   * amount: an invoice line that renders as `€3,751` when the client owes
   * `€3,751.00` is a rounding the reader can't see and might act on.
   */
  formatWhole(money: Money): string {
    const style = STYLES[money.currency.toUpperCase()];
    const rounded = Math.round(Math.abs(money.toMajor()));
    const digits = new Intl.NumberFormat(style?.locale ?? "en-US", {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(rounded);
    const prefix = style?.symbol ?? `${money.currency.toUpperCase()} `;
    return `${money.isNegative() ? "-" : ""}${prefix}${digits}`;
  }

  /** `31 Jul 2026` — UTC, because every as-of date in the book is a UTC instant. */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  /** `+12%` / `-18%` from a fraction; `0%` unsigned, since a signed zero reads as noise. */
  percent(fraction: number): string {
    const whole = Math.round(fraction * 100);
    if (whole === 0) return "0%";
    return `${whole > 0 ? "+" : "-"}${Math.abs(whole)}%`;
  }

  /** Currency code only — for a label where the amount appears separately. */
  code(currency: Currency): string {
    return currency.toUpperCase();
  }

  private digits(major: number, locale: string): string {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(major);
  }
}
