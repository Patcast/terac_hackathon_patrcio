import { beforeEach, describe, expect, it } from "vitest";
import {
  LinqWebhookController,
  type MonthlyQuestionUseCase,
} from "../../../../src/adapters/inbound/linq/LinqWebhookController.js";
import type { AnswerQuestionCommand } from "../../../../src/application/dto/AnswerQuestionCommand.js";
import { AnswerResult } from "../../../../src/application/dto/AnswerResult.js";
import type { ClientRegistry } from "../../../../src/application/ports/driven/ClientRegistry.js";
import type {
  ConversationChannel,
  MessageRef,
} from "../../../../src/application/ports/driven/ConversationChannel.js";
import {
  IncompleteBookError,
  UngroundedFigureError,
  UnknownClientError,
} from "../../../../src/domain/errors/BookErrors.js";
import { BookGap } from "../../../../src/domain/model/BookGap.js";
import { Tier } from "../../../../src/domain/model/BookPart.js";
import { Client } from "../../../../src/domain/model/Client.js";
import { Evidence } from "../../../../src/domain/model/Evidence.js";
import { GroundedAnswer } from "../../../../src/domain/model/GroundedAnswer.js";
import { ClientId, InvoiceId, PhoneNumber } from "../../../../src/domain/model/Ids.js";
import { Month } from "../../../../src/domain/model/Month.js";
import type { MessageViewModel } from "../../../../src/presentation/viewmodels/MessageViewModel.js";
import type { Presenter } from "../../../../src/presentation/presenters/Presenter.js";
import { ACME, AUG_15_2026, buildBook, JULY_2026, StubClock } from "../../../support/books.js";

const OWNER = PhoneNumber.of("+15550101234");
const STRANGER = PhoneNumber.of("+15559999999");
const CLIENT = new Client(ACME, "Acme Ltd", OWNER, 1);

function webhook(text: string, from: PhoneNumber = OWNER): unknown {
  return {
    event: "message.received",
    data: {
      id: "msg_1",
      from: from.value,
      direction: "inbound",
      message: { parts: [{ type: "text", value: text }] },
    },
  };
}

function answerResult(text: string): AnswerResult {
  const book = buildBook();
  return AnswerResult.from(new GroundedAnswer(text, Evidence.fromBook(book), AUG_15_2026), book, null);
}

class FakeRegistry implements ClientRegistry {
  require(clientId: ClientId): Client {
    if (clientId.equals(ACME)) return CLIENT;
    throw new UnknownClientError(clientId.value);
  }

  findByPhone(phone: PhoneNumber): Client | null {
    return phone.equals(OWNER) ? CLIENT : null;
  }

  all(): readonly Client[] {
    return [CLIENT];
  }
}

class FakeChannel implements ConversationChannel {
  readonly sent: string[] = [];
  readonly typing: boolean[] = [];

  async sendText(_to: PhoneNumber, text: string): Promise<MessageRef> {
    this.sent.push(text);
    return { id: "sent_1" };
  }

  async setTyping(_to: PhoneNumber, on: boolean): Promise<void> {
    this.typing.push(on);
  }
}

/** Replays a scripted sequence of outcomes, one per `execute` call. */
class FakeUseCase implements MonthlyQuestionUseCase {
  readonly commands: AnswerQuestionCommand[] = [];

  constructor(private readonly outcomes: (AnswerResult | Error)[]) {}

  async execute(command: AnswerQuestionCommand): Promise<AnswerResult> {
    this.commands.push(command);
    const outcome = this.outcomes[this.commands.length - 1] ?? this.outcomes.at(-1);
    if (outcome instanceof Error) throw outcome;
    if (outcome === undefined) throw new Error("FakeUseCase: no outcome scripted");
    return outcome;
  }
}

const presenter: Presenter<AnswerResult, MessageViewModel> = {
  present: (result) => ({ text: `${result.text}\n\n_footer_` }),
};

let channel: FakeChannel;

function controllerFor(useCase: MonthlyQuestionUseCase): LinqWebhookController {
  return new LinqWebhookController(
    new FakeRegistry(),
    useCase,
    presenter,
    channel,
    new StubClock(AUG_15_2026),
  );
}

beforeEach(() => {
  channel = new FakeChannel();
});

