import { describe, expect, it } from "vitest";
import { OdooMapper } from "../../../src/adapters/outbound/odoo/OdooMapper.js";
import { Month } from "../../../src/domain/model/Month.js";

const EUR = "EUR";
const mapper = new OdooMapper();

/** A `read_group` bucket as Odoo actually returns it, `__range` and all. */
function monthRow(
  accountType: string,
  balance: number,
  from: string,
  label: string,
): Record<string, unknown> {
  return {
    account_type: accountType,
    "date:month": label,
    balance,
    __range: { "date:month": { from, to: nextMonthOf(from) } },
  };
}

function nextMonthOf(from: string): string {
  const start = new Date(`${from}T00:00:00.000Z`);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

describe("OdooMapper — the sign flip", () => {
  it("turns a credit-negative income row into positive revenue", () => {
    // Odoo stores credits negative. Read straight through, this is a business
    // that loses money on every sale — docs §4's most expensive demo bug.
    const pnl = mapper.toProfitAndLoss(
      [
        { account_type: "income", balance: -68_200 },
        { account_type: "expense", balance: 93_000 },
      ],
      EUR,
    );

    expect(pnl.revenue().toMajor()).toBe(68_200);
    expect(pnl.revenue().isPositive()).toBe(true);
    expect(pnl.expenses().toMajor()).toBe(93_000);
    expect(pnl.expenses().isPositive()).toBe(true);
    expect(pnl.net().toMajor()).toBe(-24_800);
  });

  it("flips income the same way inside the trailing series", () => {
    const anchor = Month.of(2026, 7);
    const trailing = mapper.toTrailingMonths(
      [
        monthRow("income", -68_200, "2026-07-01", "July 2026"),
        monthRow("expense", 93_000, "2026-07-01", "July 2026"),
      ],
      anchor,
      12,
      EUR,
    );

    const july = trailing.at(anchor);
    expect(july?.revenue.toMajor()).toBe(68_200);
    expect(july?.net.toMajor()).toBe(-24_800);
  });

  it("leaves cash alone — a bank account is debit-natured already", () => {
    const cash = mapper.toCashPosition(
      [{ account_id: [12, "1000 Operating Account"], balance: 91_200 }],
      new Date("2026-07-31T23:59:59.999Z"),
      EUR,
    );
    expect(cash.total().toMajor()).toBe(91_200);
  });

  it("presents payables as a positive debt, not a credit balance", () => {
    const partners = mapper.toPartnerBalances(
      [
        { partner_id: [101, "Northwind Systems"], account_type: "asset_receivable", balance: 18_400 },
        {
          partner_id: [201, "Atlas Cloud Services"],
          account_type: "liability_payable",
          balance: -9_400,
        },
      ],
      EUR,
    );

    expect(partners.totalReceivable().toMajor()).toBe(18_400);
    expect(partners.totalPayable().toMajor()).toBe(9_400);
  });
});

describe("OdooMapper — amount_total vs amount_residual", () => {
  const row = {
    id: 4711,
    name: "INV/2026/0201",
    move_type: "out_invoice",
    partner_id: [102, "Devlin Foods"],
    invoice_date: "2026-05-21",
    invoice_date_due: "2026-06-20",
    amount_total: 15_900,
    amount_total_signed: 15_900,
    amount_residual: 11_900,
    amount_residual_signed: 11_900,
    payment_state: "partial",
  };

  it("lands billed in total and outstanding in outstanding", () => {
    const invoice = mapper.toInvoice(row, EUR);
    expect(invoice?.total.toMajor()).toBe(15_900);
    expect(invoice?.outstanding.toMajor()).toBe(11_900);
    expect(invoice?.status).toBe("partial");
  });

  it("keeps a ledger's billed and outstanding totals distinct", () => {
    const ledger = mapper.toInvoiceLedger([row], EUR);
    expect(ledger.totalBilled().toMajor()).toBe(15_900);
    expect(ledger.totalOutstanding().toMajor()).toBe(11_900);
  });

  it("makes a vendor bill a positive debt and a vendor credit note a negative one", () => {
    const bill = mapper.toInvoice(
      { ...row, move_type: "in_invoice", amount_total_signed: -1_013, amount_residual_signed: -1_013 },
      EUR,
    );
    expect(bill?.direction).toBe("inbound");
    expect(bill?.total.toMajor()).toBe(1_013);

    const refund = mapper.toInvoice(
      { ...row, move_type: "in_refund", amount_total_signed: 1.8, amount_residual_signed: 1.8 },
      EUR,
    );
    expect(refund?.total.toMajor()).toBe(-1.8);
  });

  it("falls back to the unsigned pair and flips the credit note by hand", () => {
    // An Odoo that doesn't publish the `_signed` fields must not end up with a
    // credit note *adding* to receivables.
    const refund = mapper.toInvoice(
      {
        id: 12,
        name: "RINV/2026/0009",
        move_type: "out_refund",
        invoice_date: "2026-07-04",
        amount_total: 480,
        amount_residual: 480,
        payment_state: "not_paid",
      },
      EUR,
    );
    expect(refund?.total.toMajor()).toBe(-480);
    expect(refund?.outstanding.toMajor()).toBe(-480);
  });
});

describe("OdooMapper — date:month buckets", () => {
  it("resolves the month from __range, not from the label", () => {
    // A `res.users` with a French language turns "July 2026" into "juillet 2026"
    // and any label parser into a silent gap in the series (docs §4).
    const anchor = Month.of(2026, 7);
    const trailing = mapper.toTrailingMonths(
      [
        monthRow("income", -78_400, "2026-06-01", "juin 2026"),
        monthRow("income", -68_200, "2026-07-01", "juillet 2026"),
      ],
      anchor,
      12,
      EUR,
    );

    expect(trailing.at(Month.of(2026, 6))?.revenue.toMajor()).toBe(78_400);
    expect(trailing.at(anchor)?.revenue.toMajor()).toBe(68_200);
  });

  it("falls back to the __domain bound when __range is absent", () => {
    const anchor = Month.of(2026, 7);
    const trailing = mapper.toTrailingMonths(
      [
        {
          account_type: "income",
          "date:month": "Juli 2026",
          balance: -68_200,
          __domain: [
            ["parent_state", "=", "posted"],
            ["date", ">=", "2026-07-01"],
            ["date", "<", "2026-08-01"],
          ],
        },
      ],
      anchor,
      12,
      EUR,
    );
    expect(trailing.at(anchor)?.revenue.toMajor()).toBe(68_200);
  });

  it("fills months with no postings rather than shortening the series", () => {
    const trailing = mapper.toTrailingMonths([], Month.of(2026, 7), 12, EUR);
    expect(trailing.series()).toHaveLength(12);
    expect(trailing.series()[0]?.month.key()).toBe("2025-08");
    expect(trailing.current()?.net.isZero()).toBe(true);
  });
});

describe("OdooMapper — degrading instead of throwing", () => {
  it("turns a false partner into PartyRef.unknown()", () => {
    const invoice = mapper.toInvoice(
      {
        id: 9,
        name: "BILL/2026/07/0003",
        move_type: "in_invoice",
        partner_id: false, // Odoo's answer for a bill entered without a vendor
        invoice_date: "2026-07-03",
        amount_total_signed: -1_013,
        amount_residual_signed: 0,
        payment_state: "paid",
      },
      EUR,
    );
    expect(invoice?.party.name).toBe("Unknown");
    expect(invoice?.party.id).toBe("0");
  });

  it("survives a row with nothing but an id", () => {
    const invoice = mapper.toInvoice({ id: 9, date: "2026-07-03" }, EUR);
    expect(invoice?.number).toBe("#9");
    expect(invoice?.total.isZero()).toBe(true);
    expect(invoice?.status).toBe("not_paid"); // unknown state stays owed, not vanished
  });

  it("skips a row with no id and a row with no date at all", () => {
    expect(mapper.toInvoice({ name: "orphan" }, EUR)).toBeNull();
    expect(mapper.toInvoice({ id: 9, name: "undated" }, EUR)).toBeNull();
  });

  it("keeps a partner-less group row instead of dropping the money", () => {
    const revenue = mapper.toPartnerRevenue([{ partner_id: false, balance: -1_800 }], EUR);
    expect(revenue.total().toMajor()).toBe(1_800);
    expect(revenue.parties[0]?.party.name).toBe("Unknown");
  });

  it("maps an unmodelled payment_state to not_paid", () => {
    const invoice = mapper.toInvoice(
      { id: 3, move_type: "out_invoice", invoice_date: "2026-07-01", payment_state: "blocked" },
      EUR,
    );
    expect(invoice?.status).toBe("not_paid");
  });
});

describe("OdooMapper — tax", () => {
  it("splits sales from purchases by move_type and leaves both positive", () => {
    const tax = mapper.toTaxSummary(
      [
        { tax_line_id: [3, "21%"], move_type: "out_invoice", balance: -13_944 },
        { tax_line_id: [3, "21%"], move_type: "out_refund", balance: 200 },
        { tax_line_id: [21, "21% S"], move_type: "in_invoice", balance: 7_413 },
      ],
      EUR,
    );

    expect(tax.charged().toMajor()).toBe(13_744); // the credit note reduces it
    expect(tax.reclaimable().toMajor()).toBe(7_413);
    expect(tax.netPayable().toMajor()).toBe(6_331);
  });
});

describe("OdooMapper — account labels", () => {
  it("splits read_group's '400000 Customers' into a code and a name", () => {
    const trial = mapper.toTrialBalance(
      [{ account_id: [161, "6000 Payroll"], account_type: "expense", balance: 46_800 }],
      EUR,
    );
    const line = trial.lines[0];
    expect(line?.account.code).toBe("6000");
    expect(line?.account.name).toBe("Payroll");
    expect(line?.movement.toMajor()).toBe(46_800);
  });
});

/** A report-16 bucket: grouped by account *and* type *and* month. */
function categoryRow(
  account: [number, string],
  accountType: string,
  balance: number,
  from: string,
): Record<string, unknown> {
  return {
    account_id: account,
    account_type: accountType,
    "date:month": "ignored — the label is localised",
    balance,
    __range: { "date:month": { from, to: nextMonthOf(from) } },
  };
}

describe("OdooMapper — report 16, the trailing window by account", () => {
  const anchor = Month.of(2026, 7);

  it("zero-fills a month an account did not move in", () => {
    // A quarterly bill must not have a shorter series than a monthly one, or it
    // averages as though it were charged every month.
    const byCategory = mapper.toTrailingByCategory(
      [
        categoryRow([161, "6600 Insurance"], "expense", 1_400, "2026-07-01"),
        // Outside a 12-month window ending July 2026, which starts Aug 2025.
        categoryRow([161, "6600 Insurance"], "expense", 1_400, "2025-06-01"),
      ],
      anchor,
      12,
      EUR,
    );

    const insurance = byCategory.categories[0];
    expect(insurance?.months).toHaveLength(12);
    expect(insurance?.monthsWithActivity()).toBe(1);
    expect(insurance?.at(Month.of(2026, 3))?.toMajor()).toBe(0);
  });

  it("applies the sign flip per account type, so revenue comes out positive", () => {
    const byCategory = mapper.toTrailingByCategory(
      [
        categoryRow([1, "4000 Product Revenue"], "income", -68_200, "2026-07-01"),
        categoryRow([2, "6000 Payroll"], "expense", 46_800, "2026-07-01"),
      ],
      anchor,
      12,
      EUR,
    );

    expect(byCategory.find("1")?.latest().toMajor()).toBe(68_200);
    expect(byCategory.find("2")?.latest().toMajor()).toBe(46_800);
  });

  it("resolves each bucket by __range rather than the localised label", () => {
    const byCategory = mapper.toTrailingByCategory(
      [
        categoryRow([2, "6000 Payroll"], "expense", 45_500, "2026-06-01"),
        categoryRow([2, "6000 Payroll"], "expense", 46_800, "2026-07-01"),
      ],
      anchor,
      12,
      EUR,
    );

    const payroll = byCategory.find("2");
    expect(payroll?.at(Month.of(2026, 6))?.toMajor()).toBe(45_500);
    // Two: the zero-filled May into June is a genuine rise, not padding — a line
    // that starts mid-window really has climbed since it started.
    expect(payroll?.risingStreak()).toBe(2);
  });

  it("keeps the accounts carrying the money and drops the tail", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      categoryRow([i, `7${String(i).padStart(3, "0")} Account ${i}`], "expense", i * 100, "2026-07-01"),
    );

    const byCategory = mapper.toTrailingByCategory(rows, anchor, 12, EUR, 5);

    expect(byCategory.size()).toBe(5);
    expect(byCategory.top(1)[0]?.latest().toMajor()).toBe(2_900);
  });

  it("ignores balance-sheet accounts — this is a P&L history", () => {
    const byCategory = mapper.toTrailingByCategory(
      [categoryRow([9, "1000 Bank"], "asset_cash", 21_500, "2026-07-01")],
      anchor,
      12,
      EUR,
    );

    expect(byCategory.size()).toBe(0);
  });
});
