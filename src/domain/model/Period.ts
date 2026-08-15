/**
 * A closed date range, `from` and `to` inclusive.
 *
 * Everything is UTC. Odoo stores accounting dates as plain dates with no zone,
 * so a local-time `Date` is how a P&L quietly loses its first or last day
 * depending on which side of midnight the server sits.
 */
export class Period {
  private constructor(
    readonly from: Date,
    readonly to: Date,
  ) {}

  static of(from: Date, to: Date): Period {
    if (from.getTime() > to.getTime()) {
      throw new RangeError(`Period.of: ${from.toISOString()} is after ${to.toISOString()}`);
    }
    return new Period(new Date(from.getTime()), new Date(to.getTime()));
  }

  /** `YYYY-MM-DD`, which is the only date format an Odoo domain accepts. */
  fromIso(): string {
    return isoDate(this.from);
  }

  toIso(): string {
    return isoDate(this.to);
  }

  contains(date: Date): boolean {
    return date.getTime() >= this.from.getTime() && date.getTime() <= this.to.getTime();
  }

  /**
   * Whole calendar days, both ends inclusive.
   *
   * Counted between UTC midnights rather than by dividing the elapsed
   * milliseconds: `Month.endsOn()` is the last *instant* of the month, so naive
   * division adds a day and reports July as 32 days long.
   */
  days(): number {
    return (utcMidnight(this.to) - utcMidnight(this.from)) / DAY_MS + 1;
  }

  toString(): string {
    return `${this.fromIso()}…${this.toIso()}`;
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar date of an instant. The one date format that crosses a boundary. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
