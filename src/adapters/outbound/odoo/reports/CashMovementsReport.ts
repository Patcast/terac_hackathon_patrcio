import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { CashMovements } from "../../../../domain/model/book/CashMovements.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import { MAX_CASH_LINES, type OdooMapper } from "../OdooMapper.js";

const CASH_LINE_FIELDS = ["date", "name", "move_name", "journal_id", "balance"];

/**
 * Report 10 — money actually in and out. **Month movement**, both bounds.
 *
 * The one report in the catalogue that is not a single call, because §4 asks it
 * for two answers: the weekly shape (`journal_id` × `date:week`, ~15 rows) and
 * the individual lines big enough to name. `read_group` cannot return both, and
 * fetching every cash line to derive the weeks client-side is the raw-line dump
 * §4 rules out. They run concurrently, so it is still one round trip of latency.
 *
 * `debit`/`credit` rather than `balance`: a week that took in €20k and paid out
 * €20k nets to zero, and "nothing moved" is a different answer from "€40k moved".
 */
export class CashMovementsReport implements LedgerReport<"cashMovements"> {
  readonly part = "cashMovements" as const;
  readonly tier = Tier.Optional;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ period, companyId }: BookRequest): Promise<CashMovements> {
    const domain = [
      ["parent_state", "=", "posted"],
      ["account_type", "in", [...AccountTypes.cash]],
      ["date", ">=", period.fromIso()],
      ["date", "<=", period.toIso()],
      ...companyFilter(companyId),
    ];

    // Odoo cannot order by |balance|, so both tails are read and the mapper keeps
    // the largest by absolute amount — a big payment out matters as much as a big
    // one in (docs §11).
    const [weeks, biggestIn, biggestOut, currency] = await Promise.all([
      this.rpc.readGroup("account.move.line", {
        domain,
        fields: ["debit:sum", "credit:sum", "balance:sum"],
        groupby: ["journal_id", "date:week"],
      }),
      this.rpc.searchRead("account.move.line", domain, CASH_LINE_FIELDS, {
        limit: MAX_CASH_LINES,
        order: "balance desc",
      }),
      this.rpc.searchRead("account.move.line", domain, CASH_LINE_FIELDS, {
        limit: MAX_CASH_LINES,
        order: "balance asc",
      }),
      this.company.currency(companyId),
    ]);

    return this.mapper.toCashMovements(weeks, dedupe([...biggestIn, ...biggestOut]), currency);
  }
}

/** The two tails overlap when the month has fewer than 2 × MAX_CASH_LINES lines. */
function dedupe(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Map<unknown, Record<string, unknown>>();
  for (const row of rows) seen.set(row["id"], row);
  return [...seen.values()];
}
