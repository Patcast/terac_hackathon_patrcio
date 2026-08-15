import type { BookPart } from "../../../../domain/model/BookPart.js";
import type { LedgerReport } from "../../accounting/LedgerReport.js";
import type { OdooCompanyContext } from "../OdooCompanyContext.js";
import type { OdooReads } from "../OdooJsonApiClient.js";
import type { OdooMapper } from "../OdooMapper.js";
import { BalanceSheetReport } from "./BalanceSheetReport.js";
import { CashMovementsReport } from "./CashMovementsReport.js";
import { CashPositionReport } from "./CashPositionReport.js";
import { ChartOfAccountsReport } from "./ChartOfAccountsReport.js";
import { CompanyProfileReport } from "./CompanyProfileReport.js";
import { CustomerInvoicesReport } from "./CustomerInvoicesReport.js";
import { OpenPayablesReport } from "./OpenPayablesReport.js";
import { OpenReceivablesReport } from "./OpenReceivablesReport.js";
import { PartnerBalancesReport } from "./PartnerBalancesReport.js";
import { PartnerRevenueReport } from "./PartnerRevenueReport.js";
import { ProfitAndLossReport } from "./ProfitAndLossReport.js";
import { TaxSummaryReport } from "./TaxSummaryReport.js";
import { TrailingByCategoryReport } from "./TrailingByCategoryReport.js";
import { TrailingMonthsReport } from "./TrailingMonthsReport.js";
import { TrialBalanceReport } from "./TrialBalanceReport.js";
import { VendorBillsReport } from "./VendorBillsReport.js";

export { BalanceSheetReport } from "./BalanceSheetReport.js";
export { CashMovementsReport } from "./CashMovementsReport.js";
export { CashPositionReport } from "./CashPositionReport.js";
export { ChartOfAccountsReport } from "./ChartOfAccountsReport.js";
export { CompanyProfileReport } from "./CompanyProfileReport.js";
export { CustomerInvoicesReport } from "./CustomerInvoicesReport.js";
export { OpenPayablesReport } from "./OpenPayablesReport.js";
export { OpenReceivablesReport } from "./OpenReceivablesReport.js";
export { PartnerBalancesReport } from "./PartnerBalancesReport.js";
export { PartnerRevenueReport } from "./PartnerRevenueReport.js";
export { ProfitAndLossReport } from "./ProfitAndLossReport.js";
export { TaxSummaryReport } from "./TaxSummaryReport.js";
export { TrailingByCategoryReport } from "./TrailingByCategoryReport.js";
export { TrailingMonthsReport } from "./TrailingMonthsReport.js";
export { TrialBalanceReport } from "./TrialBalanceReport.js";
export { VendorBillsReport } from "./VendorBillsReport.js";

/**
 * The catalogue, in catalogue order (docs §4, §12).
 *
 * The composition root still owns the wiring — this is a convenience so the
 * container reads as one line instead of fifteen, and so adding a sixteenth
 * report is one file plus one line *here* rather than a change in `composition/`.
 * Order is irrelevant: the assembler runs them concurrently.
 */
export function odooReportCatalogue(
  rpc: OdooReads,
  mapper: OdooMapper,
  company: OdooCompanyContext,
): LedgerReport<BookPart>[] {
  return [
    new CustomerInvoicesReport(rpc, mapper, company), // 1
    new VendorBillsReport(rpc, mapper, company), // 2
    new OpenReceivablesReport(rpc, mapper, company), // 3
    new OpenPayablesReport(rpc, mapper, company), // 4
    new ProfitAndLossReport(rpc, mapper, company), // 5
    new TrailingMonthsReport(rpc, mapper, company), // 6  ← trailing 12m, see §4
    new TrialBalanceReport(rpc, mapper, company), // 7
    new BalanceSheetReport(rpc, mapper, company), // 8
    new CashPositionReport(rpc, mapper, company), // 9
    new CashMovementsReport(rpc, mapper, company), // 10
    new TaxSummaryReport(rpc, mapper, company), // 11
    new PartnerBalancesReport(rpc, mapper, company), // 12
    new PartnerRevenueReport(rpc, mapper, company), // 13
    new ChartOfAccountsReport(rpc, mapper), // 14 — no amounts, so no currency
    new CompanyProfileReport(mapper, company), // 15 — reads through the context
    new TrailingByCategoryReport(rpc, mapper, company), // 16 — beat 2's comparison
  ];
}
