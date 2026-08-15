import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { TrailingByCategory } from "../../../../domain/model/book/TrailingByCategory.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

const PNL_TYPES = [...AccountTypes.income, ...AccountTypes.expense];

/**
 * Report 16 — the trailing window by **account**, where report 6 does it by
 * account *type*.
 *
 * Report 6 can say expenses were higher in July. Only this can say *rent* was,
 * and that is the question an owner asks. A month's biggest cost stated on its
 * own invites the wrong reaction; the same figure against its own twelve-month
 * average is a finding (docs/imessage_flow_phase1.md beat 2), and telling an
 * annual premium apart from a payroll run needs the line's own history, not the
 * total of every expense line together.
 *
 * One extra `read_group` for the same window. It is the more expensive of the
 * two — roughly `accounts × months` rows before the mapper caps it — which is
 * why it is a separate report rather than a widening of report 6: report 6 is
 * what runway depends on, and it stays cheap and Standard on its own.
 */
export class TrailingByCategoryReport implements LedgerReport<"trailingByCategory"> {
  readonly part = "trailingByCategory" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, trailingMonths, companyId }: BookRequest): Promise<TrailingByCategory> {
    const window = month.trailing(trailingMonths);
    const rows = await this.rpc.readGroup("account.move.line", {
      domain: [
        ["parent_state", "=", "posted"],
        ["account_type", "in", PNL_TYPES],
        ["date", ">=", window.fromIso()],
        ["date", "<=", window.toIso()],
        ...companyFilter(companyId),
      ],
      fields: ["balance:sum"],
      // `account_type` rides along so the mapper can apply the sign convention
      // without a second lookup against the chart of accounts.
      groupby: ["account_id", "account_type", "date:month"],
    });
    return this.mapper.toTrailingByCategory(
      rows,
      month,
      trailingMonths,
      await this.company.currency(companyId),
    );
  }
}
