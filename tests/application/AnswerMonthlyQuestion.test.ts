import { describe, expect, it } from "vitest";

import type { AccountingRepository } from "../../src/application/ports/driven/AccountingRepository.js";
import type { ClientRegistry } from "../../src/application/ports/driven/ClientRegistry.js";
import type { ReasoningEngine, ReasoningRequest } from "../../src/application/ports/driven/ReasoningEngine.js";
import { AnswerMonthlyQuestion } from "../../src/application/usecases/AnswerMonthlyQuestion.js";
import { CFO_SYSTEM_PROMPT } from "../../src/application/usecases/CfoSystemPrompt.js";
import { UngroundedFigureError, UnknownClientError } from "../../src/domain/errors/BookErrors.js";
import { Client } from "../../src/domain/model/Client.js";
import { ClientId, InvoiceId, PhoneNumber } from "../../src/domain/model/Ids.js";
import { Money } from "../../src/domain/model/Money.js";
import { Month } from "../../src/domain/model/Month.js";
import type { MonthlyBook } from "../../src/domain/model/MonthlyBook.js";
import { Runway } from "../../src/domain/model/Runway.js";
import { AnswerValidator } from "../../src/domain/services/AnswerValidator.js";
import type { AnswerDraft } from "../../src/domain/services/AnswerValidator.js";
import { RunwayEstimator } from "../../src/domain/services/RunwayEstimator.js";
import { ACME, AUG_15_2026, JULY_2026, StubClock, USD, buildBook } from "../support/books.js";

const OWNER = new Client(ACME, "Acme Ltd", PhoneNumber.of("+1 (555) 010-1234"), 1);

class FakeRegistry implements ClientRegistry {
  require(clientId: ClientId): Client {
    if (!clientId.equals(OWNER.id)) throw new UnknownClientError(clientId.value);
    return OWNER;
  }

  findByPhone(phone: PhoneNumber): Client | null {
    return phone.equals(OWNER.phone) ? OWNER : null;
  }

  all(): readonly Client[] {
    return [OWNER];
  }
}

/** Records what it was asked for; hands back a hand-built book. */
class FakeAccounting implements AccountingRepository {
  readonly asked: { clientId: ClientId; month: Month }[] = [];

  constructor(private readonly book: MonthlyBook) {}

  async getMonthlyBook(clientId: ClientId, month: Month): Promise<MonthlyBook> {
    this.asked.push({ clientId, month });
    return this.book;
  }
}

class FakeReasoner implements ReasoningEngine {
  received: ReasoningRequest | null = null;

  constructor(private readonly draft: AnswerDraft) {}

  async answer(request: ReasoningRequest): Promise<AnswerDraft> {
    this.received = request;
    return this.draft;
  }
}

/** Subclassed rather than hand-rolled so the port type stays honest. */
class StubRunwayEstimator extends RunwayEstimator {
  constructor(private readonly value: Runway | null) {
    super();
  }

  estimate(): Runway | null {
    return this.value;
  }
}

function useCase(options: {
  accounting: FakeAccounting;
  reasoner: FakeReasoner;
  runway?: Runway | null;
  clock?: StubClock;
  settlingDays?: number;
}): AnswerMonthlyQuestion {
  return new AnswerMonthlyQuestion(
    new FakeRegistry(),
    options.accounting,
    options.reasoner,
    new AnswerValidator(),
    new StubRunwayEstimator(options.runway ?? null),
    options.clock ?? new StubClock(),
    options.settlingDays ?? 10,
  );
}

describe("AnswerMonthlyQuestion", () => {
  it("falls back to the last settled month when the command carries none", async () => {
    const accounting = new FakeAccounting(buildBook());
    const reasoner = new FakeReasoner({ text: "July was fine.", citedInvoiceIds: [] });

    await useCase({ accounting, reasoner }).execute({
      clientId: ACME,
      question: "What was my biggest cost?",
      month: null,
    });

    // 15 Aug with a 10-day settling window means July is the month Tammy talks about.
    expect(accounting.asked).toHaveLength(1);
    expect(accounting.asked[0]?.month.key()).toBe(Month.lastClosed(AUG_15_2026, 10).key());
    expect(accounting.asked[0]?.month.key()).toBe("2026-07");
  });

  it("uses the month the command carries, when it carries one", async () => {
    const june = Month.of(2026, 6);
    const accounting = new FakeAccounting(buildBook({ month: june }));
    const reasoner = new FakeReasoner({ text: "June was fine.", citedInvoiceIds: [] });

    const result = await useCase({ accounting, reasoner }).execute({
      clientId: ACME,
      question: "How did June go?",
      month: june,
    });

    expect(accounting.asked[0]?.month.key()).toBe("2026-06");
    expect(result.monthLabel).toBe(june.label());
  });

  it("hands the reasoner the system prompt, the book and the runway", async () => {
    const book = buildBook();
    const runway = Runway.of(12, JULY_2026.endsOn(), 3, Money.of(5_000, USD));
    const accounting = new FakeAccounting(book);
    const reasoner = new FakeReasoner({ text: "About a year.", citedInvoiceIds: [] });

    const result = await useCase({ accounting, reasoner, runway }).execute({
      clientId: ACME,
      question: "Can I afford a hire?",
      month: null,
    });

    // Runway is derived in domain and passed down — the model never computes one.
    expect(reasoner.received?.runway).toBe(runway);
    expect(reasoner.received?.book).toBe(book);
    expect(reasoner.received?.systemPrompt).toBe(CFO_SYSTEM_PROMPT);
    expect(reasoner.received?.effort).toBe("high");
    expect(reasoner.received?.question).toBe("Can I afford a hire?");
    expect(result.runway).toBe(runway);
  });

  it("carries the footer facts out of the book", async () => {
    const book = buildBook();
    const accounting = new FakeAccounting(book);
    const reasoner = new FakeReasoner({ text: "Here you go.", citedInvoiceIds: [] });

    const result = await useCase({ accounting, reasoner }).execute({
      clientId: ACME,
      question: "How did July go?",
      month: null,
    });

    expect(result.text).toBe("Here you go.");
    expect(result.monthLabel).toBe("July 2026");
    expect(result.asOf.getTime()).toBe(JULY_2026.endsOn().getTime());
    expect(result.documentCount).toBe(book.documentCount());
    expect(result.gaps).toEqual([]);
    expect(result.settling).toBe(book.settling);
  });

  it("propagates an ungrounded draft rather than swallowing it", async () => {
    const accounting = new FakeAccounting(buildBook());
    // No ledgers in the fixture, so any cited invoice is one the model invented.
    const reasoner = new FakeReasoner({
      text: "Invoice INV/2026/0042 is 60 days out.",
      citedInvoiceIds: [InvoiceId.of("INV/2026/0042")],
    });

    await expect(
      useCase({ accounting, reasoner }).execute({
        clientId: ACME,
        question: "Who still hasn't paid me?",
        month: null,
      }),
    ).rejects.toBeInstanceOf(UngroundedFigureError);
  });

  it("refuses a client it has no books for, before touching the ledger", async () => {
    const accounting = new FakeAccounting(buildBook());
    const reasoner = new FakeReasoner({ text: "n/a", citedInvoiceIds: [] });

    await expect(
      useCase({ accounting, reasoner }).execute({
        clientId: ClientId.of("stranger"),
        question: "How did July go?",
        month: null,
      }),
    ).rejects.toBeInstanceOf(UnknownClientError);
    expect(accounting.asked).toHaveLength(0);
  });
});
