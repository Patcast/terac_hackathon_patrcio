import {
  isEquity,
  isExpense,
  isIncome,
  isLiability,
  type AccountType,
} from "../../../domain/model/AccountTypes.js";
import { AccountRef, InvoiceId, PartyRef } from "../../../domain/model/Ids.js";
import { Invoice, type Direction, type InvoiceStatus } from "../../../domain/model/Invoice.js";
import { InvoiceLedger } from "../../../domain/model/InvoiceLedger.js";
import { Month } from "../../../domain/model/Month.js";
import { Money, type Currency } from "../../../domain/model/Money.js";
import {
  BalanceSheet,
  type AccountTypeTotal,
} from "../../../domain/model/book/BalanceSheet.js";
import {
  CashMovements,
  type CashFlowWeek,
  type CashLine,
} from "../../../domain/model/book/CashMovements.js";
import {
  CashPosition,
  type AccountBalance,
} from "../../../domain/model/book/CashPosition.js";
import {
  ChartOfAccounts,
  type AccountEntry,
} from "../../../domain/model/book/ChartOfAccounts.js";
import { CompanyProfile } from "../../../domain/model/book/CompanyProfile.js";
import { PartnerBalances, type PartyBalance } from "../../../domain/model/book/PartnerBalances.js";
import { PartnerRevenue, type PartyRevenue } from "../../../domain/model/book/PartnerRevenue.js";
import { ProfitAndLoss } from "../../../domain/model/book/ProfitAndLoss.js";
import { TaxSummary, type TaxLine } from "../../../domain/model/book/TaxSummary.js";
import {
  CategorySeries,
  TrailingByCategory,
} from "../../../domain/model/book/TrailingByCategory.js";
import {
  TrailingMonths,
  type MonthlyTotal,
} from "../../../domain/model/book/TrailingMonths.js";
import {
  TrialBalance,
  type TrialBalanceLine,
} from "../../../domain/model/book/TrialBalance.js";
import type { OdooRow, ReadGroupRow } from "./OdooJsonApiClient.js";
import type { OdooCompany } from "./OdooCompanyContext.js";

/**
 * Caps from docs §11. They almost never bind for a single month, but when they
 * do the reports keep the **largest by absolute amount** rather than the most
 * recent — a CFO question is about the big ones — and the aggregates, which come
 * from the `read_group` reports rather than these lists, stay exact either way.
 */
export const MAX_DOCUMENTS = 500;
export const MAX_CASH_LINES = 200;
/**
 * Accounts kept in report 16. Twelve or so carry a small business's money; the
 * rest of the chart is noise, and each one costs thirteen months of rows.
 */
export const MAX_CATEGORIES = 14;

/**
 * Everything the four document reports read off `account.move`.
 *
 * The `_signed` pair is requested alongside the plain pair on purpose — see
 * `toInvoice` for which one wins and why.
 */
export const DOCUMENT_FIELDS = [
  "name",
  "move_type",
  "partner_id",
  "invoice_date",
  "invoice_date_due",
  "date",
  "amount_total",
  "amount_total_signed",
  "amount_residual",
  "amount_residual_signed",
  "payment_state",
  "currency_id",
];

/**
 * The boundary guard (docs §10).
 *
 * `snake_case` keys, `[id, name]` tuples, `false`-for-unset and Odoo's
 * credit-negative sign convention all stop in this file. Everything past it
 * speaks domain. Every method is synchronous and total: a malformed row degrades
 * to a sensible default rather than taking the whole report down, because one
 * unreadable partner should not turn into a `BookGap` that costs the answer its
 * open receivables.
 */
export class OdooMapper {
  // ---- A. Documents ------------------------------------------------------

  toInvoiceLedger(rows: readonly OdooRow[], currency: Currency): InvoiceLedger {
    const documents: Invoice[] = [];
    for (const row of rows) {
      const invoice = this.toInvoice(row, currency);
      if (invoice) documents.push(invoice);
    }
    return new InvoiceLedger(documents, currency);
  }

