import type { MonthlyBook } from "../../../domain/model/MonthlyBook.js";
import type { Runway } from "../../../domain/model/Runway.js";
import type { AnswerDraft } from "../../../domain/services/AnswerValidator.js";

/**
 * What the model is asked. Note what it carries: domain objects, not a rendered
 * string. The adapter renders the book — the port speaks domain
 * (docs/architecture_phase1.md §6).
 */
export interface ReasoningRequest {
  /** Stable across every request → the adapter's `cache_control` breakpoint. */
  systemPrompt: string;
  book: MonthlyBook;
  /** Derived in `domain/`, never by the model. Null when the book can't support one. */
  runway: Runway | null;
  question: string;
  effort: "low" | "medium" | "high";
}

/**
 * Single-shot on purpose: no `ToolSpec`, no outcome union, no loop. A tool loop
 * pays for itself when retrieval is open-ended; Phase 1 has a fixed catalogue
 * over a period that never changes, so it retrieves first and reasons once.
 */
export interface ReasoningEngine {
  answer(request: ReasoningRequest): Promise<AnswerDraft>;
}
