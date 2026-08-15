import { Tier } from "../../../../domain/model/BookPart.js";
import type { ChartOfAccounts } from "../../../../domain/model/book/ChartOfAccounts.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * Report 14 — the vocabulary the client's books use, and the largest piece of
 * the cacheable prompt prefix (docs §4 C, §11).
 *
 * `account_type` is Odoo 17+; older versions carry the same information behind
 * `user_type_id`. **Verify against the live instance** — this is the field the
 * nine aggregate reports filter on, so if it is wrong here it is wrong
 * everywhere and every figure comes back empty rather than wrong, which is at
 * least a loud failure.
 *
 * The company scope is `company_ids` (many2many) on Odoo 17+, not `company_id`.
 *
 * The only report that takes no `OdooCompanyContext`: an account code holds no
 * amount, so it is the one part of the book that needs no currency.
 */
export class ChartOfAccountsReport implements LedgerReport<"accounts"> {
  readonly part = "accounts" as const;
  readonly tier = Tier.Optional;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
  ) {}

  async run({ companyId }: BookRequest): Promise<ChartOfAccounts> {
    const rows = await this.rpc.searchRead(
      "account.account",
      [...companyFilter(companyId, "company_ids")],
      ["code", "name", "account_type"],
      { order: "code asc" },
    );
    return this.mapper.toChartOfAccounts(rows);
  }
}
