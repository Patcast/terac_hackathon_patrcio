import { Tier } from "../../../../domain/model/BookPart.js";
import type { TaxSummary } from "../../../../domain/model/book/TaxSummary.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * Report 11 — VAT/sales tax **accrued in the month**, never a filing figure.
 *
 * A month is an accrual period, not usually a filing period, and the reply must
 * not blur them (docs §4). What this report answers is "what tax did July
 * accrue"; a filing-period total is several of these added together.
 *
 * `tax_line_id != false` selects lines that **are** the tax. `tax_ids` marks
 * lines that merely *have* tax on them — summing that one double-counts the
 * whole return.
 *
 * `move_type` is the second groupby so the sales/purchase split comes out of the
 * same query. Inferring it from the sign instead would work until the first
 * credit note flipped it.
 */
export class TaxSummaryReport implements LedgerReport<"tax"> {
  readonly part = "tax" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ period, companyId }: BookRequest): Promise<TaxSummary> {
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["tax_line_id", "!=", false], // the line *is* tax, not a taxed line
        ["parent_state", "=", "posted"],
        ["date", ">=", period.fromIso()],
        ["date", "<=", period.toIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      groupby: ["tax_line_id", "move_type"],
    });
    return this.mapper.toTaxSummary(rows, await this.company.currency(companyId));
  }
}