describe("LinqWebhookController", () => {
  it("answers a known sender with the presented view model", async () => {
    const useCase = new FakeUseCase([answerResult("July net was $6,200.")]);

    await controllerFor(useCase).handle(webhook("How did July go?"));

    expect(channel.sent).toEqual(["July net was $6,200.\n\n_footer_"]);
    expect(channel.typing).toEqual([true, false]);
  });

  it("puts the month the client named on the command, and never invents one", async () => {
    const useCase = new FakeUseCase([answerResult("ok"), answerResult("ok")]);
    const controller = controllerFor(useCase);

    await controller.handle(webhook("What was my biggest cost in July 2026?"));
    await controller.handle(webhook("Who still hasn't paid me?"));

    expect(useCase.commands[0]?.month?.equals(JULY_2026)).toBe(true);
    // No month in the message means null on the command — the use case falls
    // back to the last settled month, not the adapter.
    expect(useCase.commands[1]?.month).toBeNull();
    expect(useCase.commands[0]?.clientId.equals(ACME)).toBe(true);
  });

  it("tells an unknown sender there are no books, and runs no use case", async () => {
    const useCase = new FakeUseCase([answerResult("never reached")]);

    await controllerFor(useCase).handle(webhook("Who still hasn't paid me?", STRANGER));

    expect(channel.sent).toEqual(["I don't have books linked to this number yet."]);
    expect(useCase.commands).toHaveLength(0);
    // Nothing to assemble, so nothing to show a typing indicator for.
    expect(channel.typing).toEqual([]);
  });

  it("refuses to answer on a partial ledger, naming what didn't come back", async () => {
    const error = new IncompleteBookError(ACME, JULY_2026, [
      BookGap.from("pnl", Tier.Required, new Error("timed out")),
    ]);

    await controllerFor(new FakeUseCase([error])).handle(webhook("How did July go?"));

    expect(channel.sent[0]).toBe(
      "I couldn't get a complete read of your July 2026 books — the profit and loss didn't come back. " +
        "I'd rather not answer on a partial ledger. Try me again in a minute?",
    );
  });

  it("clears typing even when the use case throws", async () => {
    await controllerFor(new FakeUseCase([new Error("odoo exploded")])).handle(
      webhook("How did July go?"),
    );

    expect(channel.typing).toEqual([true, false]);
    expect(channel.sent[0]).toBe(
      "Something went wrong on my side and I'd rather not guess. Try me again in a minute?",
    );
  });

  it("retries an ungrounded draft once, and sends the retry when it grounds", async () => {
    const useCase = new FakeUseCase([
      new UngroundedFigureError([InvoiceId.of("9999")]),
      answerResult("Northwind owes you $12,000."),
    ]);

    await controllerFor(useCase).handle(webhook("Who still hasn't paid me?"));

    expect(useCase.commands).toHaveLength(2);
    expect(channel.sent).toEqual(["Northwind owes you $12,000.\n\n_footer_"]);
  });

  it("never sends the draft when the retry is ungrounded too", async () => {
    const useCase = new FakeUseCase([
      new UngroundedFigureError([InvoiceId.of("9999")]),
      new UngroundedFigureError([InvoiceId.of("9998")]),
    ]);

    await controllerFor(useCase).handle(webhook("Who still hasn't paid me?"));

    expect(useCase.commands).toHaveLength(2);
    expect(channel.sent).toEqual([
      "Something's off in how I read that — let me come back to you rather than " +
        "give you a number I can't stand behind.",
    ]);
    expect(channel.typing).toEqual([true, false]);
  });

  it("retries a missing citation trailer the same way — it is the same failure", async () => {
    const missing = new Error("no trailer");
    missing.name = "MissingCitationsError";
    const useCase = new FakeUseCase([missing, answerResult("Nothing looks out of pattern.")]);

    await controllerFor(useCase).handle(webhook("Anything unexpected?"));

    expect(useCase.commands).toHaveLength(2);
    expect(channel.sent).toEqual(["Nothing looks out of pattern.\n\n_footer_"]);
  });

  it("ignores a payload that is not an inbound text", async () => {
    const useCase = new FakeUseCase([answerResult("never reached")]);
    const controller = controllerFor(useCase);

    await controller.handle({ event: "message.delivered", data: { id: "msg_1" } });
    await controller.handle({ data: { from: OWNER.value, direction: "outbound", text: "hi" } });
    await controller.handle("not an object");

    expect(channel.sent).toEqual([]);
    expect(useCase.commands).toHaveLength(0);
  });

  it("reads a flat payload as happily as a wrapped one", async () => {
    const useCase = new FakeUseCase([answerResult("ok")]);

    await controllerFor(useCase).handle({ from: OWNER.value, text: "How much VAT did July accrue?" });

    expect(useCase.commands[0]?.question).toBe("How much VAT did July accrue?");
    expect(useCase.commands[0]?.month?.equals(Month.of(2026, 7))).toBe(true);
  });
});
