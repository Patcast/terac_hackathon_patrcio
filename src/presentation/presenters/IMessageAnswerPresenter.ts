import type { AnswerResult } from "../../application/dto/AnswerResult.js";
import type { MessageViewModel } from "../viewmodels/MessageViewModel.js";
import type { MoneyFormatter } from "./MoneyFormatter.js";
import type { Presenter } from "./Presenter.js";

/**
 * The one presenter Phase 1 has, printed in docs/architecture_phase1.md §9 and
 * implemented here as printed.
 *
 * **The footer is part of the product** (docs/imessage_flow_phase1.md, Rule 2).
 * The as-of date is not decoration: Phase 1 answers about a closed month, so
 * every balance in the reply is historical, and printing the date is what makes
 * month-scoping read as a deliberate choice rather than a limitation.
 *
 * Note what it does *not* do: no "if outstanding is high, warn them", no
 * decision about whether a gap matters. It renders `result.gaps`;
 * `book.isUsable()` already decided whether answering was defensible at all.
 */
export class IMessageAnswerPresenter implements Presenter<AnswerResult, MessageViewModel> {
  constructor(private readonly money: MoneyFormatter) {}

  present(result: AnswerResult): MessageViewModel {
    const { text, monthLabel, asOf, documentCount, gaps, settling } = result;
    const lines = [
      text,
      "",
      `_${monthLabel} · ${documentCount} documents · as of ${this.money.formatDate(asOf)}_`,
    ];
    if (settling) lines.push("_books for this month may still be settling_");
    if (gaps.length > 0) lines.push(`_⚠️ couldn't read: ${gaps.join(", ")}_`);
    return { text: lines.join("\n") };
  }
}