  /**
   * **`amount_total` is what was billed; `amount_residual` is what is still
   * owed.** Conflating them is §4's single most likely wrong-number bug, so they
   * are read by two separate calls that never share a variable.
   *
   * Which pair, though: Odoo exposes each figure twice. The plain field is an
   * unsigned magnitude in the *document's* currency; the `_signed` field is the
   * same figure in *company* currency with credit notes already negative. Taking
   * `_signed` settles two more §4 hazards in one move — multi-currency books
   * can't smuggle a foreign amount into a company-currency sum, and an
   * `out_refund` reduces AR instead of inflating it. The plain pair stays as the
   * fallback for an Odoo that doesn't publish `_signed`, where the refund flip
   * has to be applied by hand.
   *
   * `amount_total_signed` is positive for what we billed and negative for what
   * we were billed, so the inbound ledger is negated to make a vendor bill read
   * as a positive debt and a vendor credit note as a negative one.
   */
  toInvoice(row: OdooRow, currency: Currency): Invoice | null {
    const id = asNumber(row["id"]);
    if (id === 0) return null;

    const moveType = asText(row["move_type"]) ?? "";
    const direction: Direction = moveType.startsWith("in_") ? "inbound" : "outbound";

    // The accounting date is the fallback: a posted move always has one, an
    // imported draft-turned-posted occasionally lacks `invoice_date`.
    const issuedOn = asDate(row["invoice_date"]) ?? asDate(row["date"]);
    if (!issuedOn) return null;

    const total = documentAmount(row, "amount_total_signed", "amount_total", moveType, direction);
    const outstanding = documentAmount(
      row,
      "amount_residual_signed",
      "amount_residual",
      moveType,
      direction,
    );

    return new Invoice(
      InvoiceId.of(id),
      asText(row["name"]) ?? `#${id}`,
      this.toParty(row["partner_id"]),
      direction,
      issuedOn,
      asDate(row["invoice_date_due"]) ?? issuedOn,
      Money.of(total, currency),
      Money.of(outstanding, currency),
      toStatus(row["payment_state"]),
    );
  }

  /** Odoo answers `false` for a partner-less bill; that is data, not a failure. */
  toParty(value: unknown): PartyRef {
    const ref = asRef(value);
    return ref ? PartyRef.of(ref.id, ref.label) : PartyRef.unknown();
  }

  // ---- B. Aggregates -----------------------------------------------------

  /**
   * **The sign flip, and this is the only place in the codebase that has one.**
   *
   * Odoo stores credits negative, so an income account carries a negative
   * balance: `revenue = -balance`, `expenses = +balance`. Get it backwards and
   * the demo shows a business losing money on every sale (docs §4). Both leave
   * here positive, and `net = revenue - expenses` is the domain's arithmetic.
   */
  toProfitAndLoss(rows: readonly ReadGroupRow[], currency: Currency): ProfitAndLoss {
    return new ProfitAndLoss(this.toTypeTotals(rows, currency), currency);
  }

  /**
   * Report 6 — one `read_group` on `account_type` × `date:month`, unpacked into
   * one row per month of the window.
   *
   * Months with no postings are filled with zeros rather than dropped: the
   * series is what `averageNet` and `revenueDeltaVsPriorMonth` index into, and a
   * silently short series turns a quiet month into an off-by-one comparison.
   */
  toTrailingMonths(
    rows: readonly ReadGroupRow[],
    anchor: Month,
    count: number,
    currency: Currency,
  ): TrailingMonths {
    const totals = new Map<string, { revenue: number; expenses: number }>();

    for (const row of rows) {
      const month = this.toMonth(row, "date:month");
      const accountType = asText(row["account_type"]);
      if (!month || !accountType) continue;

      const balance = asNumber(row["balance"]);
      const bucket = totals.get(month.key()) ?? { revenue: 0, expenses: 0 };
      if (isIncome(accountType)) bucket.revenue += -balance;
      else if (isExpense(accountType)) bucket.expenses += balance;
      totals.set(month.key(), bucket);
    }

    const months: MonthlyTotal[] = anchor.trailingMonths(count).map((month) => {
      const bucket = totals.get(month.key()) ?? { revenue: 0, expenses: 0 };
      const revenue = Money.of(bucket.revenue, currency);
      const expenses = Money.of(bucket.expenses, currency);
      return { month, revenue, expenses, net: revenue.minus(expenses) };
    });

    return new TrailingMonths(anchor, months, currency);
  }

