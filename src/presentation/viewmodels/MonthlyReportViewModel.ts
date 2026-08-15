/**
 * The web brief, fully rendered — every figure already a string.
 *
 * **Plain data, no domain types, no methods.** This crosses the wire as JSON to
 * a browser, so anything with behaviour would arrive as a bare object with its
 * methods stripped, and the first `.total()` in the page script would be a
 * runtime error that no test catches. Keeping it dumb also means the browser
 * never formats money: one `MoneyFormatter`, server side, so the page and the
 * text message round the same figure the same way.
 *
 * Null is used throughout for "we could not read this", and the page renders
 * every null as an em dash. There is no zero fallback anywhere in this file.
 */

/** How a figure should read, never what it means — see `MonthlyReportPresenter`. */
export type Tone = "neutral" | "positive" | "negative";

export interface TileViewModel {
  key: string;
  label: string;
  /** Already formatted, or `—`. */
  value: string;
  /** The line under the figure: a delta, a basis, a date. */
  caption: string | null;
  captionTone: Tone;
}

export interface WatchViewModel {
  headline: string;
  /** The arithmetic behind the headline, so the claim can be checked. */
  detail: string | null;
  /** True when nothing cleared a threshold — a finding, not an empty state. */
  clear: boolean;
}

export interface SignalViewModel {
  account: string;
  code: string;
  amount: string;
  /** `vs €4,550 avg` — absent when there isn't enough history to compare. */
  baseline: string | null;
  /** `2.0× its average`, `one-off`, `3 months running`, `in line`. */
  verdict: string;
  tone: Tone;
  /** `13% of the month's expenses` — null when expenses are unknown. */
  share: string | null;
}

export interface TrendPointViewModel {
  label: string;
  /** Major units, for geometry only. The labels are what a reader sees. */
  revenue: number;
  net: number;
  revenueLabel: string;
  netLabel: string;
  /** True for the month the brief is about. */
  anchor: boolean;
}

export interface ReceivableViewModel {
  party: string;
  number: string;
  amount: string;
  /** `75 days past due` / `not due yet`. */
  age: string;
  overdue: boolean;
}

export interface ReceivablesViewModel {
  total: string | null;
  overdue: string | null;
  /** `60+ days out` — the boundary comes from the selector's thresholds. */
  overdueLabel: string;
  count: number;
  rows: readonly ReceivableViewModel[];
}

export interface ReviewViewModel {
  reviewed: boolean;
  before: string | null;
  after: string | null;
  author: string | null;
  recordedAt: string | null;
}

export interface MonthlyReportViewModel {
  company: string;
  monthLabel: string;
  monthKey: string;
  currency: string;
  /** `Settled` / `Still settling` / `Month in progress`. */
  state: { label: string; tone: Tone };
  tiles: readonly TileViewModel[];
  watch: WatchViewModel | null;
  signals: readonly SignalViewModel[];
  trend: readonly TrendPointViewModel[];
  receivables: ReceivablesViewModel;
  review: ReviewViewModel;
  /** The provenance line. It is the anti-hallucination claim, printed. */
  footer: { provenance: string; settling: string | null; gaps: string | null };
}
