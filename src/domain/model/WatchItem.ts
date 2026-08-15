import { Money } from "./Money.js";

/**
 * Which of the grounded shapes a watch item took (docs/imessage_flow_phase1.md,
 * beat 1). The order they are listed in is the order of preference, and
 * `HighlightSelector` walks them in exactly that order.
 */
export const WatchKind = {
  Concentration: "concentration",
  OverdueReceivables: "overdue_receivables",
  RisingCost: "rising_cost",
  /** Nothing cleared a threshold — a real answer, not the absence of one. */
  Nothing: "nothing",
} as const;

export type WatchKind = (typeof WatchKind)[keyof typeof WatchKind];

/**
 * The one thing in a month's books most worth watching.
 *
 * It carries **fields, not a sentence**: `domain/` decides *what* is worth
 * saying and `presentation/` decides how it reads, so the same item prints one
 * way in a text message and another on a dashboard tile without the selection
 * rule being written twice.
 *
 * There is at most one — a report that flags four risks has flagged none
 * (docs/imessage_flow.md, beat 1: "Watching this month: [TOP_RISK]", singular).
 */
export class WatchItem {
  private constructor(
    readonly kind: WatchKind,
    /** The customer, account or ledger the item is about; empty for `Nothing`. */
    readonly subject: string,
    readonly amount: Money | null,
    /** A fraction — 0.41 is 41%. Null when the shape has no share to state. */
    readonly share: number | null,
    /** Consecutive rising months, for `RisingCost` only. */
    readonly months: number | null,
  ) {}

  /** One customer carried an outsized part of the month's revenue. */
  static concentration(party: string, share: number, amount: Money): WatchItem {
    return new WatchItem(WatchKind.Concentration, party, amount, share, null);
  }

  /**
   * Money owed and well past due. `party` is the largest single debtor when one
   * of them accounts for effectively all of it — "$18,400 is 60+ days out, all
   * of it Northwind" is a more actionable sentence than the total alone.
   */
  static overdueReceivables(amount: Money, share: number, party: string): WatchItem {
    return new WatchItem(WatchKind.OverdueReceivables, party, amount, share, null);
  }

  /** A cost that has gone up every month for `months` months running. */
  static risingCost(account: string, amount: Money, months: number): WatchItem {
    return new WatchItem(WatchKind.RisingCost, account, amount, null, months);
  }

  /**
   * Deliberately a value rather than `null`.
   *
   * "Nothing in July looks out of pattern" is a perfectly good line and a far
   * better one than a manufactured worry — but only if the code that renders it
   * can tell "we looked and found nothing" apart from "we didn't look".
   */
  static nothing(): WatchItem {
    return new WatchItem(WatchKind.Nothing, "", null, null, null);
  }

  isNothing(): boolean {
    return this.kind === WatchKind.Nothing;
  }
}
