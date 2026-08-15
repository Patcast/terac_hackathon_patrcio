import { Month } from "../../domain/model/Month.js";
import type { AnswerValidator } from "../../domain/services/AnswerValidator.js";
import type { RunwayEstimator } from "../../domain/services/RunwayEstimator.js";
import { AnswerResult } from "../dto/AnswerResult.js";
import type { AnswerQuestionCommand } from "../dto/AnswerQuestionCommand.js";
import type { AccountingRepository } from "../ports/driven/AccountingRepository.js";
import type { ClientRegistry } from "../ports/driven/ClientRegistry.js";
import type { Clock } from "../ports/driven/Clock.js";
import type { ReasoningEngine } from "../ports/driven/ReasoningEngine.js";
import { CFO_SYSTEM_PROMPT } from "./CfoSystemPrompt.js";

/**
 * The whole of Phase 1's business logic (docs/architecture_phase1.md §8).
 *
 * Five statements of substance, and note what is *not* here: no retry, no
 * timeout, no concurrency cap, no partial-failure branch. Those are real
 * concerns and they all belong to the assembler, the only component that knows
 * there are fifteen network calls to fail.
 */
export class AnswerMonthlyQuestion {
  constructor(
    private readonly clients: ClientRegistry,
    private readonly accounting: AccountingRepository,
    private readonly reasoner: ReasoningEngine,
    private readonly validator: AnswerValidator,
    private readonly runway: RunwayEstimator,
    private readonly clock: Clock,
    private readonly settlingDays: number,
  ) {}

  async execute(cmd: AnswerQuestionCommand): Promise<AnswerResult> {
    const now = this.clock.now();
    const client = this.clients.require(cmd.clientId);

    // The adapter parsed a month out of the message, or fell back to the last settled one.
    const month = cmd.month ?? Month.lastClosed(now, this.settlingDays);

    // One call. Fifteen reports happen behind it — that's the adapter's business.
    const book = await this.accounting.getMonthlyBook(client.id, month);

    // Pure arithmetic over the book — no query, no forecast. Null when it isn't answerable.
    const runway = this.runway.estimate(book);

    // Retrieve first, reason once. No tool loop in Phase 1 — see §6.
    const draft = await this.reasoner.answer({
      systemPrompt: CFO_SYSTEM_PROMPT,
      book,
      runway,
      question: cmd.question,
      effort: "high",
    });

    // Guardrail: the answer may only reference documents we actually handed it.
    // An ungrounded draft raises rather than returns — the caller decides whether
    // to retry, and never sends the draft (docs/imessage_flow_phase1.md, failure paths).
    const answer = this.validator.ground(draft, book, now);

    return AnswerResult.from(answer, book, runway);
  }
}
