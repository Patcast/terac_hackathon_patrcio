import { ClientId, AccountRef, InvoiceId, PartyRef } from "../../../../domain/model/Ids.js";
import { Invoice, type Direction, type InvoiceStatus } from "../../../../domain/model/Invoice.js";
import { InvoiceLedger } from "../../../../domain/model/InvoiceLedger.js";
import type { Month } from "../../../../domain/model/Month.js";
import { Money, type Currency } from "../../../../domain/model/Money.js";
import { addDays } from "../../../../domain/model/Period.js";
import { MonthlyBook } from "../../../../domain/model/MonthlyBook.js";
import type { BookParts } from "../../../../domain/model/BookPart.js";
import { BalanceSheet, type AccountTypeTotal } from "../../../../domain/model/book/BalanceSheet.js";
import {
  CashMovements,
  type CashFlowWeek,
  type CashLine,
} from "../../../../domain/model/book/CashMovements.js";
import { CashPosition, type AccountBalance } from "../../../../domain/model/book/CashPosition.js";
import {
  ChartOfAccounts,
  type AccountEntry,
} from "../../../../domain/model/book/ChartOfAccounts.js";
import { CompanyProfile } from "../../../../domain/model/book/CompanyProfile.js";
import {
  PartnerBalances,
  type PartyBalance,
} from "../../../../domain/model/book/PartnerBalances.js";
import { PartnerRevenue, type PartyRevenue } from "../../../../domain/model/book/PartnerRevenue.js";
import { ProfitAndLoss } from "../../../../domain/model/book/ProfitAndLoss.js";
import { TaxSummary, type TaxLine } from "../../../../domain/model/book/TaxSummary.js";
import {
  CategorySeries,
  TrailingByCategory,
} from "../../../../domain/model/book/TrailingByCategory.js";
import {
  TrailingMonths,
  type MonthlyTotal,
} from "../../../../domain/model/book/TrailingMonths.js";
import { TrialBalance, type TrialBalanceLine } from "../../../../domain/model/book/TrialBalance.js";

/**
 * A whole, internally consistent `MonthlyBook` built in TypeScript, for any month
 * you ask for.
 *
 * **This is demo insurance** (docs §4, §12). Odoo's external API varies by
 * version and between Online and self-hosted, and the day that bites is the day
 * of the demo — so there is a second `AccountingRepository` that needs no
 * network and no credentials, and every one of the seven beats in
 * docs/imessage_flow_phase1.md can be run off it.
 *
 * It is a typed builder rather than a captured JSON blob for two reasons. A blob
 * has to be re-captured every time a domain type gains a field, and it only ever
 * covers the month it was captured from — ask about June and the demo dies. This
 * builds the same business for whatever `Month` it is handed.
 *
 * **Deterministic**: no randomness, no `Date.now()`. Every date is derived from
 * the requested month, so the same month always yields byte-identical numbers.
 *
 * The numbers describe one business and they agree with each other: the P&L
 * equals the last row of the trailing series, the tax lines are the VAT on the
 * invoice and bill lists, the partner balances are the open ledgers grouped by
 * party, and cash ÷ the last three months' burn lands on ~7 months of runway.
 * Changing one figure means changing its neighbours.
 */
const CURRENCY: Currency = "EUR";
const COMPANY_NAME = "Blackthorn Studio";

// ---------------------------------------------------------------------------
// The trailing series — thirteen months, oldest first.
//
// Thirteen, not twelve, so `sameMonthLastYear()` resolves: a twelve-month window
// counting the anchor stops one month short of it, and beat 3 asks for the
// year-on-year comparison. The story it tells: profitable a year ago, drifting
// into burn since spring, and one month that looks far worse than it is.
// ---------------------------------------------------------------------------
const TRAILING_REVENUE = [
  82_400, 96_000, 94_500, 95_200, 92_800, 93_600, 90_100, 91_400, 88_700, 86_200, 84_900, 78_400,
  68_200,
];
const TRAILING_EXPENSES = [
  79_800, 81_200, 82_600, 83_100, 84_400, 85_900, 86_300, 87_100, 88_400, 88_900, 88_000, 89_600,
  93_000,
];

