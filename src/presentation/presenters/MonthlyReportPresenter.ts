import type { MonthlyReportResult, ReceivableLine } from "../../application/dto/MonthlyReportResult.js";
import { CostSignal, CostSignalKind } from "../../domain/model/CostSignal.js";
import type { Money } from "../../domain/model/Money.js";
import { WatchItem, WatchKind } from "../../domain/model/WatchItem.js";
import type { MonthlyTotal } from "../../domain/model/book/TrailingMonths.js";
import type {
  MonthlyReportViewModel,
  ReceivablesViewModel,
  ReviewViewModel,
  SignalViewModel,
  TileViewModel,
  Tone,
  TrendPointViewModel,
  WatchViewModel,
} from "../viewmodels/MonthlyReportViewModel.js";
import type { MoneyFormatter } from "./MoneyFormatter.js";
import type { Presenter } from "./Presenter.js";

/** More rows than this and the block stops being readable; the count stays honest. */
const MAX_RECEIVABLE_ROWS = 8;

/**
 * The second surface (docs/architecture_phase1.md §9: "Phase 2's dashboard is a
 * second implementation of this interface, not a second use case") — and this is
 * that implementation.
 *
 * What it does **not** do is the point. It does not decide which risk to show:
 * `HighlightSelector` did, in `domain/`, where it is tested against a ledger. It
 * does not decide whether a gap matters. It does not compute a single figure —
 * every number arriving here is already a `Money` some domain object produced.
 *
 * The one judgement it owns is *tone*, and even that is kept mechanical: red
 * follows the sign of a number, never an opinion about it. There is no "runway
 * under six months is alarming" rule here, because that is a CFO's call and the
 * moment it is made in a stylesheet nobody can find it again.
 */
