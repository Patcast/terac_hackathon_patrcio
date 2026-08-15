import { describe, expect, it } from "vitest";
import type { BookRequest } from "../../../src/adapters/outbound/accounting/LedgerReport.js";
import { OdooCompanyContext } from "../../../src/adapters/outbound/odoo/OdooCompanyContext.js";
import { OdooMapper } from "../../../src/adapters/outbound/odoo/OdooMapper.js";
import { odooReportCatalogue } from "../../../src/adapters/outbound/odoo/reports/index.js";
import { BalanceSheetReport } from "../../../src/adapters/outbound/odoo/reports/BalanceSheetReport.js";
import { CashPositionReport } from "../../../src/adapters/outbound/odoo/reports/CashPositionReport.js";
import { CustomerInvoicesReport } from "../../../src/adapters/outbound/odoo/reports/CustomerInvoicesReport.js";
import { OpenPayablesReport } from "../../../src/adapters/outbound/odoo/reports/OpenPayablesReport.js";
import { OpenReceivablesReport } from "../../../src/adapters/outbound/odoo/reports/OpenReceivablesReport.js";
import { PartnerBalancesReport } from "../../../src/adapters/outbound/odoo/reports/PartnerBalancesReport.js";
import { ProfitAndLossReport } from "../../../src/adapters/outbound/odoo/reports/ProfitAndLossReport.js";
import { TaxSummaryReport } from "../../../src/adapters/outbound/odoo/reports/TaxSummaryReport.js";
import { TrailingByCategoryReport } from "../../../src/adapters/outbound/odoo/reports/TrailingByCategoryReport.js";
import { TrailingMonthsReport } from "../../../src/adapters/outbound/odoo/reports/TrailingMonthsReport.js";
import { TrialBalanceReport } from "../../../src/adapters/outbound/odoo/reports/TrialBalanceReport.js";
import { PART_TIERS } from "../../../src/domain/model/BookPart.js";
import { ClientId } from "../../../src/domain/model/Ids.js";
import { Month } from "../../../src/domain/model/Month.js";
import { FakeOdoo, findClause, hasClause } from "./fakeOdoo.js";

const month = Month.of(2026, 7);
const request: BookRequest = {
  clientId: ClientId.of("demo"),
  month,
  period: month.period(),
  asOf: month.endsOn(),
  trailingMonths: 12,
  companyId: null,
};

function harness() {
  const rpc = new FakeOdoo();
  return { rpc, mapper: new OdooMapper(), company: new OdooCompanyContext(rpc) };
}

describe("documents — reports 1 to 4", () => {
  it("report 1 reads posted out_invoice *and* out_refund inside the month", () => {
    const { rpc, mapper, company } = harness();
    return new CustomerInvoicesReport(rpc, mapper, company).run(request).then(() => {
      const { model, domain, options } = rpc.lastSearchRead();
      expect(model).toBe("account.move");
      expect(findClause(domain, "move_type")?.[2]).toEqual(["out_invoice", "out_refund"]);
      expect(findClause(domain, "state")?.[2]).toBe("posted");
      expect(findClause(domain, "invoice_date", ">=")?.[2]).toBe("2026-07-01");
      expect(findClause(domain, "invoice_date", "<=")?.[2]).toBe("2026-07-31");
      expect(options.limit).toBe(500);
    });
  });

  it("report 3 has NO lower date bound — the five-month-old unpaid invoice is the point", async () => {
    const { rpc, mapper, company } = harness();
    await new OpenReceivablesReport(rpc, mapper, company).run(request);

    const { domain, options } = rpc.lastSearchRead();
    expect(hasClause(domain, "invoice_date", ">=")).toBe(false);
    expect(hasClause(domain, "date", ">=")).toBe(false);
    expect(findClause(domain, "invoice_date", "<=")?.[2]).toBe("2026-07-31");
    expect(findClause(domain, "payment_state", "not in")?.[2]).toEqual([
      "paid",
      "reversed",
      "invoicing_legacy",
    ]);
    // Over the cap, keep the biggest debts, not the newest ones.
    expect(options.order).toBe("amount_residual desc");
  });

  it("report 4 has no lower date bound either", async () => {
    const { rpc, mapper, company } = harness();
    await new OpenPayablesReport(rpc, mapper, company).run(request);

    const { domain } = rpc.lastSearchRead();
    expect(hasClause(domain, "invoice_date", ">=")).toBe(false);
    expect(findClause(domain, "move_type")?.[2]).toEqual(["in_invoice", "in_refund"]);
  });
});

