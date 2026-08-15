import type {
  ReasoningEngine,
  ReasoningRequest,
} from "../../../application/ports/driven/ReasoningEngine.js";
import type { AnswerDraft } from "../../../domain/services/AnswerValidator.js";
import { InvoiceId } from "../../../domain/model/Ids.js";
import type { MonthlyBook } from "../../../domain/model/MonthlyBook.js";
import { BookRenderer } from "./BookRenderer.js";
import { ClaudeClient, type ReasoningCall } from "./ClaudeClient.js";

/**
 * The delimiters of the citation trailer.
 *
 * Exported because they are a contract with two other things: the prompt that
 * asks for them, and `AnswerValidator`, which can only catch a hallucinated
 * invoice if this block arrives. Change them here and nowhere else.
 */
export const CITATION_OPEN = "===CITED-INVOICES===";
export const CITATION_CLOSE = "===END-CITED-INVOICES===";

/**
 * The model answered without the trailer.
 *
 * This is deliberately an error rather than an empty citation list. An empty
 * list validates trivially, so treating a missing trailer as "cited nothing"
 * would silently disable the one guardrail Phase 1 has: a hallucinated invoice
 * number would sail through `AnswerValidator` untouched. Same class of failure
 * as an ungrounded figure, so the controller retries it the same way.
 */
export class MissingCitationsError extends Error {
  constructor(readonly rawText: string) {
    super("the model answered without a citation trailer, so nothing can be grounded");
    this.name = "MissingCitationsError";
  }
}

/** The client-facing half of what to do; the persona lives in `CFO_SYSTEM_PROMPT`. */
const ANSWER_PROTOCOL = `## How to answer

- You are replying in a text message. Short lines, no headings, no tables. "•" is the only bullet.
- Every figure must come from the tables above. If a table says "Not available", say what you could
  not read and what it costs the answer — never estimate it, never fill the gap.
- Point-in-time figures (cash, open balances) are as of the as-of date above, not today. If the
  question is about "right now", say plainly that you read closed books and give the as-of date.
- Check any spike against the same line in the trailing months before calling it a problem, and say
  "one-off" when the series shows it as one.
- Tax figures are accrued in the month. They are never a filing figure.

Then, after your answer and on its own lines, ALWAYS emit this block:

${CITATION_OPEN}
one document id per line, copied exactly from the \`id\` column of the document tables
${CITATION_CLOSE}

If your answer relies on no individual document, the block must contain the single word NONE.
The block is stripped out before the client sees it. **An answer without this block cannot be sent
at all**, so emit it even when you are unsure — an id you used is better listed than omitted.`;

/**
 * `ClaudeClient`'s reasoning surface, as an interface so a test can stub it.
 * `ClaudeClient` satisfies it structurally; nothing else should implement it.
 */
export interface ClaudeReasoner {
  reason(call: ReasoningCall): Promise<string>;
}

/**
 * The `ReasoningEngine` port over Claude — single-shot, no tool loop
 * (docs/architecture_phase1.md §6). Retrieval already happened; this reasons once.
 *
 * The adapter is where the book becomes text: the port speaks domain, so
 * `BookRenderer` runs here rather than in the use case, and the prompt's cache
 * breakpoint is an implementation detail of this file.
 */
export class ClaudeReasoningEngine implements ReasoningEngine {
  constructor(
    private readonly claude: ClaudeReasoner,
    private readonly renderer: BookRenderer = new BookRenderer(),
  ) {}

  static fromEnv(): ClaudeReasoningEngine {
    return new ClaudeReasoningEngine(ClaudeClient.fromEnv(), new BookRenderer());
  }

  async answer(request: ReasoningRequest): Promise<AnswerDraft> {
    const rendered = this.renderer.render(request.book, request.runway);

    const raw = await this.claude.reason({
      system: request.systemPrompt,
      cachedPrefix: rendered.stablePrefix,
      volatile: [
        rendered.volatile,
        "",
        "## The question",
        "",
        request.question.trim(),
        "",
        ANSWER_PROTOCOL,
      ].join("\n"),
      // The port's three levels are a subset of the SDK's, so this passes
      // straight through rather than through a lookup that could drift.
      effort: request.effort,
    });

    return parseAnswerDraft(raw, request.book);
  }
}

/**
 * Splits the reply into what the client reads and what the validator checks.
 *
 * Exported for tests, and because the trailer format is the fragile part of the
 * whole grounding story — it deserves to be exercised directly.
 */
export function parseAnswerDraft(raw: string, book: MonthlyBook): AnswerDraft {
  const open = raw.indexOf(CITATION_OPEN);
  if (open === -1) throw new MissingCitationsError(raw);

  const text = raw.slice(0, open).trim();
  if (!text) throw new Error("Claude returned a citation trailer and no answer");

  const afterOpen = raw.slice(open + CITATION_OPEN.length);
  const close = afterOpen.indexOf(CITATION_CLOSE);
  // A reply cut off at max_tokens loses its closing marker but not its ids.
  const body = close === -1 ? afterOpen : afterOpen.slice(0, close);

  return { text, citedInvoiceIds: resolveCitations(body, book) };
}

/**
 * The model is asked for ids, but it is looking at a table that also carries
 * invoice numbers, and `INV/2026/0042` is the more natural thing to write. So
 * numbers resolve to ids here — and anything that resolves to neither is passed
 * through unchanged, so `AnswerValidator` sees it and rejects the answer. That
 * is the point: a token we cannot place is exactly what the guardrail is for.
 */
function resolveCitations(body: string, book: MonthlyBook): InvoiceId[] {
  const known = book.knownInvoiceIds();
  const byNumber = invoiceNumberIndex(book);

  const seen = new Set<string>();
  const ids: InvoiceId[] = [];

  for (const rawToken of body.split(/[\n,;]/)) {
    const token = rawToken.replace(/^[\s•\-*]+/, "").replace(/[\s.`"']+$/, "").trim();
    if (!token || /^none$/i.test(token)) continue;

    const resolved = known.has(token) ? token : (byNumber.get(token) ?? token);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    ids.push(InvoiceId.of(resolved));
  }

  return ids;
}

function invoiceNumberIndex(book: MonthlyBook): Map<string, string> {
  const index = new Map<string, string>();
  for (const ledger of [
    book.invoicesIssued,
    book.billsReceived,
    book.openReceivables,
    book.openPayables,
  ]) {
    for (const invoice of ledger?.documents ?? []) index.set(invoice.number, invoice.id.value);
  }
  return index;
}
