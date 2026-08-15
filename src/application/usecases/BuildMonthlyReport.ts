import { Month } from "../../domain/model/Month.js";
import type { AgingAnalyzer } from "../../domain/services/AgingAnalyzer.js";
import type { HighlightSelector } from "../../domain/services/HighlightSelector.js";
import type { RunwayEstimator } from "../../domain/services/RunwayEstimator.js";
import { MonthlyReportResult } from "../dto/MonthlyReportResult.js";
import type { MonthlyReportCommand } from "../dto/MonthlyReportCommand.js";
import type { AccountingRepository } from "../ports/driven/AccountingRepository.js";
import type { Clock } from "../ports/driven/Clock.js";
import type { ReviewNotes } from "../ports/driven/ReviewNotes.js";

/**
 * The brief, assembled — the second use case, and deliberately the *shape* of
 * the first (docs/architecture_phase1.md §8).
 *
 * Read it next to `AnswerMonthlyQuestion` and the only differences are that this
 * one asks domain services for structure instead of asking Claude for prose, and
 * that it looks for an expert's note. Same repository, same book, same runway
 * arithmetic, same month-resolution rule — so the page and the thread cannot
 * report different numbers for the same month, which is the entire premise of
 * one URL both the owner and the CFO open.
 *
 * No model call. Everything here is arithmetic over the book, which is why the
 * page loads in the time one Odoo assembly takes and works with no API key at
 * all.
 */
export class BuildMonthlyReport {
  constructor(
    private readonly accounting: AccountingRepository,
    private readonly runway: RunwayEstimator,
    private readonly highlights: HighlightSelector,
    private readonly aging: AgingAnalyzer,
    private readonly reviews: ReviewNotes,
    private readonly clock: Clock,
    private readonly settlingDays: number,
  ) {}

  async execute(cmd: MonthlyReportCommand): Promise<MonthlyReportResult> {
    const month = cmd.month ?? Month.lastClosed(this.clock.now(), this.settlingDays);

    const book = await this.accounting.getMonthlyBook(cmd.clientId, month);

    // Aged to month end, never to now — the brief describes a closed month, and
    // a page that re-ages on every refresh would show a different figure each
    // time the CFO reloaded it mid-call.
    const receivables = book.openReceivables;
    const overdueDays = this.highlights.thresholds.overdueDays;
    const overdue =
      receivables === null ? null : this.aging.analyze(receivables, book.asOf()).over(overdueDays);

    return MonthlyReportResult.from({
      book,
      watch: this.highlights.watchItem(book),
      signals: this.highlights.costSignals(book),
      runway: this.runway.estimate(book),
      receivablesOverdue: overdue,
      overdueDays,
      // Null when no human has reviewed this month. Never backfilled with the
      // agent's own take — see the port.
      review: await this.reviews.find(cmd.clientId, month),
    });
  }
}
