import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { PartnerBalances } from "../../../../domain/model/book/PartnerBalances.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

const OPEN_TYPES = [...AccountTypes.receivable, ...AccountTypes.payable];

/**
 * Report 12 — who owes what, both directions.
 *
 * **Cumulative to month end: no lower date bound.** A partner balance is a
 * position; the March invoice nobody paid is still part of it in July.
 *
 * `account_type` is the second groupby so one query answers both directions and
 * the mapper can tell a receivable from a payable without a second lookup.
 */
export class PartnerBalancesReport implements LedgerReport<"partners"> {
  readonly part = "partners" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, companyId }: BookRequest): Promise<PartnerBalances> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"],
        ["account_type", "in", OPEN_TYPES],
        ["date", "<=", month.endsOnIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["partner_id", "account_type"],
    });
    return this.mapper.toPartnerBalances(rows, await this.company.currency(companyId));
  }
}
