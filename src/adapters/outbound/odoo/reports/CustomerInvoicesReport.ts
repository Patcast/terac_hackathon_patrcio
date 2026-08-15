import { Tier } from "../../../../domain/model/BookPart.js";
import type { InvoiceLedger } from "../../../../domain/model/InvoiceLedger.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import { DOCUMENT_FIELDS, MAX_DOCUMENTS, type OdooMapper } from "../OdooMapper.js";

/**
 * Report 1 — what we billed in the month, at the **document** layer.
 *
 * Read as `account.move` rather than as GL lines because `amount_residual` and
 * `payment_state` exist only on the document; rebuilding them from lines means
 * reimplementing Odoo's reconciliation engine (docs §4 A).
 */
export class CustomerInvoicesReport implements LedgerReport<"invoicesIssued"> {
  readonly part = "invoicesIssued" as const;
  readonly tier = Tier.Standard;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ period, companyId }: BookRequest): Promise<InvoiceLedger> {
    const rows = await this.rpc.searchRead(
      "account.move",
      [
        ["move_type", "in", ["out_invoice", "out_refund"]], // credit notes reduce the picture
        ["state", "=", "posted"], // drafts are not facts
        ["invoice_date", ">=", period.fromIso()],
        ["invoice_date", "<=", period.toIso()],
        ...companyFilter(companyId),
      ],
      DOCUMENT_FIELDS,
      // Over the cap, keep the largest rather than the most recent (docs §11).
      { limit: MAX_DOCUMENTS, order: "amount_total desc" },
    );
    return this.mapper.toInvoiceLedger(rows, await this.company.currency(companyId));
  }
}
