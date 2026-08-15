import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { BalanceSheet } from "../../../../domain/model/book/BalanceSheet.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

const POSITION_TYPES = [
  ...AccountTypes.asset,
  ...AccountTypes.liability,
  ...AccountTypes.equity,
];

/**
 * Report 8 — position, not flow.
 *
 * **Cumulative to month end: there is no `date >=` clause and there must not
 * be.** A balance is the sum of everything ever posted up to a date; filtering
 * to the month turns it into a month's movement while still calling itself a
 * balance sheet, which is the plausible-looking wrong number docs §4 warns
 * about.
 */
export class BalanceSheetReport implements LedgerReport<"balanceSheet"> {
  readonly part = "balanceSheet" as const;
  readonly tier = Tier.Optional;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, asOf, companyId }: BookRequest): Promise<BalanceSheet> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"],
        ["account_type", "in", POSITION_TYPES],
        ["date", "<=", month.endsOnIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["account_type"],
    });
    return this.mapper.toBalanceSheet(rows, asOf, await this.company.currency(companyId));
  }
}
