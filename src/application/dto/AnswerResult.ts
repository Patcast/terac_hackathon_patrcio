import type { GroundedAnswer } from "../../domain/model/GroundedAnswer.js";
import type { MonthlyBook } from "../../domain/model/MonthlyBook.js";
import type { Runway } from "../../domain/model/Runway.js";

/**
 * What a use case hands a presenter: the answer plus everything the footer
 * needs, and nothing that would make a presenter decide anything
 * (docs/architecture_phase1.md §9).
 *
 * Flattened out of the book on purpose — a presenter that held a `MonthlyBook`
 * would sooner or later start reading parts out of it, and then the rendering
 * rules would live in two places.
 */
export class AnswerResult {
  private constructor(
    readonly text: string,
    readonly monthLabel: string,
    readonly asOf: Date,
    readonly documentCount: number,
    /**
     * `BookGap.label()` strings — client-readable phrases like "the tax lines".
     * The presenter prints these verbatim into `_⚠️ couldn't read: …_`, so they
     * must never carry a part key or a stack trace.
     */
    readonly gaps: readonly string[],
    readonly settling: boolean,
    readonly runway: Runway | null,
  ) {}

  static from(answer: GroundedAnswer, book: MonthlyBook, runway: Runway | null): AnswerResult {
    return new AnswerResult(
      answer.text,
      book.month.label(),
      book.asOf(),
      book.documentCount(),
      book.gaps.map((gap) => gap.label()),
      book.settling,
      runway,
    );
  }
}
