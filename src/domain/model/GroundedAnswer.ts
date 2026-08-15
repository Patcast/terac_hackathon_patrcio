import { Evidence } from "./Evidence.js";

/**
 * An answer that has been checked against the book it came from.
 *
 * The type exists so that "text a model produced" and "text we are willing to
 * send a client" are not the same thing at compile time: only
 * `AnswerValidator.ground` constructs one, and only this reaches the presenter.
 */
export class GroundedAnswer {
  constructor(
    readonly text: string,
    readonly evidence: Evidence,
    readonly askedAt: Date,
  ) {}
}