/**
 * The same window, per account — report 16, and the fixture's most load-bearing
 * table (docs/imessage_flow_phase1.md beats 2 and 3).
 *
 * Every series is thirteen months, oldest first, and the last column equals this
 * account's row in `TRIAL_BALANCE`. Three shapes are deliberate:
 *
 * - **Payroll** rises in exactly the last three months, so "has climbed three
 *   months running" is a true statement about the fixture and not a phrase the
 *   model reached for.
 * - **Software & Tooling** roughly doubles in the anchor month on an annual
 *   licence renewal, and **Insurance** appears in that month *only*. Both are
 *   one-offs, and a reply that calls either a problem has failed the beat-3 test
 *   the architecture doc calls the characteristic failure of monthly reporting.
 * - **Contractor Costs** is derived, not listed: it absorbs whatever is left of
 *   `TRAILING_EXPENSES` after the others, which is what keeps this table and the
 *   account-type series agreeing to the euro instead of approximately.
 */
const CATEGORY_SERIES: readonly (readonly [string, string, string, readonly number[]])[] = [
  ["6000", "Payroll", "expense",
    [40_800, 41_000, 41_000, 41_500, 41_500, 42_000, 42_000, 42_600, 42_600, 42_600, 44_200, 45_500, 46_800]],
  ["5100", "Hosting & Infrastructure", "expense_direct_cost",
    [6_900, 7_100, 7_200, 7_400, 7_600, 7_800, 8_000, 8_100, 8_300, 8_500, 8_600, 8_800, 8_900]],
  ["6100", "Software & Tooling", "expense",
    [4_200, 4_300, 4_300, 4_400, 4_400, 4_500, 4_400, 4_500, 4_600, 4_600, 4_500, 4_700, 9_300]],
  ["6200", "Rent", "expense",
    [5_400, 5_400, 5_400, 5_400, 5_400, 5_400, 5_600, 5_600, 5_600, 5_600, 5_600, 5_600, 5_600]],
  ["6300", "Marketing", "expense",
    [3_200, 3_600, 4_100, 3_800, 3_400, 4_200, 4_600, 4_100, 3_700, 3_500, 3_300, 4_000, 3_900]],
  ["6400", "Travel", "expense",
    [0, 1_800, 0, 0, 2_400, 0, 900, 0, 0, 1_600, 0, 0, 1_100]],
  ["6500", "Professional Fees", "expense",
    [1_200, 0, 0, 2_600, 0, 0, 900, 0, 0, 3_400, 0, 0, 800]],
  ["6600", "Insurance", "expense", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1_400]],
  ["6700", "Depreciation", "expense_depreciation",
    [2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800, 2_800]],
];

/** The account that takes up the slack, so the two expense tables reconcile exactly. */
const RESIDUAL_CATEGORY = ["5000", "Contractor Costs", "expense_direct_cost"] as const;

/** Income split, same window. Product revenue is the residual against the series. */
const OTHER_INCOME = [
  1_600, 1_900, 1_700, 1_800, 1_700, 2_000, 1_900, 1_800, 1_700, 1_900, 1_800, 1_700, 1_800,
];

/** Anchor-month P&L, and it must add up to the last column of the series above. */
const PNL_BY_TYPE: readonly [string, number][] = [
  ["income", 66_400],
  ["income_other", 1_800],
  ["expense_direct_cost", 21_300],
  ["expense", 68_900],
  ["expense_depreciation", 2_800],
];

const CASH_ACCOUNTS: readonly [string, string, number][] = [
  ["1000", "Operating Account", 74_600],
  ["1010", "Reserve Account", 16_600],
];

/** Cumulative at month end. Assets − liabilities is what is left as equity. */
const BALANCE_SHEET: readonly [string, number][] = [
  ["asset_cash", 91_200],
  ["asset_receivable", 44_708],
  ["asset_current", 12_400],
  ["asset_fixed", 34_500],
  ["liability_payable", 24_942],
  ["liability_current", 18_900],
  ["equity", 100_000],
  ["equity_unaffected", 38_966],
];

