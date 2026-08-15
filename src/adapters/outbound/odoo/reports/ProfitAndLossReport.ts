import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { ProfitAndLoss } from "../../../../domain/model/book/ProfitAndLoss.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * These are Odoo 17+ `account_type` values on `account.account`; older versions
 * express the same thing as `user_type_id`. **Verify against the live instance**
 * before trusting a P&L built on them (docs §4).
 */
const PNL_TYPES = [...AccountTypes.income, ...AccountTypes.expense];

/**
 * Report 5 — the headline. **Month movement**, so both date bounds are present;
 * a balance would be cumulative (docs §4 B).
 */
export class ProfitAndLossReport implements LedgerReport<"pnl"> {
  readonly part = "pnl" as const;
  readonly tier = Tier.Required;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ period, companyId }: BookRequest): Promise<ProfitAndLoss> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"], // `state` on the document, `parent_state` on the line
        ["account_type", "in", PNL_TYPES],
        ["date", ">=", period.fromIso()],
        ["date", "<=", period.toIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["account_type"],
    });
    return this.mapper.toProfitAndLoss(rows, await this.company.currency(companyId));
  }
}
