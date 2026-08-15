import { BookGap } from "./BookGap.js";
import { BookPart } from "./BookPart.js";
import { ClientId } from "./Ids.js";
import { Month } from "./Month.js";
import { MonthlyBook } from "./MonthlyBook.js";

/**
 * What an answer was built from, flattened so it survives being logged, cached
 * or replayed without dragging the whole book along.
 *
 * Phase 1's grounding is at the level of the evidence *set*, not the individual
 * figure: we can prove the answer only saw real ledger data, not yet that every
 * digit is traceable (docs/architecture_phase1.md §5). This class is that claim,
 * written down.
 */
export class Evidence {
  private constructor(
    readonly clientId: ClientId,
    readonly month: Month,
    readonly documentCount: number,
    readonly assembledAt: Date,
    readonly partsPresent: readonly BookPart[],
    readonly gaps: readonly BookGap[],
  ) {}

  static fromBook(book: MonthlyBook): Evidence {
    return new Evidence(
      book.clientId,
      book.month,
      book.documentCount(),
      book.assembledAt,
      book.partsPresent(),
      book.gaps,
    );
  }
}
