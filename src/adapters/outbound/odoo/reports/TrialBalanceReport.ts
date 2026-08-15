import { Tier } from "../../../../domain/model/BookPart.js";
import type { TrialBalance } from "../../../../domain/model/book/TrialBalance.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * Report 7 — the general ledger at usable granularity, and the report behind
 * "what was my biggest cost in July".
 *
 * **Month movement**, so both bounds are present. `account_type` is a second
 * groupby rather than a second query: an account has exactly one type, so it
 * costs no extra rows and saves the mapper a lookup it would otherwise need the
 * chart of accounts for.
 */
export class TrialBalanceReport implements LedgerReport<"trialBalance"> {
  readonly part = "trialBalance" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ period, companyId }: BookRequest): Promise<TrialBalance> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"],
        ["date", ">=", period.fromIso()],
        ["date", "<=", period.toIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["account_id", "account_type"],
    });
    return this.mapper.toTrialBalance(rows, await this.company.currency(companyId));
  }
}
