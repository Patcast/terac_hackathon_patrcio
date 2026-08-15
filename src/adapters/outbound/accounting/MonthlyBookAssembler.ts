import type { Clock } from "../../../application/ports/driven/Clock.js";
import type { BookPart, BookParts } from "../../../domain/model/BookPart.js";
import { BookGap } from "../../../domain/model/BookGap.js";
import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import { MonthlyBook } from "../../../domain/model/MonthlyBook.js";
import type { BookRequest, LedgerReport } from "./LedgerReport.js";
import { mapWithConcurrency, withTimeout } from "./concurrency.js";

export interface AssemblerLimits {
  concurrency: number;
  perReportMs: number;
  trailingMonths: number;
  settlingDays: number;
}

/** Mirrors `phase1Config()`'s defaults so a bare `new` behaves like the wired one. */
const DEFAULT_LIMITS: AssemblerLimits = {
  concurrency: 6,
  perReportMs: 8_000,
  trailingMonths: 12,
  settlingDays: 10,
};

/**
 * The collector between the catalogue and the agent
 * (docs/architecture_phase1.md §7).
 *
 * **It never mentions a financial concept.** No `if (part === 'tax')`, no
 * ordering between reports, no knowledge of what any of them return. That is
 * the test of whether the collector is right: you could add a report about
 * inventory and not open this file.
 *
 * Three properties worth naming:
 *
 * - **Concurrency is capped.** Fifteen reports are fifteen HTTP requests, and
 *   firing all of them at a small Odoo instance is how you discover its worker
 *   pool. Six in flight completes the catalogue in about two round trips.
 * - **The timeout is per report, not global.** One slow report shouldn't eat the
 *   budget the other fourteen need.
 * - **`MonthlyBook.assemble` does the judging.** A failed report becomes a
 *   `BookGap`, never an exception; the domain decides what a missing Required
 *   part means for `isUsable()`.
 */
export class MonthlyBookAssembler {
  private readonly limits: AssemblerLimits;

  constructor(
    private readonly reports: readonly LedgerReport[],
    private readonly clock: Clock,
    limits: Partial<AssemblerLimits> = {},
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async assemble(clientId: ClientId, month: Month, companyId: number | null = null): Promise<MonthlyBook> {
    const request: BookRequest = {
      clientId,
      month,
      period: month.period(),
      asOf: month.endsOn(),
      trailingMonths: this.limits.trailingMonths,
      companyId,
    };

    const parts: Partial<BookParts> = {};
    const gaps: BookGap[] = [];

    await mapWithConcurrency(this.reports, this.limits.concurrency, async (report) => {
      try {
        await fill(parts, report, request, this.limits.perReportMs);
      } catch (error) {
        // One report failing is a gap, not an outage. The domain decides if it's fatal.
        gaps.push(BookGap.from(report.part, report.tier, error));
      }
    });

    return MonthlyBook.assemble(clientId, month, parts, gaps, this.clock.now(), this.limits.settlingDays);
  }
}

/**
 * Runs one report into its own slot. Generic in `K` purely so the write is
 * type-checked per report — inlined into `assemble` the key would widen to the
 * whole `BookPart` union and any part could land in any slot.
 */
async function fill<K extends BookPart>(
  parts: Partial<BookParts>,
  report: LedgerReport<K>,
  request: BookRequest,
  perReportMs: number,
): Promise<void> {
  parts[report.part] = await withTimeout(report.run(request), perReportMs);
}
