import { Tier } from "../../../../domain/model/BookPart.js";
import type { InvoiceLedger } from "../../../../domain/model/InvoiceLedger.js";
import type { BookRequest, LedgerReport } from "../../accounting/LedgerReport.js";
import { companyFilter, type OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import { DOCUMENT_FIELDS, MAX_DOCUMENTS, type OdooMapper } from "../OdooMapper.js";

/** Odoo also carries `invoicing_legacy` for migrated books; it is not an open debt. */
const SETTLED = ["paid", "reversed", "invoicing_legacy"];

/**
 * Report 3 — who owed us at month end.
 *
 * **There is deliberately no lower date bound, and that is the whole point.**
 * The invoice issued five months ago and still unpaid is exactly the one the
 * founder is asking about; a month filter drops it silently and Phase 1 gives a
 * confidently incomplete answer (docs §4 A). The only date clause is the
 * upper one, because the book answers about a point in time.
 *
 * Aging is not queried — `AgingAnalyzer` derives the buckets in domain from this
 * ledger using `month.endsOn()` as "now".
 */
export class OpenReceivablesReport implements LedgerReport<"openReceivables"> {
  readonly part = "openReceivables" as const;
  readonly tier = Tier.Required;

  constructor(
    private readonly rpc: OdooReads,
    private readonly mapper: OdooMapper,
    private readonly company: OdooCompanyContext,
  ) {}

  async run({ month, companyId }: BookRequest): Promise<InvoiceLedger> {
    const rows = await this.rpc.searchRead(
      "account.move",
      [
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["payment_state", "not in", SETTLED],
        ["invoice_date", "<=", month.endsOnIso()],
        ...companyFilter(companyId),
      ],
      DOCUMENT_FIELDS,
      // What is *outstanding* orders this list, not what was billed (docs §4).
      { limit: MAX_DOCUMENTS, order: "amount_residual desc" },
    );
    return this.mapper.toInvoiceLedger(rows, await this.company.currency(companyId));
  }
}
