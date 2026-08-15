import { IncompleteBookError, UngroundedFigureError } from "../errors/BookErrors.js";
import { Evidence } from "../model/Evidence.js";
import { GroundedAnswer } from "../model/GroundedAnswer.js";
import { InvoiceId } from "../model/Ids.js";
import { MonthlyBook } from "../model/MonthlyBook.js";

export interface AnswerDraft {
  text: string;
  citedInvoiceIds: InvoiceId[];
}

/**
 * The guardrail between a model's draft and a client's phone.
 *
 * It does not chase per-figure provenance, because **the whole book is the
 * evidence set** — we prove the answer only saw real ledger data, not yet that
 * every digit is traceable. Weaker than the full design's grounding and the
 * honest Phase 1 trade (docs/architecture_phase1.md §5).
 */
export class AnswerValidator {
  ground(draft: AnswerDraft, book: MonthlyBook, now: Date): GroundedAnswer {
    if (!book.isUsable()) throw new IncompleteBookError(book.clientId, book.month, book.gaps);

    const known = book.knownInvoiceIds();
    const invented = draft.citedInvoiceIds.filter((id) => !known.has(id.value));
    if (invented.length > 0) throw new UngroundedFigureError(invented);

    return new GroundedAnswer(draft.text, Evidence.fromBook(book), now);
  }
}
