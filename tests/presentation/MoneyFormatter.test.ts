import { describe, expect, it } from "vitest";
import { Money } from "../../src/domain/model/Money.js";
import { MoneyFormatter } from "../../src/presentation/presenters/MoneyFormatter.js";

const money = new MoneyFormatter();

describe("MoneyFormatter", () => {
  it("formats USD with the separators a US reader expects", () => {
    expect(money.format(Money.of(12_340, "USD"))).toBe("$12,340.00");
  });

  it("formats EUR with the separators a European reader expects", () => {
    expect(money.format(Money.of(12_340, "EUR"))).toBe("€12.340,00");
  });

  it("puts the sign outside the symbol, which is how a negative net reads at a glance", () => {
    expect(money.format(Money.of(-4_100.5, "USD"))).toBe("-$4,100.50");
  });

  it("prints zero rather than nothing", () => {
    expect(money.format(Money.zero("USD"))).toBe("$0.00");
    expect(money.format(Money.zero("EUR"))).toBe("€0,00");
  });

  it("falls back to the currency code rather than guessing a symbol", () => {
    expect(money.format(Money.of(1_000, "MXN"))).toBe("MXN 1,000.00");
  });

  it("formats a date the way the footer prints it", () => {
    expect(money.formatDate(new Date("2026-07-31T23:59:59.999Z"))).toBe("31 Jul 2026");
  });

  it("keeps the as-of date in UTC, so a late-evening instant is not yesterday", () => {
    expect(money.formatDate(new Date("2026-07-31T00:30:00.000Z"))).toBe("31 Jul 2026");
  });

  it("signs a percentage, except zero", () => {
    expect(money.percent(0.12)).toBe("+12%");
    expect(money.percent(-0.18)).toBe("-18%");
    expect(money.percent(0)).toBe("0%");
  });
});
