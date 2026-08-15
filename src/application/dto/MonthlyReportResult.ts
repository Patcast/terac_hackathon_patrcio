import type { CostSignal } from "../../domain/model/CostSignal.js";
import type { Invoice } from "../../domain/model/Invoice.js";
import type { Money } from "../../domain/model/Money.js";
import type { MonthlyBook } from "../../domain/model/MonthlyBook.js";
import type { ReviewNote } from "../../domain/model/ReviewNote.js";
import type { Runway } from "../../domain/model/Runway.js";
import type { WatchItem } from "../../domain/model/WatchItem.js";
import type { MonthlyTotal } from "../../domain/model/book/TrailingMonths.js";

/** One open customer invoice, already aged to month end. */
export interface ReceivableLine {
  party: string;
  number: string;
  outstanding: Money;
  daysOverdue: number;
}

/**
 * What the web brief needs, flattened out of the book — the `AnswerResult` of
 * the second surface (docs/architecture_phase1.md §9).
 *
 * Flattened for the same reason `AnswerResult` is: a presenter holding a
 * `MonthlyBook` starts reading parts out of it, and then which figure the page
 * shows is decided in `presentation/` where it cannot be tested against the
 * ledger. Domain *values* — `Money`, `Runway`, `WatchItem` — travel through
 * intact, because formatting them is precisely the presenter's job.
 *
 * Every field is nullable that can be missing, and none of them has a fallback.
 * A null tile renders as `—`; a zero would be a number we invented.
 */
export class MonthlyReportResult {
  private constructor(
    readonly companyName: string,
    readonly monthLabel: string,
    readonly monthKey: string,
    readonly currency: string,
    readonly asOf: Date,
    readonly documentCount: number,
    readonly gaps: readonly string[],
    /** Ended, but late bills and the bank rec may still land. */
    readonly settling: boolean,
    /** Not ended at all — the month is still running. */
    readonly partial: boolean,

    readonly revenue: Money | null,
    readonly expenses: Money | null,
    readonly net: Money | null,
    /** Fractions: 0.12 is +12%. Null when there is no month to compare with. */
    readonly revenueDeltaVsPriorMonth: number | null,
    readonly revenueDeltaVsLastYear: number | null,
    readonly cash: Money | null,
    readonly runway: Runway | null,

    readonly watch: WatchItem | null,
    readonly signals: readonly CostSignal[],

    readonly receivablesTotal: Money | null,
    readonly receivablesOverdue: Money | null,
    readonly overdueDays: number,
    readonly receivables: readonly ReceivableLine[],

    /** The trailing window, oldest first — the only series the page draws. */
    readonly trend: readonly MonthlyTotal[],

    readonly review: ReviewNote | null,
  ) {}

  /**
   * The one constructor. Takes the book and the things a domain service already
   * derived from it, so the use case stays a sequence of calls rather than a
   * place where figures get chosen.
   */
  static from(input: {
    book: MonthlyBook;
    watch: WatchItem | null;
    signals: readonly CostSignal[];
    runway: Runway | null;
    receivablesOverdue: Money | null;
    overdueDays: number;
    review: ReviewNote | null;
  }): MonthlyReportResult {
    const { book } = input;
    const pnl = book.pnl;
    const trailing = book.trailing;
    const receivables = book.openReceivables;

    return new MonthlyReportResult(
      book.company?.name ?? "",
      book.month.label(),
      book.month.key(),
      book.currency(),
      book.asOf(),
      book.documentCount(),
      book.gaps.map((gap) => gap.label()),
      book.settling,
      book.partial,

      pnl?.revenue() ?? null,
      pnl?.expenses() ?? null,
      pnl?.net() ?? null,
      trailing?.revenueDeltaVsPriorMonth() ?? null,
      trailing?.revenueDeltaVsLastYear() ?? null,
      book.cash?.total() ?? null,
      input.runway,

      input.watch,
      input.signals,

      receivables?.totalOutstanding() ?? null,
      input.receivablesOverdue,
      input.overdueDays,
      openLines(receivables?.documents ?? [], book.asOf()),

      trailing?.series() ?? [],

      input.review,
    );
  }
}

/**
 * The open documents, oldest debt first — which is also most-overdue first, and
 * the order the question "who still hasn't paid me" wants them in.
 */
function openLines(documents: readonly Invoice[], asOf: Date): ReceivableLine[] {
  return documents
    .filter((document) => document.isOpen())
    .sort((a, b) => b.daysOverdue(asOf) - a.daysOverdue(asOf))
    .map((document) => ({
      party: document.party.name,
      number: document.number,
      outstanding: document.outstanding,
      daysOverdue: document.daysOverdue(asOf),
    }));
}
