import { Tier } from "../../../../domain/model/BookPart.js";
import type { InvoiceLedger } from "../../../../domain/model/InvoiceLedger.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import { DOCUMENT_FIELDS, MAX_DOCUMENTS, type OdooMapper } from "../OdooMapper.js";

/** Report 2 — what we were billed in the month. Mirror image of report 1. */
export class VendorBillsReport implements LedgerReport<"billsReceived"> {
  readonly part = "billsReceived" as const;
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
        ["move_type", "in", ["in_invoice", "in_refund"]],
        ["state", "=", "posted"],
        ["invoice_date", ">=", period.fromIso()],
        ["invoice_date", "<=", period.toIso()],
        ...companyFilter(companyId),
      ],
      DOCUMENT_FIELDS,
      { limit: MAX_DOCUMENTS, order: "amount_total desc" },
    );
    return this.mapper.toInvoiceLedger(rows, await this.company.currency(companyId));
  }
}
