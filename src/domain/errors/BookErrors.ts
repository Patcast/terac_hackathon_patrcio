import { DomainError } from "./DomainError.js";
import { BookGap } from "../model/BookGap.js";
import { ClientId, InvoiceId } from "../model/Ids.js";
import { Month } from "../model/Month.js";

/**
 * A Required part is missing, so there is no defensible answer to give.
 *
 * Refusing is the product decision here: a CFO answer built on a book with no
 * P&L or no cash position is not a partial answer, it is a confident wrong one
 * (docs/architecture_phase1.md §5).
 */
export class IncompleteBookError extends DomainError {
  constructor(
    readonly clientId: ClientId,
    readonly month: Month,
    readonly gaps: readonly BookGap[],
  ) {
    super(`${month.label()} is not complete enough to answer from — missing ${missing(gaps)}`);
  }
}

/** Only the fatal gaps explain the refusal; the rest were survivable. */
function missing(gaps: readonly BookGap[]): string {
  const fatal = gaps.filter((gap) => gap.isFatal());
  return fatal.length > 0 ? fatal.map((gap) => gap.label()).join(", ") : "an unreported part";
}

/**
 * The model cited an invoice that is not in the book.
 *
 * Rare, and fatal when it happens: an invented invoice number in a CFO answer is
 * the credibility loss the whole grounding step exists to prevent.
 */
export class UngroundedFigureError extends DomainError {
  constructor(readonly invented: readonly InvoiceId[]) {
    super(
      `answer cited ${invented.length} document(s) not in the book: ` +
        invented.map((id) => id.value).join(", "),
    );
  }
}

/** A phone number or id that maps to no client we hold books for. */
export class UnknownClientError extends DomainError {
  constructor(readonly identifier: string) {
    super(`no client matches ${JSON.stringify(identifier)}`);
  }
}
