import { beforeEach, describe, expect, it } from "vitest";

import {
  BriefController,
  type BriefAudience,
} from "../../../../src/adapters/inbound/web/BriefController.js";
import { FixtureBookRepository } from "../../../../src/adapters/outbound/odoo/fixtures/FixtureBookRepository.js";
import { InMemoryReviewNotes } from "../../../../src/adapters/outbound/review/InMemoryReviewNotes.js";
import { BuildMonthlyReport } from "../../../../src/application/usecases/BuildMonthlyReport.js";
import { ClientId } from "../../../../src/domain/model/Ids.js";
import { AgingAnalyzer } from "../../../../src/domain/services/AgingAnalyzer.js";
import { HighlightSelector } from "../../../../src/domain/services/HighlightSelector.js";
import { RunwayEstimator } from "../../../../src/domain/services/RunwayEstimator.js";
import { MoneyFormatter } from "../../../../src/presentation/presenters/MoneyFormatter.js";
import { MonthlyReportPresenter } from "../../../../src/presentation/presenters/MonthlyReportPresenter.js";
import type { MonthlyReportViewModel } from "../../../../src/presentation/viewmodels/MonthlyReportViewModel.js";
import { AUG_15_2026, StubClock } from "../../../support/books.js";

const DEMO = ClientId.of("demo");

/** Serves exactly one client — the whole of Phase 1's access control. */
const audience: BriefAudience = {
  default: () => DEMO,
  resolve: (requested) => (requested === "demo" ? DEMO : null),
};

function build() {
  const reviews = new InMemoryReviewNotes();
  const report = new BuildMonthlyReport(
    new FixtureBookRepository(10),
    new RunwayEstimator(),
    new HighlightSelector(),
    new AgingAnalyzer(),
    reviews,
    new StubClock(AUG_15_2026),
    10,
  );
  const controller = new BriefController(
    report,
    new MonthlyReportPresenter(new MoneyFormatter()),
    reviews,
    audience,
    new StubClock(AUG_15_2026),
    10,
  );
  return { controller, reviews };
}

const query = (search = "") => new URLSearchParams(search);

describe("BriefController", () => {
  let controller: BriefController;

  beforeEach(() => {
    controller = build().controller;
  });

  describe("GET the brief", () => {
    it("defaults to the last settled month when the URL names none", async () => {
      const { status, body } = await controller.brief(query());
      expect(status).toBe(200);
      // On 15 Aug with a 10-day settling window, that is July.
      expect((body as MonthlyReportViewModel).monthKey).toBe("2026-07");
      expect((body as MonthlyReportViewModel).company).toBe("Blackthorn Studio");
    });

    it("honours a month named in the URL", async () => {
      const { body } = await controller.brief(query("month=2026-05"));
      expect((body as MonthlyReportViewModel).monthLabel).toBe("May 2026");
    });

    it("404s a client it does not serve, rather than reading their books", async () => {
      const { status, body } = await controller.brief(query("client=someone-elses-company"));
      expect(status).toBe(404);
      expect(body).toEqual({ error: "No brief published for that client." });
    });

    it("400s an unreadable month in Tammy's own words", async () => {
      const { status, body } = await controller.brief(query("month=whenever"));
      expect(status).toBe(400);
      expect(String((body as { error: string }).error)).toContain("I couldn't tell which month");
    });
  });

  describe("POST a review", () => {
    it("records both halves and shows them on the next fetch", async () => {
      const recorded = await controller.recordReview(query(), {
        before: "Likely fine for five months.",
        after: "Fix the Northwind collection first.",
        author: "Dana Whitfield",
      });
      expect(recorded.status).toBe(200);
      expect(recorded.body).toEqual({ recorded: true, month: "2026-07" });

      const { body } = await controller.brief(query());
      expect((body as MonthlyReportViewModel).review).toMatchObject({
        reviewed: true,
        before: "Likely fine for five months.",
        after: "Fix the Northwind collection first.",
        author: "Dana Whitfield",
      });
    });

    it("leaves other months unreviewed", async () => {
      await controller.recordReview(query("month=2026-07"), { before: "a", after: "b" });
      const { body } = await controller.brief(query("month=2026-06"));
      expect((body as MonthlyReportViewModel).review.reviewed).toBe(false);
    });

    const malformed: readonly [unknown, string][] = [
      [{ after: "only the fix" }, "no before"],
      [{ before: "only the take" }, "no after"],
      [{ before: "  ", after: "b" }, "a blank before"],
      ["not an object", "a non-object body"],
    ];

    it.each(malformed)("rejects a payload with %s", async (payload) => {
      const { status } = await controller.recordReview(query(), payload);
      expect(status).toBe(400);
    });

    it("defaults the author rather than attributing the note to nobody", async () => {
      await controller.recordReview(query(), { before: "a", after: "b" });
      const { body } = await controller.brief(query());
      expect((body as MonthlyReportViewModel).review.author).toBe("Fractional CFO");
    });

    it("will not record against a client it does not serve", async () => {
      const { status } = await controller.recordReview(query("client=intruder"), {
        before: "a",
        after: "b",
      });
      expect(status).toBe(404);
    });
  });
});
