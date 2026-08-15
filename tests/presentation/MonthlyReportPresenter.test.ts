import { describe, expect, it } from "vitest";

import { demoBook } from "../../src/adapters/outbound/odoo/fixtures/demoBook.js";
import { MonthlyReportResult } from "../../src/application/dto/MonthlyReportResult.js";
import { CostSignal, CostSignalKind } from "../../src/domain/model/CostSignal.js";
import { AccountRef, ClientId } from "../../src/domain/model/Ids.js";
import { Money } from "../../src/domain/model/Money.js";
import { ReviewNote } from "../../src/domain/model/ReviewNote.js";
import { WatchItem } from "../../src/domain/model/WatchItem.js";
import { ProfitAndLoss } from "../../src/domain/model/book/ProfitAndLoss.js";
import { AgingAnalyzer } from "../../src/domain/services/AgingAnalyzer.js";
import { HighlightSelector } from "../../src/domain/services/HighlightSelector.js";
import { RunwayEstimator } from "../../src/domain/services/RunwayEstimator.js";
import { MoneyFormatter } from "../../src/presentation/presenters/MoneyFormatter.js";
import { MonthlyReportPresenter } from "../../src/presentation/presenters/MonthlyReportPresenter.js";
import { buildBook, JULY_2026, USD } from "../support/books.js";

const presenter = new MonthlyReportPresenter(new MoneyFormatter());
const highlights = new HighlightSelector();

/** The use case's own wiring, so a test and the server can't drift apart. */
function present(book = demoBook(JULY_2026), review: ReviewNote | null = null) {
  const receivables = book.openReceivables;
  return presenter.present(
    MonthlyReportResult.from({
      book,
      watch: highlights.watchItem(book),
      signals: highlights.costSignals(book),
      runway: new RunwayEstimator().estimate(book),
      receivablesOverdue:
        receivables === null ? null : new AgingAnalyzer().analyze(receivables, book.asOf()).over(60),
      overdueDays: 60,
      review,
    }),
  );
}

describe("MonthlyReportPresenter", () => {
  it("renders the four close-out figures in the order the thread says them", () => {
    const view = present();
    expect(view.tiles.map((tile) => tile.label)).toEqual(["Revenue", "Net", "Cash", "Runway"]);
    expect(view.tiles[0]?.value).toBe("€68.200");
    expect(view.tiles[1]?.value).toBe("-€24.800");
    expect(view.tiles[3]?.value).toBe("~7 months");
  });

  it("prints a missing figure as a dash and never as a zero", () => {
    // A book with no cash part: the tile has nothing to say and must say so.
    const view = present(buildBook({ bare: true, parts: {} }));
    const cash = view.tiles.find((tile) => tile.key === "cash");
    expect(cash?.value).toBe("—");
    expect(view.tiles.find((tile) => tile.key === "runway")?.value).toBe("—");
  });

  it("explains a null runway when the month was profitable", () => {
    const profitable = buildBook({
      parts: {
        pnl: new ProfitAndLoss(
          [
            { accountType: "income", amount: Money.of(90_000, USD) },
            { accountType: "expense", amount: Money.of(60_000, USD) },
          ],
          USD,
        ),
      },
    });
    const view = present(profitable);
    expect(view.tiles.find((tile) => tile.key === "runway")?.caption).toContain("profitable");
  });

  it("keeps a one-off neutral — the row exists to stop a false alarm", () => {
    const oneOff = new CostSignal(
      AccountRef.of(1, "6600", "Insurance"),
      Money.of(1_400, USD),
      Money.of(0, USD),
      CostSignalKind.OneOff,
      1,
      0,
      0.015,
    );
    const view = presenter.present(
      MonthlyReportResult.from({
        book: buildBook(),
        watch: null,
        signals: [oneOff],
        runway: null,
        receivablesOverdue: null,
        overdueDays: 60,
        review: null,
      }),
    );

    expect(view.signals[0]?.tone).toBe("neutral");
    expect(view.signals[0]?.verdict).toBe("one-off — only month it appears");
  });

  it("colours a spike and a rising cost, and nothing else", () => {
    const view = present();
    const byAccount = new Map(view.signals.map((signal) => [signal.account, signal]));
    expect(byAccount.get("Software & Tooling")?.tone).toBe("negative");
    expect(byAccount.get("Insurance")?.tone).toBe("neutral");
  });

  describe("the watch line", () => {
    const render = (item: WatchItem) =>
      presenter.present(
        MonthlyReportResult.from({
          book: buildBook(),
          watch: item,
          signals: [],
          runway: null,
          receivablesOverdue: null,
          overdueDays: 60,
          review: null,
        }),
      ).watch;

    it("names the customer and the share for concentration", () => {
      const watch = render(WatchItem.concentration("Northwind", 0.41, Money.of(27_300, USD)));
      expect(watch?.headline).toBe("Northwind was 41% of July 2026 revenue");
      expect(watch?.clear).toBe(false);
    });

    it("counts a rising cost in months", () => {
      const watch = render(WatchItem.risingCost("Payroll", Money.of(46_800, USD), 3));
      expect(watch?.headline).toBe("Payroll has risen 3 months running");
    });

    it("treats a clean month as a finding, not an empty state", () => {
      const watch = render(WatchItem.nothing());
      expect(watch?.clear).toBe(true);
      expect(watch?.headline).toBe("Nothing in July 2026 looks out of pattern");
    });
  });

  it("ages receivables to month end and marks what is late", () => {
    const view = present();
    expect(view.receivables.total).toBe("€44.708");
    expect(view.receivables.overdue).toBe("€18.400");
    expect(view.receivables.overdueLabel).toBe("60+ days out");
    expect(view.receivables.rows[0]?.age).toBe("75 days past due");
    // Full precision on a document someone may be about to chase.
    expect(view.receivables.rows[0]?.amount).toBe("€18.400,00");
  });

  it("prints the provenance line the whole product rests on", () => {
    expect(present().footer.provenance).toBe(
      "July 2026 · 50 documents · as of 31 Jul 2026 · read-only from Odoo",
    );
  });

  it("never presents an unreviewed month as reviewed", () => {
    expect(present().review).toEqual({
      reviewed: false,
      before: null,
      after: null,
      author: null,
      recordedAt: null,
    });
  });

  it("carries both halves of a recorded review", () => {
    const note = new ReviewNote(
      ClientId.of("demo"),
      JULY_2026,
      "Likely fine for five months.",
      "Fix the Northwind collection first.",
      "Dana Whitfield",
      new Date("2026-08-15T09:00:00.000Z"),
    );
    const view = present(demoBook(JULY_2026), note);
    expect(view.review.reviewed).toBe(true);
    expect(view.review.before).toBe("Likely fine for five months.");
    expect(view.review.after).toBe("Fix the Northwind collection first.");
    expect(view.review.recordedAt).toBe("15 Aug 2026");
  });

  it("marks the anchor month in the trend and nothing else", () => {
    const trend = present().trend;
    expect(trend).toHaveLength(13);
    expect(trend.filter((point) => point.anchor)).toHaveLength(1);
    expect(trend[12]?.anchor).toBe(true);
    expect(trend[12]?.net).toBe(-24_800);
  });
});