  /**
   * Report 16 — `account_id` × `date:month` across the trailing window.
   *
   * Two things it must do that the account-type version does not. The series is
   * **zero-filled per account** (a month with no rows means nothing was spent on
   * that account, not that the series is shorter there), and it is **capped to
   * the accounts carrying the money**: the tail of a chart of accounts is a
   * hundred lines that never move, and rendering them costs tokens to say
   * nothing. Months are resolved by `__range`, never by the localised label.
   */
  toTrailingByCategory(
    rows: readonly ReadGroupRow[],
    anchor: Month,
    count: number,
    currency: Currency,
    limit = MAX_CATEGORIES,
  ): TrailingByCategory {
    const accounts = new Map<
      string,
      { account: AccountRef; accountType: AccountType; byMonth: Map<string, number> }
    >();

    for (const row of rows) {
      const account = this.toAccount(row["account_id"]);
      const accountType = asText(row["account_type"]);
      const month = this.toMonth(row, "date:month");
      if (!account || !accountType || !month) continue;
      if (!isIncome(accountType) && !isExpense(accountType)) continue;

      const entry = accounts.get(account.id) ?? { account, accountType, byMonth: new Map() };
      const amount = naturalSign(accountType) * asNumber(row["balance"]);
      entry.byMonth.set(month.key(), (entry.byMonth.get(month.key()) ?? 0) + amount);
      accounts.set(account.id, entry);
    }

    const window = anchor.trailingMonths(count);
    const series = [...accounts.values()].map(
      ({ account, accountType, byMonth }) =>
        new CategorySeries(
          account,
          accountType,
          anchor,
          window.map((month) => ({
            month,
            amount: Money.of(byMonth.get(month.key()) ?? 0, currency),
          })),
          currency,
        ),
    );

    const kept = series
      .sort((a, b) => b.total().abs().compareTo(a.total().abs()))
      .slice(0, limit);

    return new TrailingByCategory(anchor, kept, currency);
  }

  toTrialBalance(rows: readonly ReadGroupRow[], currency: Currency): TrialBalance {
    const lines: TrialBalanceLine[] = [];
    for (const row of rows) {
      const account = this.toAccount(row["account_id"]);
      const accountType = asText(row["account_type"]);
      if (!account || !accountType) continue;
      lines.push({
        account,
        accountType,
        movement: Money.of(naturalSign(accountType) * asNumber(row["balance"]), currency),
      });
    }
    return new TrialBalance(lines, currency);
  }

  toBalanceSheet(rows: readonly ReadGroupRow[], asOf: Date, currency: Currency): BalanceSheet {
    return new BalanceSheet(this.toTypeTotals(rows, currency), asOf, currency);
  }

  /** Cash accounts are debit-natured, so Odoo's balance is already the bank balance. */
  toCashPosition(rows: readonly ReadGroupRow[], asOf: Date, currency: Currency): CashPosition {
    const accounts: AccountBalance[] = [];
    for (const row of rows) {
      const account = this.toAccount(row["account_id"]);
      if (!account) continue;
      accounts.push({ account, balance: Money.of(asNumber(row["balance"]), currency) });
    }
    return new CashPosition(accounts, asOf, currency);
  }

  /**
   * `debit` and `credit` rather than `balance`: a week that took in €20k and
   * paid out €20k nets to zero, and "nothing moved" is a different answer from
   * "€40k moved". Both come back positive from Odoo, so there is no flip here.
   */
  toCashMovements(
    weekRows: readonly ReadGroupRow[],
    lineRows: readonly OdooRow[],
    currency: Currency,
  ): CashMovements {
    const weeks: CashFlowWeek[] = [];
    for (const row of weekRows) {
      const weekStarting = this.toRangeStart(row, "date:week");
      if (!weekStarting) continue;
      weeks.push({
        weekStarting,
        journal: asRef(row["journal_id"])?.label ?? "Unknown journal",
        inflow: Money.of(asNumber(row["debit"]), currency),
        outflow: Money.of(asNumber(row["credit"]), currency),
      });
    }
    weeks.sort((a, b) => a.weekStarting.getTime() - b.weekStarting.getTime());

    const largestLines: CashLine[] = [];
    for (const row of lineRows) {
      const date = asDate(row["date"]);
      if (!date) continue;
      largestLines.push({
        date,
        label: asText(row["name"]) ?? asText(row["move_name"]) ?? "(no label)",
        journal: asRef(row["journal_id"])?.label ?? "Unknown journal",
        amount: Money.of(asNumber(row["balance"]), currency),
      });
    }
    largestLines.sort((a, b) => b.amount.abs().compareTo(a.amount.abs()));

    return new CashMovements(weeks, largestLines.slice(0, MAX_CASH_LINES), currency);
  }