/** Anchor-month movement per account, in natural sign — see `OdooMapper`. */
const TRIAL_BALANCE: readonly [string, string, string, number][] = [
  ["1000", "Operating Account", "asset_cash", -18_300],
  ["1100", "Accounts Receivable", "asset_receivable", 14_200],
  ["1200", "VAT Recoverable", "asset_current", 7_479],
  ["2000", "Accounts Payable", "liability_payable", 9_800],
  ["2200", "VAT Payable", "liability_current", 14_052],
  ["4000", "Product Revenue", "income", 66_400],
  ["4100", "Other Income", "income_other", 1_800],
  ["5000", "Contractor Costs", "expense_direct_cost", 12_400],
  ["5100", "Hosting & Infrastructure", "expense_direct_cost", 8_900],
  ["6000", "Payroll", "expense", 46_800],
  ["6100", "Software & Tooling", "expense", 9_300],
  ["6200", "Rent", "expense", 5_600],
  ["6300", "Marketing", "expense", 3_900],
  ["6400", "Travel", "expense", 1_100],
  ["6500", "Professional Fees", "expense", 800],
  ["6600", "Insurance", "expense", 1_400],
  ["6700", "Depreciation", "expense_depreciation", 2_800],
];

const CHART: readonly [string, string, string][] = [
  ["1000", "Operating Account", "asset_cash"],
  ["1010", "Reserve Account", "asset_cash"],
  ["1100", "Accounts Receivable", "asset_receivable"],
  ["1200", "VAT Recoverable", "asset_current"],
  ["1500", "Equipment", "asset_fixed"],
  ["2000", "Accounts Payable", "liability_payable"],
  ["2200", "VAT Payable", "liability_current"],
  ["3000", "Share Capital", "equity"],
  ["3100", "Retained Earnings", "equity_unaffected"],
  ["4000", "Product Revenue", "income"],
  ["4100", "Other Income", "income_other"],
  ["5000", "Contractor Costs", "expense_direct_cost"],
  ["5100", "Hosting & Infrastructure", "expense_direct_cost"],
  ["6000", "Payroll", "expense"],
  ["6100", "Software & Tooling", "expense"],
  ["6200", "Rent", "expense"],
  ["6300", "Marketing", "expense"],
  ["6400", "Travel", "expense"],
  ["6500", "Professional Fees", "expense"],
  ["6600", "Insurance", "expense"],
  ["6700", "Depreciation", "expense_depreciation"],
];

interface DocumentSpec {
  party: string;
  partyId: number;
  net: number;
  /** VAT rate as a fraction. Rent and insurance are exempt here, hence the zeros. */
  rate: number;
  day: number;
  /** True when this document is still open at month end. */
  open?: boolean;
}

/**
 * Twenty customer invoices whose nets sum to the anchor month's revenue, split
 * so one customer is ~40% of it — the concentration the close-out flags.
 */
const CUSTOMER_INVOICES: readonly DocumentSpec[] = [
  { party: "Northwind Systems", partyId: 101, net: 9_800, rate: 0.21, day: 3 },
  { party: "Northwind Systems", partyId: 101, net: 7_600, rate: 0.21, day: 9 },
  { party: "Northwind Systems", partyId: 101, net: 6_200, rate: 0.21, day: 17 },
  { party: "Northwind Systems", partyId: 101, net: 3_700, rate: 0.21, day: 24 },
  { party: "Devlin Foods", partyId: 102, net: 6_400, rate: 0.21, day: 5 },
  { party: "Devlin Foods", partyId: 102, net: 5_100, rate: 0.21, day: 13 },
  { party: "Devlin Foods", partyId: 102, net: 3_400, rate: 0.21, day: 21 },
  { party: "Harbour Analytics", partyId: 103, net: 4_200, rate: 0.21, day: 2 },
  { party: "Harbour Analytics", partyId: 103, net: 3_300, rate: 0.21, day: 11 },
  { party: "Harbour Analytics", partyId: 103, net: 2_300, rate: 0.21, day: 19 },
  { party: "Kestrel Media", partyId: 104, net: 3_100, rate: 0.21, day: 12, open: true },
  { party: "Kestrel Media", partyId: 104, net: 2_600, rate: 0.21, day: 16 },
  { party: "Kestrel Media", partyId: 104, net: 1_700, rate: 0.21, day: 26 },
  { party: "Ravensworth Ltd", partyId: 105, net: 2_900, rate: 0.21, day: 7 },
  { party: "Ravensworth Ltd", partyId: 105, net: 1_700, rate: 0.21, day: 20, open: true },
  { party: "Ashgrove Partners", partyId: 106, net: 1_500, rate: 0.21, day: 6 },
  { party: "Ashgrove Partners", partyId: 106, net: 900, rate: 0.21, day: 23 },
  { party: "Copperfield Design", partyId: 107, net: 800, rate: 0.06, day: 4 },
  { party: "Copperfield Design", partyId: 107, net: 600, rate: 0.06, day: 14 },
  { party: "Copperfield Design", partyId: 107, net: 400, rate: 0.06, day: 27 },
];

