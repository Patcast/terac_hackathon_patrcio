import { InvoiceLedger } from "./InvoiceLedger.js";
import { BalanceSheet } from "./book/BalanceSheet.js";
import { CashMovements } from "./book/CashMovements.js";
import { CashPosition } from "./book/CashPosition.js";
import { ChartOfAccounts } from "./book/ChartOfAccounts.js";
import { CompanyProfile } from "./book/CompanyProfile.js";
import { PartnerBalances } from "./book/PartnerBalances.js";
import { PartnerRevenue } from "./book/PartnerRevenue.js";
import { ProfitAndLoss } from "./book/ProfitAndLoss.js";
import { TaxSummary } from "./book/TaxSummary.js";
import { TrailingByCategory } from "./book/TrailingByCategory.js";
import { TrailingMonths } from "./book/TrailingMonths.js";
import { TrialBalance } from "./book/TrialBalance.js";

/**
 * The sixteen slots of a book, keyed by name.
 *
 * A keyed map type rather than a list of parts, because it is what makes
 * `parts[report.part] = await report.run(request)` type-check per report in the
 * assembler — a report physically cannot write a `TaxSummary` into the cash slot
 * (docs/architecture_phase1.md §7).
 */
export interface BookParts {
  invoicesIssued: InvoiceLedger;
  billsReceived: InvoiceLedger;
  openReceivables: InvoiceLedger;
  openPayables: InvoiceLedger;
  pnl: ProfitAndLoss;
  trailing: TrailingMonths;
  trailingByCategory: TrailingByCategory;
  trialBalance: TrialBalance;
  balanceSheet: BalanceSheet;
  cash: CashPosition;
  cashMovements: CashMovements;
  tax: TaxSummary;
  partners: PartnerBalances;
  partnerRevenue: PartnerRevenue;
  accounts: ChartOfAccounts;
  company: CompanyProfile;
}

export type BookPart = keyof BookParts;

/**
 * How much a missing part costs (docs/architecture_phase1.md §5). Fifteen
 * queries mean fourteen ways to be *partly* successful, and a blanket failure is
 * the wrong answer to "the tax report timed out" when the question was about AR.
 */
export const Tier = {
  Required: "required",
  Standard: "standard",
  Optional: "optional",
} as const;

export type Tier = (typeof Tier)[keyof typeof Tier];

/**
 * `TrailingMonths` sits in Standard, not Optional: without it there is no
 * comparison and no runway, so the owner has to be told. It is not Required
 * because "what did July do?" is still a complete answer without it.
 */
export const PART_TIERS: Readonly<Record<BookPart, Tier>> = {
  invoicesIssued: Tier.Standard,
  billsReceived: Tier.Standard,
  openReceivables: Tier.Required,
  openPayables: Tier.Standard,
  pnl: Tier.Required,
  trailing: Tier.Standard,
  trailingByCategory: Tier.Standard,
  trialBalance: Tier.Standard,
  balanceSheet: Tier.Optional,
  cash: Tier.Required,
  cashMovements: Tier.Optional,
  tax: Tier.Standard,
  partners: Tier.Standard,
  partnerRevenue: Tier.Optional,
  accounts: Tier.Optional,
  company: Tier.Required,
};

/**
 * What a *client* reads in the reply footer — `⚠️ couldn't read: the tax lines`.
 *
 * So these are plain English noun phrases, not identifiers: the person reading
 * them owns a business, has never heard of `partnerRevenue`, and is being told
 * something is missing from their own numbers.
 */
export const PART_LABELS: Readonly<Record<BookPart, string>> = {
  invoicesIssued: "the invoices you issued",
  billsReceived: "the bills you received",
  openReceivables: "who owes you",
  openPayables: "what you owe",
  pnl: "the profit and loss",
  // Not "the last 12 months": the window is `TRAILING_MONTHS`, and a footer that
  // names a number the config can change is a footer that will one day lie.
  trailing: "the month-by-month trend",
  trailingByCategory: "the month-by-month history for each cost",
  trialBalance: "the account-by-account detail",
  balanceSheet: "the balance sheet",
  cash: "your cash balances",
  cashMovements: "money in and out",
  tax: "the tax lines",
  partners: "customer and supplier balances",
  partnerRevenue: "revenue by customer",
  accounts: "your chart of accounts",
  company: "your company details",
};

/**
 * Every part, in book order. Derived from `PART_TIERS` rather than written out
 * again so it cannot fall out of step — the `Record<BookPart, Tier>` above is
 * the one place the compiler enforces that all fifteen are listed.
 */
export const ALL_BOOK_PARTS: readonly BookPart[] = Object.keys(PART_TIERS) as BookPart[];

export const REQUIRED_PARTS: readonly BookPart[] = ALL_BOOK_PARTS.filter(
  (part) => PART_TIERS[part] === Tier.Required,
);