  /**
   * Report 11 — rows grouped on `tax_line_id` × `move_type`, where every row is
   * a line that **is** the tax. (`tax_ids` marks a line that merely *has* tax on
   * it; summing that one double-counts the whole return — docs §4.)
   *
   * `move_type` carries the sales/purchase split without a second query and
   * without guessing from the sign, which a credit note would have flipped.
   * Output VAT sits on the credit side, so the sales rows take the flip and both
   * kinds leave here positive; `TaxSummary.netPayable` does the subtraction.
   */
  toTaxSummary(rows: readonly ReadGroupRow[], currency: Currency): TaxSummary {
    const merged = new Map<string, { name: string; kind: TaxLine["kind"]; amount: number }>();

    for (const row of rows) {
      const tax = asRef(row["tax_line_id"]);
      if (!tax) continue;
      const kind: TaxLine["kind"] = (asText(row["move_type"]) ?? "").startsWith("out_")
        ? "sales"
        : "purchase";
      const amount = (kind === "sales" ? -1 : 1) * asNumber(row["balance"]);

      const key = `${tax.id}:${kind}`;
      const existing = merged.get(key);
      if (existing) existing.amount += amount;
      else merged.set(key, { name: tax.label, kind, amount });
    }

    const lines: TaxLine[] = [...merged.values()].map((line) => ({
      name: line.name,
      kind: line.kind,
      amount: Money.of(line.amount, currency),
    }));
    lines.sort((a, b) => b.amount.abs().compareTo(a.amount.abs()));
    return new TaxSummary(lines, currency);
  }

  /**
   * Report 12 — one `read_group` over receivable *and* payable accounts, split
   * here by `account_type`. Receivables are debit-natured and come out as Odoo
   * stores them; payables are credit-natured and take the flip, so "owes us" and
   * "we owe" are both positive and comparable.
   */
  toPartnerBalances(rows: readonly ReadGroupRow[], currency: Currency): PartnerBalances {
    const receivable: PartyBalance[] = [];
    const payable: PartyBalance[] = [];

    for (const row of rows) {
      const accountType = asText(row["account_type"]);
      if (!accountType) continue;
      const balance = asNumber(row["balance"]);
      if (balance === 0) continue; // a settled partner is noise in a top-N list

      const entry = { party: this.toParty(row["partner_id"]), balance: Money.of(balance, currency) };
      if (isLiability(accountType)) payable.push({ ...entry, balance: entry.balance.negated() });
      else receivable.push(entry);
    }

    const byBalance = (a: PartyBalance, b: PartyBalance) => b.balance.compareTo(a.balance);
    receivable.sort(byBalance);
    payable.sort(byBalance);
    return new PartnerBalances(receivable, payable, currency);
  }

  /** Report 13 — income lines by partner, so the same credit-negative flip. */
  toPartnerRevenue(rows: readonly ReadGroupRow[], currency: Currency): PartnerRevenue {
    const parties: PartyRevenue[] = [];
    for (const row of rows) {
      const revenue = -asNumber(row["balance"]);
      if (revenue === 0) continue;
      parties.push({ party: this.toParty(row["partner_id"]), revenue: Money.of(revenue, currency) });
    }
    parties.sort((a, b) => b.revenue.compareTo(a.revenue));
    return new PartnerRevenue(parties, currency);
  }

  // ---- C. Reference ------------------------------------------------------

  toChartOfAccounts(rows: readonly OdooRow[]): ChartOfAccounts {
    const entries: AccountEntry[] = [];
    for (const row of rows) {
      const id = asNumber(row["id"]);
      const accountType = asText(row["account_type"]);
      if (id === 0 || !accountType) continue;
      entries.push({
        account: AccountRef.of(id, asText(row["code"]) ?? "", asText(row["name"]) ?? ""),
        accountType,
      });
    }
    return new ChartOfAccounts(entries);
  }

  toCompanyProfile(company: OdooCompany): CompanyProfile {
    return new CompanyProfile(
      company.name,
      company.currency,
      company.fiscalYearLastMonth,
      company.fiscalYearLastDay,
    );
  }

  // ---- Shared row readers ------------------------------------------------