/**
 * Twenty vendor bills. Their nets are the month's expenses minus the two that
 * never arrive as a bill — payroll and depreciation.
 *
 * The €4,100 Helix Software renewal is deliberate: it is the annual charge
 * booked whole into one month that makes the month look broken, and the trailing
 * series is the only thing that shows it is not (docs §4, beat 3).
 */
const VENDOR_BILLS: readonly DocumentSpec[] = [
  { party: "Atlas Cloud Services", partyId: 201, net: 2_900, rate: 0.21, day: 2 },
  { party: "Atlas Cloud Services", partyId: 201, net: 2_400, rate: 0.21, day: 8 },
  { party: "Atlas Cloud Services", partyId: 201, net: 2_100, rate: 0.21, day: 16 },
  { party: "Atlas Cloud Services", partyId: 201, net: 1_500, rate: 0.21, day: 23 },
  { party: "Helix Software", partyId: 202, net: 4_100, rate: 0.21, day: 22 },
  { party: "Delve Software", partyId: 203, net: 3_200, rate: 0.21, day: 6 },
  { party: "Orrin Tools", partyId: 204, net: 2_000, rate: 0.21, day: 13 },
  { party: "Meridian Contractors", partyId: 205, net: 5_200, rate: 0.21, day: 4 },
  { party: "Meridian Contractors", partyId: 205, net: 3_600, rate: 0.21, day: 11 },
  { party: "Meridian Contractors", partyId: 205, net: 2_400, rate: 0.21, day: 18 },
  { party: "Meridian Contractors", partyId: 205, net: 1_200, rate: 0.21, day: 25 },
  { party: "Halden Property", partyId: 206, net: 5_600, rate: 0, day: 1, open: true },
  { party: "Brightline Media", partyId: 207, net: 1_500, rate: 0.21, day: 5 },
  { party: "Brightline Media", partyId: 207, net: 1_100, rate: 0.21, day: 12 },
  { party: "Brightline Media", partyId: 207, net: 800, rate: 0.21, day: 19 },
  { party: "Brightline Media", partyId: 207, net: 500, rate: 0.21, day: 26 },
  { party: "Sable Logistics", partyId: 208, net: 700, rate: 0.06, day: 15, open: true },
  { party: "Sable Logistics", partyId: 208, net: 400, rate: 0.06, day: 21 },
  { party: "Verity Consulting", partyId: 209, net: 800, rate: 0.21, day: 9 },
  { party: "Pinewood Insurance", partyId: 210, net: 1_400, rate: 0, day: 10, open: true },
];

/**
 * The receivables that predate the month and are still open — the whole reason
 * reports 3 and 4 have no lower date bound. Northwind's is 75 days past due at
 * month end, which is the 60+ bucket the close-out is meant to surface.
 *
 * Devlin's is deliberately part-paid: `total` and `outstanding` differ, so a
 * book that conflated `amount_total` with `amount_residual` fails visibly here
 * instead of quietly on stage.
 */
interface CarriedSpec {
  party: string;
  partyId: number;
  number: string;
  total: number;
  outstanding: number;
  dueDaysBeforeEnd: number;
  issuedDaysBeforeEnd: number;
  status: InvoiceStatus;
}

const CARRIED_RECEIVABLES: readonly CarriedSpec[] = [
  {
    party: "Northwind Systems",
    partyId: 101,
    number: "INV/2026/0142",
    total: 18_400,
    outstanding: 18_400,
    dueDaysBeforeEnd: 75,
    issuedDaysBeforeEnd: 105,
    status: "not_paid",
  },
  {
    party: "Devlin Foods",
    partyId: 102,
    number: "INV/2026/0201",
    total: 15_900,
    outstanding: 11_900,
    dueDaysBeforeEnd: 41,
    issuedDaysBeforeEnd: 71,
    status: "partial",
  },
  {
    party: "Harbour Analytics",
    partyId: 103,
    number: "INV/2026/0233",
    total: 8_600,
    outstanding: 8_600,
    dueDaysBeforeEnd: 18,
    issuedDaysBeforeEnd: 48,
    status: "not_paid",
  },
];

