import { isoDate } from "../../../domain/model/Period.js";
import type { BookGap } from "../../../domain/model/BookGap.js";
import type { Invoice } from "../../../domain/model/Invoice.js";
import type { InvoiceLedger } from "../../../domain/model/InvoiceLedger.js";
import type { MonthlyBook } from "../../../domain/model/MonthlyBook.js";
import type { Money } from "../../../domain/model/Money.js";
import type { Runway } from "../../../domain/model/Runway.js";

/**
 * Over the cap we keep the **largest by absolute amount**, not the most recent:
 * a CFO question is about the big ones (docs/architecture_phase1.md §11).
 */
const MAX_DOCUMENTS = 500;
const MAX_CASH_LINES = 200;

/** How many rows of the account-level tables are worth their tokens. */
const MAX_TRIAL_BALANCE_LINES = 80;
/** One row per account, so this many × the trailing window in table rows. */
const MAX_CATEGORY_LINES = 12;
const MAX_PARTY_ROWS = 25;

export interface RenderedBook {
  /**
   * Company profile and chart of accounts — identical on every request for this
   * client, so the `cache_control` breakpoint goes immediately after it.
   */
  stablePrefix: string;
  /** Everything that changes with the month, ending with what could not be read. */
  volatile: string;
}

/**
 * Turns a `MonthlyBook` into the prompt block, in the order of
 * docs/architecture_phase1.md §11 — and **the order is the design**:
 *
 * 1. company profile + chart of accounts — stable, hence the cache breakpoint
 * 2. headline: P&L, cash, runway, tax — the answer to most questions in ~30 lines
 * 3. **the trailing twelve months, one row per month** — deliberately high, so the
 *    model sees the trend *before* July's own numbers. This is the structural
 *    defence against a one-off annual bill reading as a crisis (§4).
 * 4. aggregates 5. document tables 6. gaps, the last thing read before the question
 *
 * Two rules run through every section. Point-in-time figures always carry their
 * as-of date, because a balance without one is a misleading answer rather than
 * an incomplete one. And a missing part renders as an explicit "not available"
 * rather than being dropped — the model can only say what it could not read if
 * it can see the hole.
 */
export class BookRenderer {
  render(book: MonthlyBook, runway: Runway | null): RenderedBook {
    return {
      stablePrefix: this.renderStable(book),
      volatile: this.renderVolatile(book, runway),
    };
  }

  // ── 1. Stable: reference material ───────────────────────────────────────────