  /**
   * **Never parse the `date:month` label.** `read_group` returns Odoo's own
   * localised string — `"July 2026"` under `en_US`, `"juillet 2026"` the moment
   * the service user's language differs — alongside a machine-readable
   * `__range`. The range is the fact; the label is a rendering (docs §4).
   */
  toMonth(row: ReadGroupRow, key: string): Month | null {
    const start = this.toRangeStart(row, key);
    return start ? Month.containing(start) : null;
  }

  /** The inclusive start of a date grouping. Odoo's `__range.to` is exclusive. */
  toRangeStart(row: ReadGroupRow, key: string): Date | null {
    const ranges = row["__range"];
    if (isRecord(ranges)) {
      const range = ranges[key];
      if (isRecord(range)) {
        const from = asDate(range["from"]);
        if (from) return from;
      }
    }
    // Older Odoo builds omit `__range`; `__domain` still carries the same bound
    // as a `date >= YYYY-MM-DD` clause, which is a range, not a label.
    return dateBoundFromDomain(row["__domain"]);
  }

  /** `read_group` hands back `[161, "400000 Customers"]` and nothing to split on. */
  toAccount(value: unknown): AccountRef | null {
    const ref = asRef(value);
    return ref ? AccountRef.fromLabel(ref.id, ref.label) : null;
  }

  private toTypeTotals(rows: readonly ReadGroupRow[], currency: Currency): AccountTypeTotal[] {
    const totals: AccountTypeTotal[] = [];
    for (const row of rows) {
      const accountType = asText(row["account_type"]);
      if (!accountType) continue;
      totals.push({
        accountType,
        amount: Money.of(naturalSign(accountType) * asNumber(row["balance"]), currency),
      });
    }
    return totals;
  }
}

/**
 * +1 for debit-natured accounts, -1 for credit-natured ones.
 *
 * The consequence, stated plainly because it is a real trade-off: every figure
 * that leaves this mapper is positive when there is more of the thing it is
 * named after — revenue, expenses, liabilities, equity — which is what an LLM
 * reading a rendered book needs, and it means `TrialBalance.total()` is no
 * longer the classic sums-to-zero check. Nothing in Phase 1 uses it as one.
 */
function naturalSign(accountType: AccountType): number {
  return isIncome(accountType) || isLiability(accountType) || isEquity(accountType) ? -1 : 1;
}

function documentAmount(
  row: OdooRow,
  signedField: string,
  plainField: string,
  moveType: string,
  direction: Direction,
): number {
  const signed = row[signedField];
  if (typeof signed === "number" && Number.isFinite(signed)) {
    return (direction === "inbound" ? -1 : 1) * signed;
  }
  // Fallback path: the plain field is an unsigned magnitude, so a credit note
  // has to be flipped by hand or it inflates the very total it should reduce.
  return (moveType.endsWith("_refund") ? -1 : 1) * asNumber(row[plainField]);
}

const STATUSES: readonly string[] = ["not_paid", "partial", "paid", "reversed", "in_payment"];

/**
 * Odoo carries values Phase 1's domain doesn't model (`invoicing_legacy`,
 * `blocked`) and `false` for a non-invoice move. All of them fall to `not_paid`,
 * which is the conservative read: an unknown state counts as still owed rather
 * than quietly disappearing from AR.
 */
function toStatus(value: unknown): InvoiceStatus {
  const text = asText(value);
  return text !== null && STATUSES.includes(text) ? (text as InvoiceStatus) : "not_paid";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Odoo uses `false`, not `null` or `""`, for every unset scalar. */
function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asRef(value: unknown): { id: number; label: string } | null {
  if (!Array.isArray(value)) return null;
  const [id, label] = value;
  if (typeof id !== "number") return null;
  return { id, label: typeof label === "string" && label.trim() ? label : `#${id}` };
}

/** Odoo dates are zone-less `YYYY-MM-DD`; reading them as anything but UTC loses a day. */
function asDate(value: unknown): Date | null {
  const text = asText(value);
  if (!text) return null;
  const at = Date.parse(`${text.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(at) ? null : new Date(at);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dateBoundFromDomain(value: unknown): Date | null {
  if (!Array.isArray(value)) return null;
  for (const clause of value) {
    if (Array.isArray(clause) && clause[0] === "date" && clause[1] === ">=") {
      const from = asDate(clause[2]);
      if (from) return from;
    }
  }
  return null;
}