const CARRIED_PAYABLES: readonly CarriedSpec[] = [
  {
    party: "Atlas Cloud Services",
    partyId: 201,
    number: "BILL/2026/05/0044",
    total: 9_400,
    outstanding: 9_400,
    dueDaysBeforeEnd: 44,
    issuedDaysBeforeEnd: 74,
    status: "not_paid",
  },
  {
    party: "Meridian Contractors",
    partyId: 205,
    number: "BILL/2026/06/0071",
    total: 7_800,
    outstanding: 7_800,
    dueDaysBeforeEnd: 6,
    issuedDaysBeforeEnd: 36,
    status: "not_paid",
  },
];

/** Five weeks of bank movement. Net of these is the operating account's month. */
const CASH_WEEKS: readonly [number, number, number][] = [
  [1, 21_400, 26_800],
  [8, 12_900, 18_200],
  [15, 18_600, 14_900],
  [22, 9_700, 16_400],
  [29, 4_200, 8_800],
];

const CASH_LINES: readonly [number, string, number][] = [
  [27, "Payroll — first run", -23_400],
  [3, "Northwind Systems — part payment INV/2026/0142", 18_900],
  [24, "Payroll — second run", -11_200],
  [16, "Harbour Analytics — INV/2026/0233 settled in part", 11_200],
  [10, "Devlin Foods — payment received", 9_400],
  [17, "Halden Property — monthly rent", -5_600],
  [22, "Helix Software — annual licence renewal", -4_100],
  [11, "Meridian Contractors — BILL/2026/07/0009", -5_200],
  [10, "Pinewood Insurance — annual premium", -1_400],
  [30, "Bank charges", -380],
];

/** VAT accrued in the month — the sum of the rates applied to the two ledgers. */
const TAX_LINES: readonly [string, TaxLine["kind"], number][] = [
  ["21% Sales", "sales", 13_944],
  ["6% Sales", "sales", 108],
  ["21% Purchases", "purchase", 7_413],
  ["6% Purchases", "purchase", 66],
];

/** The demo client, for callers that want a `ClientId` that matches the book. */
export const DEMO_CLIENT_ID = ClientId.of("demo");

export function demoBookParts(month: Month): BookParts {
  const asOf = month.endsOn();

  const invoicesIssued = documentLedger(CUSTOMER_INVOICES, month, "outbound", "INV");
  const billsReceived = documentLedger(VENDOR_BILLS, month, "inbound", "BILL");

  const openReceivables = openLedger(CARRIED_RECEIVABLES, invoicesIssued, month, "outbound");
  const openPayables = openLedger(CARRIED_PAYABLES, billsReceived, month, "inbound");

  return {
    invoicesIssued,
    billsReceived,
    openReceivables,
    openPayables,
    pnl: new ProfitAndLoss(typeTotals(PNL_BY_TYPE), CURRENCY),
    trailing: trailingMonths(month),
    trailingByCategory: trailingByCategory(month),
    trialBalance: new TrialBalance(trialBalanceLines(), CURRENCY),
    balanceSheet: new BalanceSheet(typeTotals(BALANCE_SHEET), asOf, CURRENCY),
    cash: new CashPosition(cashAccounts(), asOf, CURRENCY),
    cashMovements: cashMovements(month),
    tax: new TaxSummary(taxLines(), CURRENCY),
    partners: partnerBalances(openReceivables, openPayables),
    partnerRevenue: partnerRevenue(),
    accounts: new ChartOfAccounts(chartEntries()),
    company: new CompanyProfile(COMPANY_NAME, CURRENCY, 12, 31),
  };
}

/**
 * `assembledAt` is derived from the month rather than read off a clock, so the
 * fixture is reproducible — and it is placed just past the settling window so
 * the book presents as settled rather than as "still moving", which is the state
 * the demo script assumes throughout.
 */
