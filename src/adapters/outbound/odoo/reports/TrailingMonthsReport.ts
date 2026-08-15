import { AccountTypes } from "../../../../domain/model/AccountTypes.js";
import { Tier } from "../../../../domain/model/BookPart.js";
import type { TrailingMonths } from "../../../../domain/model/book/TrailingMonths.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

const PNL_TYPES = [...AccountTypes.income, ...AccountTypes.expense];

/**
 * Report 6 — **the most valuable query in the catalogue** (docs §4).
 *
 * One `read_group` on `account_type` × `date:month` over the trailing window
 * returns ~90 rows in a single round trip, and out of them fall month-over-month,
 * same-month-last-year, trend, and the burn that makes runway a pure calculation
 * over the book instead of a sixteenth report.
 *
 * It is also the structural defence against monthly reporting's characteristic
 * failure: an annual premium booked whole into one month reads as a crisis until
 * you can see the same line in the eleven months around it.
 *
 * The `date:month` buckets come back labelled in the service user's language,
 * so the mapper resolves each one by its `__range`, never by the label.
 */
export class TrailingMonthsReport implements LedgerReport<"trailing"> {
  readonly part = "trailing" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, trailingMonths, companyId }: BookRequest): Promise<TrailingMonths> {
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
      groupby: ["account_type", "date:month"],
    });
    return this.mapper.toTrailingMonths(
      rows,
      month,
      trailingMonths,
      await this.company.currency(companyId),
    );
  }
}
