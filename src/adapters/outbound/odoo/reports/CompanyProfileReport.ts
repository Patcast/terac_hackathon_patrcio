import { Tier } from "../../../../domain/model/BookPart.js";
import type { CompanyProfile } from "../../../../domain/model/book/CompanyProfile.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import type { OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooMapper } from "../OdooMapper.js";

/**
 * Report 15 — currency, name, and the fiscal-year end behind §3's check.
 *
 * It reads through `OdooCompanyContext` rather than issuing its own query, which
 * is why it takes no rpc: by the time the assembler gets here some other report
 * has almost certainly already resolved the company to build its first `Money`,
 * and this one joins that promise. It is `Required` because a book with no
 * currency is a book nobody can add up.
 */
export class CompanyProfileReport implements LedgerReport<"company"> {
  readonly part = "company" as const;
  readonly tier = Tier.Required;

  constructor(
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ companyId }: BookRequest): Promise<CompanyProfile> {
    return this.mapper.toCompanyProfile(await this.company.resolve(companyId));
  }
}