export function demoBook(
  month: Month,
  clientId: ClientId = DEMO_CLIENT_ID,
  settlingDays = 10,
): MonthlyBook {
  return MonthlyBook.assemble(
    clientId,
    month,
    demoBookParts(month),
    [],
    addDays(month.endsOn(), settlingDays + 1),
    settlingDays,
  );
}

// ---------------------------------------------------------------------------

function documentLedger(
  specs: readonly DocumentSpec[],
  month: Month,
  direction: Direction,
  prefix: string,
): InvoiceLedger {
  const documents = specs.map((spec, index) => {
    const issuedOn = dayIn(month, spec.day);
    const gross = spec.net * (1 + spec.rate);
    return new Invoice(
      InvoiceId.of(`${prefix}-${month.key()}-${index + 1}`),
      `${prefix}/${month.key().replace("-", "")}/${String(index + 1).padStart(3, "0")}`,
      PartyRef.of(spec.partyId, spec.party),
      direction,
      issuedOn,
      addDays(issuedOn, 30),
      Money.of(gross, CURRENCY),
      Money.of(spec.open ? gross : 0, CURRENCY),
      spec.open ? "not_paid" : "paid",
    );
  });
  return new InvoiceLedger(documents, CURRENCY);
}

/**
 * What was still open at month end: the documents carried in from earlier months
 * plus the ones raised this month that nobody has paid yet. The first group is
 * why there is no lower date bound on reports 3 and 4.
 */
function openLedger(
  carried: readonly CarriedSpec[],
  thisMonth: InvoiceLedger,
  month: Month,
  direction: Direction,
): InvoiceLedger {
  const monthEnd = new Date(Date.UTC(month.year, month.index, 0));

  const older = carried.map(
    (spec) =>
      new Invoice(
        InvoiceId.of(spec.number),
        spec.number,
        PartyRef.of(spec.partyId, spec.party),
        direction,
        addDays(monthEnd, -spec.issuedDaysBeforeEnd),
        addDays(monthEnd, -spec.dueDaysBeforeEnd),
        Money.of(spec.total, CURRENCY),
        Money.of(spec.outstanding, CURRENCY),
        spec.status,
      ),
  );

  const raisedThisMonth = thisMonth.documents.filter((invoice) => !invoice.outstanding.isZero());
  return new InvoiceLedger([...older, ...raisedThisMonth], CURRENCY);
}

function trailingMonths(anchor: Month): TrailingMonths {
  const months: MonthlyTotal[] = anchor.trailingMonths(TRAILING_REVENUE.length).map((month, i) => {
    const revenue = Money.of(TRAILING_REVENUE[i] ?? 0, CURRENCY);
    const expenses = Money.of(TRAILING_EXPENSES[i] ?? 0, CURRENCY);
    return { month, revenue, expenses, net: revenue.minus(expenses) };
  });
  return new TrailingMonths(anchor, months, CURRENCY);
}

/**
 * Report 16's fixture, built so its columns reconcile with `trailingMonths()`.
 *
 * Contractor Costs and Product Revenue are computed as the residual of their
 * side rather than listed, which is what makes "expenses were €88,400 in March"
 * and the sum of March's cost lines the same number — a model reading both
 * tables will notice if they are not.
 */
function trailingByCategory(anchor: Month): TrailingByCategory {
  const window = anchor.trailingMonths(TRAILING_EXPENSES.length);

  const listed = CATEGORY_SERIES.map(([code, name, accountType, amounts], index) =>
    categorySeries(anchor, window, 600 + index, code, name, accountType, amounts),
  );

  const residualExpenses = window.map((_, i) => {
    const listedTotal = CATEGORY_SERIES.reduce((sum, [, , , amounts]) => sum + (amounts[i] ?? 0), 0);
    return (TRAILING_EXPENSES[i] ?? 0) - listedTotal;
  });
  const productRevenue = window.map((_, i) => (TRAILING_REVENUE[i] ?? 0) - (OTHER_INCOME[i] ?? 0));

  const [residualCode, residualName, residualType] = RESIDUAL_CATEGORY;

  return new TrailingByCategory(
    anchor,
    [
      ...listed,
      categorySeries(anchor, window, 690, residualCode, residualName, residualType, residualExpenses),
      categorySeries(anchor, window, 691, "4000", "Product Revenue", "income", productRevenue),
      categorySeries(anchor, window, 692, "4100", "Other Income", "income_other", OTHER_INCOME),
    ],
    CURRENCY,
  );
}

