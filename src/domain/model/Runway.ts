import { Money } from "./Money.js";

/**
 * How long the cash lasts at the burn we have actually seen.
 *
 * It carries its own `asOf` and `windowMonths` because the number alone is
 * indefensible: "~7 months" is a claim, "~7 months at your last 3 months' burn,
 * as of 31 Jul" is an arithmetic result the client can check. Backward-looking
 * arithmetic, never a forecast — projection is Phase 2
 * (docs/architecture_phase1.md §5, §15).
 */
export class Runway {
  private constructor(
    readonly months: number,
    readonly asOf: Date,
    readonly windowMonths: number,
    readonly monthlyBurn: Money,
  ) {}

  /**
   * `of`, not `months(...)` — §5's sketch names the factory `months`, which
   * collides with the property of the same name. The one deliberate deviation
   * from the doc's illustrative code.
   */
  static of(months: number, asOf: Date, windowMonths: number, monthlyBurn: Money): Runway {
    return new Runway(months, new Date(asOf.getTime()), windowMonths, monthlyBurn);
  }

  /** One decimal: the precision the arithmetic actually supports. */
  rounded(): number {
    return Math.round(this.months * 10) / 10;
  }

  label(): string {
    const window =
      this.windowMonths === 1 ? "last month's burn" : `last ${this.windowMonths} months' burn`;
    return `~${this.rounded()} months at the ${window}`;
  }
}
