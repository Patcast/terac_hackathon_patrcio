import { describe, expect, it } from "vitest";
import type { ReasoningCall } from "../../../src/adapters/outbound/claude/ClaudeClient.js";
import {
  ClaudeReasoningEngine,
  MissingCitationsError,
  type ClaudeReasoner,
} from "../../../src/adapters/outbound/claude/ClaudeReasoningEngine.js";
import { Invoice } from "../../../src/domain/model/Invoice.js";
import { InvoiceLedger } from "../../../src/domain/model/InvoiceLedger.js";
import { InvoiceId, PartyRef } from "../../../src/domain/model/Ids.js";
import { Money } from "../../../src/domain/model/Money.js";
import { buildBook, JULY_2026, USD } from "../../support/books.js";

/** Stands in for the SDK: records the call, replies with whatever the test set. */
class StubReasoner implements ClaudeReasoner {
  calls: ReasoningCall[] = [];

  constructor(private readonly reply: string) {}

  async reason(call: ReasoningCall): Promise<string> {
    this.calls.push(call);
    return this.reply;
  }
}

function bookWithInvoice(): ReturnType<typeof buildBook> {
  return buildBook({
    parts: {
      openReceivables: new InvoiceLedger(
        [
          new Invoice(
            InvoiceId.of(4101),
            "INV/2026/0042",
            PartyRef.of(7, "Northwind Ltd"),
            "outbound",
            new Date("2026-05-14T00:00:00.000Z"),
            new Date("2026-06-13T00:00:00.000Z"),
            Money.of(12_000, USD),
            Money.of(12_000, USD),
            "not_paid",
          ),
        ],
        USD,
      ),
    },
  });
}

function ask(reply: string): {
  engine: ClaudeReasoningEngine;
  stub: StubReasoner;
  run: () => Promise<{ text: string; citedInvoiceIds: InvoiceId[] }>;
} {
  const stub = new StubReasoner(reply);
  const engine = new ClaudeReasoningEngine(stub);
  return {
    engine,
    stub,
    run: () =>
      engine.answer({
        systemPrompt: "You are Tammy.",
        book: bookWithInvoice(),
        runway: null,
        question: "Who still hasn't paid me?",
        effort: "high",
      }),
  };
}

describe("ClaudeReasoningEngine", () => {
  it("strips the citation trailer out of the text and maps its ids", async () => {
    const { run } = ask(
      [
        "Northwind Ltd owes you $12,000, 48 days past due.",
        "",
        "===CITED-INVOICES===",
        "4101",
        "===END-CITED-INVOICES===",
      ].join("\n"),
    );

    const draft = await run();

    expect(draft.text).toBe("Northwind Ltd owes you $12,000, 48 days past due.");
    expect(draft.text).not.toContain("CITED-INVOICES");
    expect(draft.citedInvoiceIds.map((id) => id.value)).toEqual(["4101"]);
  });

  it("resolves an invoice number back to the id the validator checks", async () => {
    // The model is asked for ids but is looking at a table that also carries
    // numbers, and `INV/2026/0042` is the more natural thing to write.
    const { run } = ask(
      "Northwind is the one.\n\n===CITED-INVOICES===\nINV/2026/0042\n===END-CITED-INVOICES===",
    );

    const draft = await run();

    expect(draft.citedInvoiceIds.map((id) => id.value)).toEqual(["4101"]);
  });

  it("passes an unresolvable citation through, so the validator can reject it", async () => {
    const { run } = ask(
      "Acme Corp owes you $9,000.\n\n===CITED-INVOICES===\nINV/2026/9999\n===END-CITED-INVOICES===",
    );

    const draft = await run();

    expect(draft.citedInvoiceIds.map((id) => id.value)).toEqual(["INV/2026/9999"]);
  });

  it("reads NONE as an honest empty list", async () => {
    const { run } = ask(
      "Nothing in July looks out of pattern.\n\n===CITED-INVOICES===\nNONE\n===END-CITED-INVOICES===",
    );

    expect((await run()).citedInvoiceIds).toEqual([]);
  });

  it("raises rather than returning an empty list when the trailer is missing", async () => {
    // An empty list validates trivially, so treating a missing trailer as
    // "cited nothing" would disable the only guardrail Phase 1 has.
    const { run } = ask("Northwind Ltd owes you $12,000 on invoice INV/2026/0042.");

    await expect(run()).rejects.toBeInstanceOf(MissingCitationsError);
  });

  it("still reads the ids when the reply was cut off before the closing marker", async () => {
    const { run } = ask("Two are open.\n\n===CITED-INVOICES===\n4101");

    expect((await run()).citedInvoiceIds.map((id) => id.value)).toEqual(["4101"]);
  });

  it("splits the prompt at the cache breakpoint and asks for the trailer", async () => {
    const { stub, run } = ask("Fine.\n\n===CITED-INVOICES===\nNONE\n===END-CITED-INVOICES===");

    await run();

    const call = stub.calls[0];
    expect(call).toBeDefined();
    expect(call?.system).toBe("You are Tammy.");
    // Stable material only in the cached half; the month and the question in the other.
    expect(call?.cachedPrefix).toContain("# Client reference");
    expect(call?.cachedPrefix).not.toContain(JULY_2026.label());
    expect(call?.volatile).toContain("Who still hasn't paid me?");
    expect(call?.volatile).toContain("===CITED-INVOICES===");
    expect(call?.effort).toBe("high");
  });
});
