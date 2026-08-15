import { Tier } from "../../../../domain/model/BookPart.js";
import type { InvoiceLedger } from "../../../../domain/model/InvoiceLedger.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import { DOCUMENT_FIELDS, MAX_DOCUMENTS, type OdooMapper } from "../OdooMapper.js";

const SETTLED = ["paid", "reversed", "invoicing_legacy"];

/**
 * Report 4 — what we owed at month end. Same shape as report 3, and for the same
 * reason: **no lower date bound.** The bill nobody paid in March is still a
 * liability in July.
 */
export class OpenPayablesReport implements LedgerReport<"openPayables"> {
  readonly part = "openPayables" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, companyId }: BookRequest): Promise<InvoiceLedger> {
    const rows = await this.rpc.searchRead(
      "account.move",
      [
        ["move_type", "in", ["in_invoice", "in_refund"]],
        ["state", "=", "posted"],
        ["payment_state", "not in", SETTLED],
        ["invoice_date", "<=", month.endsOnIso()],
        ...companyFilter(companyId),
      ],
      DOCUMENT_FIELDS,
      { limit: MAX_DOCUMENTS, order: "amount_residual desc" },
    );
    return this.mapper.toInvoiceLedger(rows, await this.company.currency(companyId));
  }
}
