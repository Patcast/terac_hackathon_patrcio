import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { PartnerRevenue } from "../../../../domain/model/book/PartnerRevenue.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * Report 13 — top customers and concentration risk, and the first-choice source
 * for the close-out's one "watching" line.
 *
 * **Month movement**, both bounds: this is who paid the bills *this month*, not
 * who has ever been a customer. Income accounts are credit-negative, so the flip
 * happens in the mapper.
 */
export class PartnerRevenueReport implements LedgerReport<"partnerRevenue"> {
  readonly part = "partnerRevenue" as const;
  readonly tier = Tier.Optional;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ period, companyId }: BookRequest): Promise<PartnerRevenue> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"],
        ["account_type", "in", [...AccountTypes.income]],
        ["date", ">=", period.fromIso()],
        ["date", "<=", period.toIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["partner_id"],
    });
    return this.mapper.toPartnerRevenue(rows, await this.company.currency(companyId));
  }
}
