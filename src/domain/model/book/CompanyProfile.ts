import { MonthIndex } from "../Month.js";
import { Currency } from "../Money.js";

/**
 * One row from `res.company` — and the book's authority on currency, which is
 * why it is a Required part rather than a nicety.
 *
 * The fiscal year end is carried because a client whose year ends in March
 * reads "this year so far" differently, and Phase 1 would rather say nothing
 * about the year than say the calendar one.
 */
export class CompanyProfile {
  constructor(
    readonly name: string,
    readonly currency: Currency,
    readonly fiscalYearLastMonth: MonthIndex,
    readonly fiscalYearLastDay: number,
  ) {}

  usesCalendarFiscalYear(): boolean {
    return this.fiscalYearLastMonth === 12 && this.fiscalYearLastDay === 31;
  }
}