export class MonthlyReportPresenter
  implements Presenter<MonthlyReportResult, MonthlyReportViewModel>
{
  constructor(private readonly money: MoneyFormatter) {}

  present(result: MonthlyReportResult): MonthlyReportViewModel {
    return {
      company: result.companyName,
      monthLabel: result.monthLabel,
      monthKey: result.monthKey,
      currency: result.currency,
      state: this.state(result),
      tiles: this.tiles(result),
      watch: result.watch === null ? null : this.watch(result.watch, result.monthLabel),
      signals: result.signals.map((signal) => this.signal(signal)),
      trend: this.trend(result.trend, result.monthKey),
      receivables: this.receivables(result),
      review: this.review(result),
      footer: this.footer(result),
    };
  }

  // -------------------------------------------------------------------------

  private state(result: MonthlyReportResult): { label: string; tone: Tone } {
    if (result.partial) return { label: "Month in progress", tone: "neutral" };
    if (result.settling) return { label: "Still settling", tone: "neutral" };
    return { label: "Settled", tone: "positive" };
  }

  /**
   * The four figures of beat 1, in the order the close-out says them, so someone
   * who read the text message finds them where they expect
   * (docs/imessage_flow_phase1.md).
   */
  private tiles(result: MonthlyReportResult): TileViewModel[] {
    return [
      {
        key: "revenue",
        label: "Revenue",
        value: this.whole(result.revenue),
        caption: this.deltaCaption(result),
        captionTone: toneOfDelta(result.revenueDeltaVsPriorMonth),
      },
      {
        key: "net",
        label: "Net",
        value: this.whole(result.net),
        caption:
          result.revenue && result.expenses
            ? `${this.money.formatWhole(result.revenue)} in · ${this.money.formatWhole(result.expenses)} out`
            : null,
        captionTone: "neutral",
      },
      {
        key: "cash",
        label: "Cash",
        value: this.whole(result.cash),
        caption: `at ${this.money.formatDate(result.asOf)}`,
        captionTone: "neutral",
      },
      {
        key: "runway",
        label: "Runway",
        value: result.runway === null ? "—" : `~${result.runway.rounded()} months`,
        caption: this.runwayCaption(result),
        captionTone: "neutral",
      },
    ];
  }

  /** `-13% MoM · -17% YoY` — abbreviated because a tile caption has one line. */
  private deltaCaption(result: MonthlyReportResult): string | null {
    const parts: string[] = [];
    if (result.revenueDeltaVsPriorMonth !== null) {
      parts.push(`${this.money.percent(result.revenueDeltaVsPriorMonth)} MoM`);
    }
    if (result.revenueDeltaVsLastYear !== null) {
      parts.push(`${this.money.percent(result.revenueDeltaVsLastYear)} YoY`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  /**
   * Runway is null in three different situations and only one of them is a
   * gap. Saying "profitable — no burn to divide by" where it applies is the
   * difference between a page that looks broken and one that is explaining
   * itself; the sign of net is enough to tell that case apart, and nothing here
   * guesses at the other two.
   */
  private runwayCaption(result: MonthlyReportResult): string | null {
    if (result.runway !== null) {
      const burn = this.money.formatWhole(result.runway.monthlyBurn);
      return `${burn}/mo over the last ${result.runway.windowMonths} months`;
    }
    if (result.net !== null && result.net.isPositive()) return "profitable — no burn to divide by";
    return null;
  }

  // -------------------------------------------------------------------------

  private watch(item: WatchItem, monthLabel: string): WatchViewModel {
    switch (item.kind) {
      case WatchKind.Concentration:
        return {
          headline: `${item.subject} was ${share(item.share)} of ${monthLabel} revenue`,
          detail: item.amount ? `${this.money.formatWhole(item.amount)} of the month` : null,
          clear: false,
        };
      case WatchKind.OverdueReceivables:
        return {
          headline: `${this.whole(item.amount)} of receivables are well past due`,
          detail: item.subject ? `Largest single debt: ${item.subject}` : null,
          clear: false,
        };
      case WatchKind.RisingCost:
        return {
          headline: `${item.subject} has risen ${item.months} months running`,
          detail: item.amount ? `${this.money.formatWhole(item.amount)} this month` : null,
          clear: false,
        };
      default:
        // Not an empty state. We looked, using the same three tests as the text
        // message, and the books came back clean — which is worth saying.
        return {
          headline: `Nothing in ${monthLabel} looks out of pattern`,
          detail: "No customer concentration, no aged receivables, no cost climbing three months.",
          clear: true,
        };
    }
  }

  private signal(signal: CostSignal): SignalViewModel {
    return {
      account: signal.account.name,
      code: signal.account.code,
      amount: this.money.formatWhole(signal.amount),
      baseline:
        signal.baseline === null ? null : `vs ${this.money.formatWhole(signal.baseline)} avg`,
      verdict: this.verdict(signal),
      tone: toneOfSignal(signal.kind),
      share: signal.shareOfExpenses === null ? null : `${share(signal.shareOfExpenses)} of expenses`,
    };
  }

  private verdict(signal: CostSignal): string {
    switch (signal.kind) {
      case CostSignalKind.Spike: {
        const ratio = signal.ratio();
        return ratio === null ? "above its usual" : `${ratio.toFixed(1)}× its usual`;
      }
      case CostSignalKind.OneOff:
        // The label a reader needs is "don't panic", so it leads with `one-off`
        // and the evidence follows — this is the annual-premium case the whole
        // trailing series exists to catch.
        return signal.monthsWithActivity <= 1
          ? "one-off — only month it appears"
          : `one-off — ${signal.monthsWithActivity} months in the window`;
      case CostSignalKind.Rising:
        return `up ${signal.risingMonths} months running`;
      default:
        return "in line";
    }
  }

  private trend(series: readonly MonthlyTotal[], anchorKey: string): TrendPointViewModel[] {
    return series.map((point) => ({
      // Three letters: thirteen full month names do not fit across a strip, and
      // the series is in order, so the year is redundant to read.
      label: point.month.label().slice(0, 3),
      revenue: point.revenue.toMajor(),
      net: point.net.toMajor(),
      revenueLabel: `${point.month.label()} · ${this.money.formatWhole(point.revenue)} revenue`,
      netLabel: `${this.money.formatWhole(point.net)} net`,
      anchor: point.month.key() === anchorKey,
    }));
  }

  private receivables(result: MonthlyReportResult): ReceivablesViewModel {
    return {
      total: result.receivablesTotal === null ? null : this.whole(result.receivablesTotal),
      overdue: result.receivablesOverdue === null ? null : this.whole(result.receivablesOverdue),
      overdueLabel: `${result.overdueDays}+ days out`,
      // The true count, even when the rows below are capped — a block that shows
      // eight of fifty and says "8" is a lie the reader can't see.
      count: result.receivables.length,
      rows: result.receivables.slice(0, MAX_RECEIVABLE_ROWS).map((line) => this.receivable(line)),
    };
  }

  private receivable(line: ReceivableLine): ReceivablesViewModel["rows"][number] {
    return {
      party: line.party,
      number: line.number,
      // Full precision here, unlike the tiles: this is a document amount and
      // someone may be about to chase it for exactly this figure.
      amount: this.money.format(line.outstanding),
      age: line.daysOverdue > 0 ? `${line.daysOverdue} days past due` : "not due yet",
      overdue: line.daysOverdue > 0,
    };
  }

  private review(result: MonthlyReportResult): ReviewViewModel {
    const note = result.review;
    if (note === null) {
      return { reviewed: false, before: null, after: null, author: null, recordedAt: null };
    }
    return {
      reviewed: true,
      before: note.before,
      after: note.after,
      author: note.author,
      recordedAt: this.money.formatDate(note.recordedAt),
    };
  }

  private footer(result: MonthlyReportResult): MonthlyReportViewModel["footer"] {
    return {
      provenance:
        `${result.monthLabel} · ${result.documentCount} documents · ` +
        `as of ${this.money.formatDate(result.asOf)} · read-only from Odoo`,
      settling: result.settling ? "Books for this month may still be settling" : null,
      gaps: result.gaps.length > 0 ? `Couldn't read: ${result.gaps.join(", ")}` : null,
    };
  }

  /** The one place a missing figure becomes a dash. */
  private whole(money: Money | null): string {
    return money === null ? "—" : this.money.formatWhole(money);
  }
}

/** `41%` — unsigned, because a share is not a change. */
function share(fraction: number | null): string {
  return fraction === null ? "—" : `${Math.round(fraction * 100)}%`;
}

function toneOfDelta(delta: number | null): Tone {
  if (delta === null || delta === 0) return "neutral";
  return delta > 0 ? "positive" : "negative";
}

/**
 * A one-off is **neutral**, not red. It is the single most important line in
 * this file: colouring an annual insurance premium as a problem is exactly the
 * false alarm the trailing series was added to prevent.
 */
function toneOfSignal(kind: CostSignalKind): Tone {
  if (kind === CostSignalKind.Spike || kind === CostSignalKind.Rising) return "negative";
  return "neutral";
}
