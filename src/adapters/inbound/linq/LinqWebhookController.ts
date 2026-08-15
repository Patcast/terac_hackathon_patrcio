import type { AnswerQuestionCommand } from "../../../application/dto/AnswerQuestionCommand.js";
import type { AnswerResult } from "../../../application/dto/AnswerResult.js";
import type { ClientRegistry } from "../../../application/ports/driven/ClientRegistry.js";
import type { Clock } from "../../../application/ports/driven/Clock.js";
import type { ConversationChannel } from "../../../application/ports/driven/ConversationChannel.js";
import { UngroundedFigureError } from "../../../domain/errors/BookErrors.js";
import { Month } from "../../../domain/model/Month.js";
import { FailureMessages, failureMessageFor } from "../../../presentation/FailureMessages.js";
import type { Presenter } from "../../../presentation/presenters/Presenter.js";
import type { MessageViewModel } from "../../../presentation/viewmodels/MessageViewModel.js";
import { parseInboundMessage } from "./LinqInboundWebhook.js";

/**
 * `AnswerMonthlyQuestion`'s one method, as an interface.
 *
 * The concrete use case has private fields, so a test fake could not stand in
 * for it. Depending on the shape instead is what keeps this controller testable
 * without a book, a ledger or a network.
 */
export interface MonthlyQuestionUseCase {
  execute(command: AnswerQuestionCommand): Promise<AnswerResult>;
}

/**
 * The inbound edge (docs/architecture_phase1.md §10) — and the first and last
 * participant in that sequence diagram.
 *
 * Framework-free on purpose: a plain class with one method taking `unknown`.
 * Binding it to an HTTP route is `composition/`'s problem, which is what lets
 * the whole flow be tested with a plain object literal for a payload.
 *
 * Note what it does *not* decide: it never invents a date range. `Month.parse`
 * is domain — *which period the client meant* is a product rule — and a message
 * that names no month puts `null` on the command, leaving the fallback to the
 * use case where it belongs.
 */
export class LinqWebhookController {
  constructor(
    private readonly clients: ClientRegistry,
    private readonly useCase: MonthlyQuestionUseCase,
    private readonly presenter: Presenter<AnswerResult, MessageViewModel>,
    private readonly channel: ConversationChannel,
    private readonly clock: Clock,
  ) {}

  /**
   * One inbound webhook, start to finish.
   *
   * Resolves to `void` rather than a response body: the reply goes out over the
   * channel, and the HTTP 200 owes the webhook caller nothing else.
   *
   * Payload verification here is structural — `parseInboundMessage` returning
   * null rejects receipts, reactions and echoes. Signature verification against
   * `LINQ_WEBHOOK_SECRET` is not wired: `config/env.ts` exposes no accessor for
   * it, and adding one is a change to a file this edge does not own.
   */
  async handle(payload: unknown): Promise<void> {
    // Linq's event shapes are documented loosely and vary by endpoint, so the
    // raw body is logged once per event: when a text arrives and nothing
    // happens, this line is the difference between a five-minute fix and an
    // afternoon. Set LINQ_LOG_WEBHOOKS=false once the shape is confirmed.
    if (process.env["LINQ_LOG_WEBHOOKS"] !== "false") {
      console.log("[webhook] raw:", JSON.stringify(payload)?.slice(0, 2_000));
    }

    const inbound = parseInboundMessage(payload);
    if (!inbound) return; // A receipt or a reaction. Nothing to answer.

    const client = this.clients.findByPhone(inbound.from);
    if (!client) {
      // No use case runs for a stranger: there are no books to assemble.
      await this.channel.sendText(inbound.from, FailureMessages.unknownSender());
      return;
    }

    const command: AnswerQuestionCommand = {
      clientId: client.id,
      question: inbound.text,
      month: Month.parse(inbound.text, this.clock.now()),
    };

    await this.channel.setTyping(inbound.from, true);

    let text: string;
    try {
      text = await this.answer(command);
    } catch (error) {
      text = failureMessageFor(error);
    } finally {
      // Always cleared. A thread left showing "…" forever is worse than no
      // indicator at all, and the answer already failed once by this point.
      await this.channel.setTyping(inbound.from, false);
    }

    await this.channel.sendText(inbound.from, text);
  }

  /**
   * Runs the use case, and retries **once** when the draft could not be grounded.
   *
   * The retry is worth it because an ungrounded citation is usually a sampling
   * accident rather than a broken book. What is not negotiable is the other
   * half: the draft itself is never sent, on either attempt
   * (docs/imessage_flow_phase1.md, failure paths).
   */
  private async answer(command: AnswerQuestionCommand): Promise<string> {
    try {
      return this.present(await this.useCase.execute(command));
    } catch (error) {
      if (!isUngrounded(error)) throw error;

      try {
        return this.present(await this.useCase.execute(command));
      } catch (retryError) {
        if (isUngrounded(retryError)) return FailureMessages.ungrounded();
        throw retryError;
      }
    }
  }

  private present(result: AnswerResult): string {
    return this.presenter.present(result).text;
  }
}

/**
 * Both failures mean the same thing — the model's output cannot be stood
 * behind — so they share a retry.
 *
 * `MissingCitationsError` is matched by name rather than by `instanceof`
 * because it belongs to the Claude adapter, and an inbound adapter importing an
 * outbound one would put a vendor detail on this file's dependency list to gain
 * nothing.
 */
function isUngrounded(error: unknown): boolean {
  if (error instanceof UngroundedFigureError) return true;
  return error instanceof Error && error.name === "MissingCitationsError";
}