  private renderStable(book: MonthlyBook): string {
    const out: string[] = ["# Client reference", ""];

    const company = book.company;
    out.push("## Company");
    if (company) {
      out.push(
        "field | value",
        `name | ${company.name}`,
        `reporting currency | ${company.currency}`,
        `fiscal year ends | day ${company.fiscalYearLastDay} of month ${company.fiscalYearLastMonth}` +
          (company.usesCalendarFiscalYear() ? " (calendar year)" : ""),
      );
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    const accounts = book.accounts;
    out.push("## Chart of accounts");
    if (accounts) {
      out.push(
        `${accounts.size()} accounts. This is the vocabulary the client's own books use — name accounts as they are named here.`,
        "code | name | type",
      );
      for (const entry of accounts.entries) {
        out.push(`${entry.account.code} | ${entry.account.name} | ${entry.accountType}`);
      }
    } else {
      out.push(
        `${NOT_AVAILABLE} Account names appearing below have not been checked against the client's chart of accounts.`,
      );
    }

    return out.join("\n");
  }

  // ── 2–6. Volatile: the month ────────────────────────────────────────────────

  private renderVolatile(book: MonthlyBook, runway: Runway | null): string {
    const currency = book.currency();
    const out: string[] = [
      `# The books for ${book.month.label()}`,
      "",
      "field | value",
      `month | ${book.month.key()} (${isoDate(book.month.startsOn())} to ${isoDate(book.month.endsOn())})`,
      `as of | ${isoDate(book.asOf())} — every point-in-time figure below is this date, not today`,
      `assembled at | ${book.assembledAt.toISOString()}`,
      `amounts in | ${currency || "unknown"} (a figure in another currency carries its code)`,
      "",
    ];

    out.push(...this.renderHeadline(book, runway, currency), "");
    out.push(...this.renderTrailing(book, currency), "");
    out.push(...this.renderByCategory(book, currency), "");
    out.push(...this.renderAggregates(book, currency), "");
    out.push(...this.renderDocuments(book, currency), "");
    out.push(...this.renderGaps(book));

    return out.join("\n");
  }

  private renderHeadline(book: MonthlyBook, runway: Runway | null, currency: string): string[] {
    const out: string[] = ["## Headline", ""];

    const pnl = book.pnl;
    out.push(`### Profit and loss — movement in ${book.month.label()}`);
    if (pnl) {
      const margin = pnl.grossMargin();
      out.push(
        "line | amount",
        `revenue | ${amount(pnl.revenue(), currency)}`,
        `cost of sales | ${amount(pnl.costOfSales(), currency)}`,
        `expenses (all) | ${amount(pnl.expenses(), currency)}`,
        `net | ${amount(pnl.net(), currency)}`,
        `gross margin | ${margin === null ? "not meaningful (no revenue)" : percent(margin)}`,
        "",
        "By account type:",
        "account type | amount",
        ...pnl.byType.map((row) => `${row.accountType} | ${amount(row.amount, currency)}`),
      );
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    const cash = book.cash;
    out.push(`### Cash position — as of ${cash ? isoDate(cash.asOf) : isoDate(book.asOf())}`);
    if (cash) {
      out.push(
        "account | balance",
        ...cash.accounts.map((row) => `${row.account.code} ${row.account.name} | ${amount(row.balance, currency)}`),
        `TOTAL | ${amount(cash.total(), currency)}`,
      );
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    // Runway is computed in domain/ from cash and the trailing series. It is
    // backward-looking arithmetic, never a forecast, and the model must not
    // recompute or extend it — hence the flat statement rather than the inputs.
    out.push("### Runway");
    if (runway) {
      out.push(
        `${runway.label()} — as of ${isoDate(runway.asOf)}, averaging the last ${runway.windowMonths} months' burn of ${amount(runway.monthlyBurn, currency)} per month.`,
        "This figure is already calculated. Quote it; do not recompute it, and do not project it forward.",
      );
    } else {
      out.push(
        "Not available — the client is profitable over the window, or there is not enough history to average a burn. Say that rather than estimating one.",
      );
    }
    out.push("");

    const tax = book.tax;
    out.push(`### Tax accrued — movement in ${book.month.label()}`);
    if (tax) {
      out.push(
        "This is tax ACCRUED in the month. It is NOT a return and NOT what is owed to the tax office:",
        "a filing period is usually a quarter. Never present this as a filing figure.",
        "line | kind | amount",
        ...tax.lines.map((line) => `${line.name} | ${line.kind} | ${amount(line.amount, currency)}`),
        `charged on sales | sales | ${amount(tax.charged(), currency)}`,
        `reclaimable on purchases | purchase | ${amount(tax.reclaimable(), currency)}`,
        `net accrued | | ${amount(tax.netPayable(), currency)}`,
      );
    } else {
      out.push(NOT_AVAILABLE);
    }

    return out;
  }

  private renderTrailing(book: MonthlyBook, currency: string): string[] {
    const out: string[] = [`## Trailing months to ${book.month.label()}`, ""];
    const trailing = book.trailing;

    if (!trailing) {
      out.push(
        `${NOT_AVAILABLE} Say so in these terms: this is ${book.month.label()} on its own — no comparison`,
        "and no runway figure. Do not describe any figure as high, low, unusual or rising: with no",
        "series behind it, there is nothing to call it high against.",
      );
      return out;
    }

    out.push(
      "Read this table before the month's own detail. A single month is noisy: one late invoice or one",
      "annual bill booked whole moves it more than the business did. **Check any spike against the same",
      "line in prior months before calling it a problem, and say `one-off` when the series shows it as one.**",
      "",
      "month | revenue | expenses | net",
      ...trailing.series().map(
        (row) =>
          `${row.month.key()} | ${amount(row.revenue, currency)} | ${amount(row.expenses, currency)} | ${amount(row.net, currency)}`,
      ),
      "",
      "Derived comparisons (already calculated — quote these rather than doing the arithmetic again):",
      "comparison | value",
      `revenue vs prior month | ${optionalPercent(trailing.revenueDeltaVsPriorMonth())}`,
      `revenue vs same month last year | ${optionalPercent(trailing.revenueDeltaVsLastYear())}`,
      `average net, last 3 months | ${optionalMoney(trailing.averageNet(3), currency)}`,
      `average net, last 12 months | ${optionalMoney(trailing.averageNet(12), currency)}`,
      `average burn, last 3 months | ${optionalMoney(trailing.averageBurn(3), currency)}`,
    );

    return out;
  }

  /**
   * Report 16, rendered right under report 6 and above everything else.
   *
   * The table above says whether expenses were higher; this one says *which*
   * cost was, which is the question that actually gets asked. It also carries
   * each line's own average and how many months it moved at all — the only two
   * facts that separate an annual premium from a payroll run, and without them
   * a single large bill reads as a crisis.
   */
  private renderByCategory(book: MonthlyBook, currency: string): string[] {
    const byCategory = book.trailingByCategory;
    const out: string[] = [`### Each cost's own history, to ${book.month.label()}`];

    if (!byCategory) {
      out.push(
        `${NOT_AVAILABLE} You have this month's cost breakdown but no history for the individual`,
        "lines, so you can compare total expenses over time but not any single cost. Say that rather",
        "than calling one category high, low or unusual.",
      );
      return out;
    }

    // Read the window off the data, not off a constant: `TRAILING_MONTHS` is
    // config. And `avg before` must ask for one month *fewer* than the window —
    // only `months - 1` of them precede the anchor, and asking for the full
    // window returns null every time, which is how this column silently
    // rendered empty on a 12-month book while looking right on a 13-month one.
    const months = byCategory.categories[0]?.months.length ?? 0;
    const before = Math.max(1, months - 1);

    out.push(
      "Every figure is that account's movement in that month. `months active` counts how many of the",
      "trailing months the account moved at all: a line active in 1 of them is a one-off and must be",
      "called one; a line active in all of them is a running cost. `avg before` excludes this month, so",
      "it is the honest baseline to put this month's figure against.",
      "",
      `account | ${book.month.key()} | avg ${months}m | avg before (${before}m) | months active | rising streak`,
      ...byCategory
        .top(MAX_CATEGORY_LINES)
        .map(
          (series) =>
            `${series.account.code} ${series.account.name} | ${amount(series.latest(), currency)} | ` +
            `${optionalMoney(series.average(months), currency)} | ` +
            `${optionalMoney(series.averageBefore(before), currency)} | ` +
            `${series.monthsWithActivity()} of ${series.months.length} | ${series.risingStreak()}`,
        ),
    );

    if (byCategory.size() > MAX_CATEGORY_LINES) {
      out.push(truncated(byCategory.size(), MAX_CATEGORY_LINES, "accounts"));
    }

    return out;
  }

  private renderAggregates(book: MonthlyBook, currency: string): string[] {
    const out: string[] = ["## Account and partner detail", ""];

    const trialBalance = book.trialBalance;
    out.push(`### Trial balance — movement in ${book.month.label()}`);
    if (trialBalance) {
      const lines = [...trialBalance.lines].sort(
        (a, b) => Math.abs(b.movement.amountMinor) - Math.abs(a.movement.amountMinor),
      );
      out.push("account | type | movement", ...lines
        .slice(0, MAX_TRIAL_BALANCE_LINES)
        .map((line) => `${line.account.code} ${line.account.name} | ${line.accountType} | ${amount(line.movement, currency)}`));
      if (lines.length > MAX_TRIAL_BALANCE_LINES) {
        out.push(truncated(lines.length, MAX_TRIAL_BALANCE_LINES, "accounts"));
      }
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    const balanceSheet = book.balanceSheet;
    out.push(
      `### Balance sheet — as of ${balanceSheet ? isoDate(balanceSheet.asOf) : isoDate(book.asOf())}`,
    );
    if (balanceSheet) {
      out.push(
        "line | amount",
        `assets | ${amount(balanceSheet.assets(), currency)}`,
        `liabilities | ${amount(balanceSheet.liabilities(), currency)}`,
        `equity | ${amount(balanceSheet.equity(), currency)}`,
        "",
        "account type | amount",
        ...balanceSheet.byType.map((row) => `${row.accountType} | ${amount(row.amount, currency)}`),
      );
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    const partners = book.partners;
    out.push(`### Partner balances — as of ${isoDate(book.asOf())}`);
    if (partners) {
      const concentration = partners.concentration();
      out.push(
        `total receivable | ${amount(partners.totalReceivable(), currency)}`,
        `total payable | ${amount(partners.totalPayable(), currency)}`,
        `largest receivable as a share of the total | ${optionalPercent(concentration, false)}`,
        "",
        "owed to the client — party | balance",
        ...partners.receivable
          .slice(0, MAX_PARTY_ROWS)
          .map((row) => `${row.party.name} | ${amount(row.balance, currency)}`),
        "",
        "owed by the client — party | balance",
        ...partners.payable
          .slice(0, MAX_PARTY_ROWS)
          .map((row) => `${row.party.name} | ${amount(row.balance, currency)}`),
      );
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    const partnerRevenue = book.partnerRevenue;
    out.push(`### Revenue by customer — ${book.month.label()}`);
    if (partnerRevenue) {
      const top = partnerRevenue.concentration();
      out.push(
        "party | revenue",
        ...partnerRevenue
          .top(MAX_PARTY_ROWS)
          .map((row) => `${row.party.name} | ${amount(row.revenue, currency)}`),
        `TOTAL | ${amount(partnerRevenue.total(), currency)}`,
        top
          ? `largest customer | ${top.party.name} at ${percent(top.share)} of the month's revenue`
          : "largest customer | none (no revenue in the month)",
      );
    } else {
      out.push(NOT_AVAILABLE);
    }
    out.push("");

    const movements = book.cashMovements;
    out.push(`### Cash movements — ${book.month.label()}`);
    if (movements) {
      out.push(
        `total in | ${amount(movements.totalIn(), currency)}`,
        `total out | ${amount(movements.totalOut(), currency)}`,
        `net | ${amount(movements.net(), currency)}`,
        "",
        "week starting | journal | in | out",
        ...movements.weeks.map(
          (week) =>
            `${isoDate(week.weekStarting)} | ${week.journal} | ${amount(week.inflow, currency)} | ${amount(week.outflow, currency)}`,
        ),
        "",
        "largest individual movements — date | label | journal | amount",
        ...movements.largestLines
          .slice(0, MAX_CASH_LINES)
          .map((line) => `${isoDate(line.date)} | ${line.label} | ${line.journal} | ${amount(line.amount, currency)}`),
      );
      if (movements.largestLines.length > MAX_CASH_LINES) {
        out.push(truncated(movements.largestLines.length, MAX_CASH_LINES, "cash lines"));
      }
    } else {
      out.push(NOT_AVAILABLE);
    }

    return out;
  }

  private renderDocuments(book: MonthlyBook, currency: string): string[] {
    const out: string[] = [
      "## Documents",
      "",
      "`id` is the only identifier the system can verify. Cite ids from these tables and no others.",
      "",
    ];

    out.push(
      ...this.renderLedger(
        book.invoicesIssued,
        `### Invoices issued — dated in ${book.month.label()}`,
        currency,
        book.asOf(),
      ),
      "",
      ...this.renderLedger(
        book.billsReceived,
        `### Bills received — dated in ${book.month.label()}`,
        currency,
        book.asOf(),
      ),
      "",
      ...this.renderLedger(
        book.openReceivables,
        `### Open receivables — still unpaid as of ${isoDate(book.asOf())}`,
        currency,
        book.asOf(),
        "No lower date bound: an invoice issued months ago and still unpaid is in this table.",
      ),
      "",
      ...this.renderLedger(
        book.openPayables,
        `### Open payables — still unpaid as of ${isoDate(book.asOf())}`,
        currency,
        book.asOf(),
      ),
    );

    return out;
  }

  private renderLedger(
    ledger: InvoiceLedger | null,
    heading: string,
    currency: string,
    asOf: Date,
    note?: string,
  ): string[] {
    const out = [heading];
    if (note) out.push(note);

    if (!ledger) {
      out.push(NOT_AVAILABLE);
      return out;
    }

    const documents: readonly Invoice[] =
      ledger.count() > MAX_DOCUMENTS ? ledger.largest(MAX_DOCUMENTS) : ledger.documents;

    out.push(
      `${ledger.count()} documents · billed ${amount(ledger.totalBilled(), currency)} · still outstanding ${amount(ledger.totalOutstanding(), currency)}`,
      "id | number | party | issued | due | total | outstanding | status | days overdue",
      ...documents.map((invoice) =>
        [
          invoice.id.value,
          invoice.number,
          invoice.party.name,
          isoDate(invoice.issuedOn),
          isoDate(invoice.dueDate),
          amount(invoice.total, currency),
          amount(invoice.outstanding, currency),
          invoice.status,
          String(invoice.daysOverdue(asOf)),
        ].join(" | "),
      ),
    );

    if (ledger.count() > MAX_DOCUMENTS) {
      out.push(truncated(ledger.count(), MAX_DOCUMENTS, "documents"));
    }

    return out;
  }

  /**
   * Last thing read before the question, on purpose. Silence about missing data
   * is how a CFO product loses trust — so the hole is stated in the words the
   * client would use, immediately before the model decides what to say.
   */
  private renderGaps(book: MonthlyBook): string[] {
    const out: string[] = ["## What could not be read"];

    if (book.gaps.length === 0) {
      out.push("Nothing — every report came back.");
    } else {
      out.push(
        "Each line is a report that failed. Say what is missing and what it costs the answer; never fill the gap.",
        "missing | how much it matters | why it failed",
        ...book.gaps.map((gap: BookGap) => `${gap.label()} | ${gap.tier} | ${gap.reason}`),
      );
    }

    if (book.settling) {
      out.push(
        "",
        `${book.month.label()}'s books have ended but are still settling: late vendor bills and the bank`,
        "reconciliation can still move these figures. Say so — the reply carries the same warning in its footer.",
      );
    }

    if (book.partial) {
      out.push(
        "",
        `${book.month.label()} is not over. This is the month so far, not a closed month. Say so before any figure.`,
      );
    }

    return out;
  }
}

const NOT_AVAILABLE = "Not available — this report did not come back. Say so if the question needs it.";

/**
 * Plain decimals, no grouping marks and no symbols: the model reads numbers, and
 * `$12,340.00` costs three extra tokens per cell to say what `12340.00` says.
 * The currency code appears only when it departs from the book's own — the case
 * a reader must not miss.
 */
function amount(money: Money, bookCurrency: string): string {
  const value = money.toMajor().toFixed(2);
  return money.currency === bookCurrency ? value : `${value} ${money.currency}`;
}

function percent(fraction: number): string {
  const whole = Math.round(fraction * 100);
  if (whole === 0) return "0%";
  return `${whole > 0 ? "+" : "-"}${Math.abs(whole)}%`;
}

function optionalPercent(fraction: number | null, signed = true): string {
  if (fraction === null) return "not available";
  return signed ? percent(fraction) : `${Math.round(fraction * 100)}%`;
}

function optionalMoney(money: Money | null, bookCurrency: string): string {
  return money === null ? "not available" : amount(money, bookCurrency);
}

function truncated(total: number, kept: number, noun: string): string {
  return `(${total} ${noun} in total; the ${kept} largest by absolute amount are listed. The totals above are exact.)`;
}
