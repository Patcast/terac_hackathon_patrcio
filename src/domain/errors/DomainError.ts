/**
 * Base for every error the product itself can raise.
 *
 * `domain/` has zero dependencies (docs/architecture_phase1.md §1), so these
 * carry no HTTP status, no vendor payload — just the facts an outer ring needs
 * to decide what the client should be told.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Summing dollars into euros is a bug, not a rounding difference. */
export class CurrencyMismatchError extends DomainError {
  constructor(
    readonly left: string,
    readonly right: string,
  ) {
    super(`cannot combine ${left} with ${right} — convert first or keep them apart`);
  }
}

/** A month string the client wrote that resolves to no period at all. */
export class UnparseableMonthError extends DomainError {
  constructor(readonly text: string) {
    super(`could not read a month out of ${JSON.stringify(text)}`);
  }
}
