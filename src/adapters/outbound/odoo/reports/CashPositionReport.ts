import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { CashPosition } from "../../../../domain/model/book/CashPosition.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * Report 9 — the bank balance per account, and half of every runway figure.
 *
 * **Cumulative to month end, like report 8: no lower bound.** A `date >=` here
 * would report the month's cash *movement* under the name "cash position", and
 * the number would look entirely plausible.
 */
export class CashPositionReport implements LedgerReport<"cash"> {
  readonly part = "cash" as const;
  readonly tier = Tier.Required;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, asOf, companyId }: BookRequest): Promise<CashPosition> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"],
        ["account_type", "in", [...AccountTypes.cash]],
        ["date", "<=", month.endsOnIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["account_id"],
    });
    return this.mapper.toCashPosition(rows, asOf, await this.company.currency(companyId));
  }
}