describe("balances are cumulative — reports 8, 9 and 12", () => {
  const cumulative: [string, (h: ReturnType<typeof harness>) => Promise<unknown>][] = [
    ["balance sheet", (h) => new BalanceSheetReport(h.rpc, h.mapper, h.company).run(request)],
    ["cash position", (h) => new CashPositionReport(h.rpc, h.mapper, h.company).run(request)],
    ["partner balances", (h) => new PartnerBalancesReport(h.rpc, h.mapper, h.company).run(request)],
  ];

  for (const [name, run] of cumulative) {
    it(`${name} carries only an upper date bound`, async () => {
      const h = harness();
      await run(h);
      const { spec } = h.rpc.lastReadGroup();
      const domain = spec.domain ?? [];
      // A `date >=` on a balance turns stock into flow and the number still looks
      // entirely plausible — docs §4's worst kind of wrong.
      expect(hasClause(domain, "date", ">=")).toBe(false);
      expect(findClause(domain, "date", "<=")?.[2]).toBe("2026-07-31");
      expect(findClause(domain, "parent_state")?.[2]).toBe("posted");
    });
  }
});

describe("movement is bounded both ends — reports 5, 7, 11 and 13", () => {
  const movement: [string, (h: ReturnType<typeof harness>) => Promise<unknown>][] = [
    ["profit and loss", (h) => new ProfitAndLossReport(h.rpc, h.mapper, h.company).run(request)],
    ["trial balance", (h) => new TrialBalanceReport(h.rpc, h.mapper, h.company).run(request)],
    ["tax summary", (h) => new TaxSummaryReport(h.rpc, h.mapper, h.company).run(request)],
  ];

  for (const [name, run] of movement) {
    it(`${name} bounds the month at both ends`, async () => {
      const h = harness();
      await run(h);
      const domain = h.rpc.lastReadGroup().spec.domain ?? [];
      expect(findClause(domain, "date", ">=")?.[2]).toBe("2026-07-01");
      expect(findClause(domain, "date", "<=")?.[2]).toBe("2026-07-31");
    });
  }
});

describe("report 6 — the trailing series", () => {
  it("groups by date:month over the whole window in one read_group", async () => {
    const { rpc, mapper, company } = harness();
    await new TrailingMonthsReport(rpc, mapper, company).run(request);

    const { model, spec } = rpc.lastReadGroup();
    expect(model).toBe("account.move.line");
    expect(spec.groupby).toEqual(["account_type", "date:month"]);
    expect(rpc.readGroupCalls).toHaveLength(1); // ninety rows, one round trip

    const domain = spec.domain ?? [];
    expect(findClause(domain, "date", ">=")?.[2]).toBe("2025-08-01");
    expect(findClause(domain, "date", "<=")?.[2]).toBe("2026-07-31");
  });
});

describe("report 16 — the trailing window by account", () => {
  it("groups by account and month over the same window, in one read_group", async () => {
    const { rpc, mapper, company } = harness();
    await new TrailingByCategoryReport(rpc, mapper, company).run(request);

    const { model, spec } = rpc.lastReadGroup();
    expect(model).toBe("account.move.line");
    // `account_type` rides along so the mapper can apply the sign convention
    // without a second lookup against the chart of accounts.
    expect(spec.groupby).toEqual(["account_id", "account_type", "date:month"]);
    expect(rpc.readGroupCalls).toHaveLength(1);

    const domain = spec.domain ?? [];
    expect(findClause(domain, "date", ">=")?.[2]).toBe("2025-08-01");
    expect(findClause(domain, "date", "<=")?.[2]).toBe("2026-07-31");
  });

  it("stays on the P&L — a balance history would be a different question", async () => {
    const { rpc, mapper, company } = harness();
    await new TrailingByCategoryReport(rpc, mapper, company).run(request);

    const types = findClause(rpc.lastReadGroup().spec.domain ?? [], "account_type", "in")?.[2];
    expect(types).toContain("income");
    expect(types).toContain("expense");
    expect(types).not.toContain("asset_cash");
  });
});

describe("report 11 — tax_line_id, not tax_ids", () => {
  it("selects lines that *are* the tax", async () => {
    const { rpc, mapper, company } = harness();
    await new TaxSummaryReport(rpc, mapper, company).run(request);

    const { spec } = rpc.lastReadGroup();
    const domain = spec.domain ?? [];
    expect(findClause(domain, "tax_line_id", "!=")?.[2]).toBe(false);
    // `tax_ids` marks a line that *has* tax; summing it double-counts the return.
    expect(hasClause(domain, "tax_ids")).toBe(false);
    expect(spec.groupby).toContain("move_type"); // sales vs purchase, same query
  });
});

describe("the catalogue", () => {
  it("has sixteen reports, one per book part, at the tiers the domain declares", () => {
    const { rpc, mapper, company } = harness();
    const reports = odooReportCatalogue(rpc, mapper, company);

    expect(reports).toHaveLength(16);
    expect(new Set(reports.map((r) => r.part)).size).toBe(16);
    for (const report of reports) {
      expect(report.tier).toBe(PART_TIERS[report.part]);
    }
  });

  it("reads the company once however many reports ask for a currency", async () => {
    const { rpc, mapper, company } = harness();
    await Promise.all([
      new ProfitAndLossReport(rpc, mapper, company).run(request),
      new CashPositionReport(rpc, mapper, company).run(request),
      new TrialBalanceReport(rpc, mapper, company).run(request),
    ]);

    const companyReads = rpc.searchReadCalls.filter((c) => c.model === "res.company");
    expect(companyReads).toHaveLength(1);
  });
});