function categorySeries(
  anchor: Month,
  window: readonly Month[],
  id: number,
  code: string,
  name: string,
  accountType: string,
  amounts: readonly number[],
): CategorySeries {
  return new CategorySeries(
    AccountRef.of(id, code, name),
    accountType,
    anchor,
    window.map((month, i) => ({ month, amount: Money.of(amounts[i] ?? 0, CURRENCY) })),
    CURRENCY,
  );
}

function typeTotals(rows: readonly (readonly [string, number])[]): AccountTypeTotal[] {
  return rows.map(([accountType, amount]) => ({ accountType, amount: Money.of(amount, CURRENCY) }));
}

function trialBalanceLines(): TrialBalanceLine[] {
  return TRIAL_BALANCE.map(([code, name, accountType, movement], index) => ({
    account: AccountRef.of(500 + index, code, name),
    accountType,
    movement: Money.of(movement, CURRENCY),
  }));
}

function cashAccounts(): AccountBalance[] {
  return CASH_ACCOUNTS.map(([code, name, balance], index) => ({
    account: AccountRef.of(500 + index, code, name),
    balance: Money.of(balance, CURRENCY),
  }));
}

function chartEntries(): AccountEntry[] {
  return CHART.map(([code, name, accountType], index) => ({
    account: AccountRef.of(500 + index, code, name),
    accountType,
  }));
}

function cashMovements(month: Month): CashMovements {
  const weeks: CashFlowWeek[] = CASH_WEEKS.map(([day, inflow, outflow]) => ({
    weekStarting: dayIn(month, day),
    journal: "Bank",
    inflow: Money.of(inflow, CURRENCY),
    outflow: Money.of(outflow, CURRENCY),
  }));

  const largestLines: CashLine[] = CASH_LINES.map(([day, label, amount]) => ({
    date: dayIn(month, day),
    label,
    journal: "Bank",
    amount: Money.of(amount, CURRENCY),
  }));

  return new CashMovements(weeks, largestLines, CURRENCY);
}

function taxLines(): TaxLine[] {
  return TAX_LINES.map(([name, kind, amount]) => ({ name, kind, amount: Money.of(amount, CURRENCY) }));
}

/** Grouped from the open ledgers so the two parts can never disagree. */
function partnerBalances(
  receivables: InvoiceLedger,
  payables: InvoiceLedger,
): PartnerBalances {
  return new PartnerBalances(byParty(receivables), byParty(payables), CURRENCY);
}

function byParty(ledger: InvoiceLedger): PartyBalance[] {
  const totals = new Map<string, { party: PartyRef; minor: number }>();
  for (const invoice of ledger.documents) {
    const running = totals.get(invoice.party.id) ?? { party: invoice.party, minor: 0 };
    running.minor += invoice.outstanding.amountMinor;
    totals.set(invoice.party.id, running);
  }
  return [...totals.values()]
    .map(({ party, minor }): PartyBalance => ({ party, balance: Money.minor(minor, CURRENCY) }))
    .sort((a, b) => b.balance.compareTo(a.balance));
}

/** The month's revenue by customer — the same nets that build the invoice list. */
function partnerRevenue(): PartnerRevenue {
  const totals = new Map<number, { party: PartyRef; net: number }>();
  for (const spec of CUSTOMER_INVOICES) {
    const running = totals.get(spec.partyId) ?? {
      party: PartyRef.of(spec.partyId, spec.party),
      net: 0,
    };
    running.net += spec.net;
    totals.set(spec.partyId, running);
  }
  const parties = [...totals.values()]
    .map(({ party, net }): PartyRevenue => ({ party, revenue: Money.of(net, CURRENCY) }))
    .sort((a, b) => b.revenue.compareTo(a.revenue));
  return new PartnerRevenue(parties, CURRENCY);
}

/** Clamped, so a spec written for day 31 still lands inside February. */
function dayIn(month: Month, day: number): Date {
  const lastDay = new Date(Date.UTC(month.year, month.index, 0)).getUTCDate();
  return new Date(Date.UTC(month.year, month.index - 1, Math.min(day, lastDay)));
}
