import { UnparseableMonthError } from "../errors/DomainError.js";
import { addDays, isoDate, Period } from "./Period.js";

export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The spellings that count as naming a month: the full name and its three-letter
 * abbreviation, plus `sept`, which people write and `sep` would not match.
 *
 * Deliberately **not** a `mar[a-z]*`-style prefix glob. `parse` is handed the
 * whole inbound message, and a glob makes "how is marketing doing?" resolve to
 * March and "should I decide on the hire?" to December — an answer about the
 * wrong month, delivered confidently. Exact spellings cost nothing and close it.
 */
const SPELLINGS = NAMES.map((name) => {
  const full = name.toLowerCase();
  const forms = full === "september" ? [full, "sept", "sep"] : [full, full.slice(0, 3)];
  return forms.join("|");
}).join("|");

/**
 * The input that defines everything (docs/architecture_phase1.md §3).
 *
 * A month is a domain type rather than two loose ints because the moment
 * `year` and `m` travel separately, an adapter builds an off-by-one range and
 * the P&L is wrong by a day at each end. February, 30-day months and leap years
 * make that likelier than it was with quarters — so there is one class, one set
 * of boundary tests, and `endsOn()` used everywhere as the as-of date.
 */
export class Month {
  private constructor(
    readonly year: number,
    readonly index: MonthIndex,
  ) {}

  static of(year: number, index: MonthIndex): Month {
    if (!Number.isInteger(year)) throw new TypeError(`Month.of: bad year ${year}`);
    return new Month(year, index);
  }

  static containing(date: Date): Month {
    return new Month(date.getUTCFullYear(), (date.getUTCMonth() + 1) as MonthIndex);
  }

  /**
   * The most recent month whose books have settled — the default when the
   * client names no month at all. Not merely *ended*: see `isSettled`.
   */
  static lastClosed(now: Date, settlingDays: number): Month {
    let candidate = Month.containing(now).previous();
    while (!candidate.isSettled(now, settlingDays)) candidate = candidate.previous();
    return candidate;
  }

  /**
   * Which period the client meant — a product rule, so it lives in domain and
   * the inbound adapter only calls it (§3).
   *
   * Handles `2026-07`, `July 2026`, `Jul`, `last month`, `this month`. A bare
   * month name means the most recent one that has ended, so in August 2026
   * "July" is 2026-07 and "September" is 2025-09.
   */
  static parse(text: string, now: Date): Month | null {
    const input = text.toLowerCase();

    if (/\b(last|previous|past)\s+month\b/.test(input)) {
      return Month.containing(now).previous();
    }
    if (/\b(this|current)\s+month\b/.test(input)) return Month.containing(now);

    const numeric = /\b(\d{4})[-/](0?[1-9]|1[0-2])\b/.exec(input);
    if (numeric?.[1] !== undefined && numeric[2] !== undefined) {
      return new Month(Number(numeric[1]), Number(numeric[2]) as MonthIndex);
    }

    const named = new RegExp(`\\b(${SPELLINGS})\\b\\.?\\s*(\\d{4})?`, "i").exec(input);
    if (!named?.[1]) return null;

    const stem = named[1].slice(0, 3).toLowerCase();
    const index = (NAMES.findIndex((name) => name.slice(0, 3).toLowerCase() === stem) +
      1) as MonthIndex;

    if (named[2]) return new Month(Number(named[2]), index);

    // Bare name: the most recent one that has ended.
    const thisYear = new Month(now.getUTCFullYear(), index);
    return thisYear.hasEnded(now) ? thisYear : new Month(now.getUTCFullYear() - 1, index);
  }

  /** Throwing variant, for callers that have already decided a month is required. */
  static require(text: string, now: Date): Month {
    const month = Month.parse(text, now);
    if (!month) throw new UnparseableMonthError(text);
    return month;
  }

  period(): Period {
    return Period.of(this.startsOn(), this.endsOn());
  }

  startsOn(): Date {
    return new Date(Date.UTC(this.year, this.index - 1, 1));
  }

  /**
   * The last instant of the month, UTC — and the as-of date for every
   * point-in-time figure in the book. `Date.UTC(y, m, 0)` is the last day of
   * month `m`, which is how leap years and 30-day months take care of
   * themselves rather than needing a table.
   */
  endsOn(): Date {
    return new Date(Date.UTC(this.year, this.index, 0, 23, 59, 59, 999));
  }

  /** `YYYY-MM-DD` of the last day — what an Odoo `date <=` filter wants. */
  endsOnIso(): string {
    return isoDate(this.endsOn());
  }

  previous(): Month {
    return this.index === 1
      ? new Month(this.year - 1, 12)
      : new Month(this.year, (this.index - 1) as MonthIndex);
  }

  next(): Month {
    return this.index === 12
      ? new Month(this.year + 1, 1)
      : new Month(this.year, (this.index + 1) as MonthIndex);
  }

  sameMonthLastYear(): Month {
    return new Month(this.year - 1, this.index);
  }

  /** `n` months back from here, counting this one — the window for report 6. */
  trailing(n: number): Period {
    if (n < 1) throw new RangeError(`Month.trailing: ${n} months`);
    let first: Month = this;
    for (let i = 1; i < n; i += 1) first = first.previous();
    return Period.of(first.startsOn(), this.endsOn());
  }

  /** The months in `trailing(n)`, oldest first. */
  trailingMonths(n: number): Month[] {
    const months: Month[] = [];
    let cursor: Month = this;
    for (let i = 0; i < n; i += 1) {
      months.unshift(cursor);
      cursor = cursor.previous();
    }
    return months;
  }

  hasEnded(now: Date): boolean {
    return now.getTime() > this.endsOn().getTime();
  }

  /**
   * Ended *and* the books have stopped moving.
   *
   * On 1 August the July books have ended; they have not settled — late vendor
   * bills, the bank rec and payroll accruals land over the following week or so.
   * This is what gates caching forever and what `lastClosed` defaults to, so the
   * monthly close-out never goes out on a half-posted ledger (§3).
   */
  isSettled(now: Date, settlingDays: number): boolean {
    return now.getTime() > addDays(this.endsOn(), settlingDays).getTime();
  }

  /** How many days until this month settles; 0 once it has. */
  daysUntilSettled(now: Date, settlingDays: number): number {
    const remaining = addDays(this.endsOn(), settlingDays).getTime() - now.getTime();
    return remaining <= 0 ? 0 : Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }

  label(): string {
    return `${NAMES[this.index - 1]} ${this.year}`;
  }

  /** `2026-07` — the cache key and the machine-readable form. */
  key(): string {
    return `${this.year}-${String(this.index).padStart(2, "0")}`;
  }

  equals(other: Month): boolean {
    return this.year === other.year && this.index === other.index;
  }

  /** Negative when this month is earlier — orders a trailing series. */
  compareTo(other: Month): number {
    return this.year !== other.year ? this.year - other.year : this.index - other.index;
  }

  toString(): string {
    return this.key();
  }
}
