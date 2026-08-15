import {
  IncompleteBookError,
  UngroundedFigureError,
  UnknownClientError,
} from "../domain/errors/BookErrors.js";
import { UnparseableMonthError } from "../domain/errors/DomainError.js";

/**
 * Every string Tammy sends when something has gone wrong, in one place.
 *
 * They are copied from the failure-path table in docs/imessage_flow_phase1.md,
 * which is the spec for them — written now rather than at 3am, because that is
 * when they would otherwise be written and it shows.
 *
 * The pattern in all of them: **say what's missing, say what it costs the
 * answer, don't fill the gap.** Silence about missing data is how a CFO product
 * loses trust, and a confident wrong number is worse than a hedge.
 */
export const FailureMessages = {
  /** Sender not in the client registry — a stranger, not a customer with a problem. */
  unknownSender(): string {
    return "I don't have books linked to this number yet.";
  },

  /**
   * A Required report failed, so `isUsable()` is false. Note it names what is
   * missing and then stops: no partial answer, no estimate.
   */
  incompleteBook(monthLabel: string, missing: readonly string[]): string {
    const what = list(missing) || "part of the ledger";
    return (
      `I couldn't get a complete read of your ${monthLabel} books — ${what} didn't come back. ` +
      "I'd rather not answer on a partial ledger. Try me again in a minute?"
    );
  },

  /**
   * The model cited a document that isn't in the book, or answered without the
   * citation trailer that would let us check. **The draft is never sent** — this
   * is what goes out after the one retry has also failed.
   */
  ungrounded(): string {
    return (
      "Something's off in how I read that — let me come back to you rather than " +
      "give you a number I can't stand behind."
    );
  },

  /** A month named in the message that resolves to no period at all. */
  unreadableMonth(text: string): string {
    return (
      `I couldn't tell which month you meant by "${text}". ` +
      "Try naming it outright — \"July 2026\" or \"2026-07\"."
    );
  },

  /**
   * Nothing raises this yet: Phase 1 never learns when a client's ledger starts.
   * The copy lives here so the check, when it lands, is a one-line change rather
   * than a decision about what to say.
   */
  monthBeforeLedger(monthLabel: string, firstMonthLabel: string): string {
    return `Your Odoo books don't go back to ${monthLabel} — earliest I can see is ${firstMonthLabel}.`;
  },

  /**
   * The catch-all. Deliberately admits nothing it doesn't know and promises
   * nothing it can't do — an error we didn't anticipate is not an error we can
   * describe accurately.
   */
  unexpected(): string {
    return "Something went wrong on my side and I'd rather not guess. Try me again in a minute?";
  },
} as const;

/**
 * Maps a thrown error to what the client reads.
 *
 * The ungrounded case is absent on purpose: it is the one failure with a retry
 * policy attached, so the controller owns it rather than discovering it here
 * (docs/imessage_flow_phase1.md — "never send the draft; retry once").
 */
export function failureMessageFor(error: unknown): string {
  if (error instanceof IncompleteBookError) {
    const fatal = error.gaps.filter((gap) => gap.isFatal()).map((gap) => gap.label());
    return FailureMessages.incompleteBook(error.month.label(), fatal);
  }
  if (error instanceof UnknownClientError) return FailureMessages.unknownSender();
  if (error instanceof UngroundedFigureError) return FailureMessages.ungrounded();
  if (error instanceof UnparseableMonthError) return FailureMessages.unreadableMonth(error.text);
  return FailureMessages.unexpected();
}

/** "the profit and loss and your cash balances" reads better than a comma there. */
function list(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}
