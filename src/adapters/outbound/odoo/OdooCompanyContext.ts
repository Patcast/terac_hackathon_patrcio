import type { MonthIndex } from "../../../domain/model/Month.js";
import type { Currency } from "../../../domain/model/Money.js";
import type { OdooReads, OdooRow } from "./OdooJsonApiClient.js";

/** `res.company`, already out of Odoo vocabulary. */
export interface OdooCompany {
  id: number;
  name: string;
  currency: Currency;
  fiscalYearLastMonth: MonthIndex;
  fiscalYearLastDay: number;
}

const COMPANY_FIELDS = ["name", "currency_id", "fiscalyear_last_month", "fiscalyear_last_day"];

/**
 * The one thing every report needs before it can build a `Money`, and the one
 * thing none of them can afford to wait in line for.
 *
 * The fifteen reports run concurrently (docs §7), so if each read `res.company`
 * itself the catalogue would open with fifteen identical round trips; and a
 * report cannot wait on `CompanyProfileReport` without inventing an ordering
 * the assembler deliberately does not have. So the lookup lives here and is
 * memoized **as a promise**: the first report to ask issues the request, every
 * other report joins the same one, and the rest of the process is free.
 *
 * A rejected lookup is evicted so one bad minute doesn't poison the process.
 */
export class OdooCompanyContext {
  private readonly inFlight = new Map<string, Promise<OdooCompany>>();

  constructor(private readonly rpc: OdooReads) {}

  async resolve(companyId: number | null = null): Promise<OdooCompany> {
    const key = String(companyId ?? "default");
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const pending = this.load(companyId).catch((error: unknown) => {
      this.inFlight.delete(key);
      throw error;
    });
    this.inFlight.set(key, pending);
    return pending;
  }

  /**
   * Phase 1 restricts every figure to the **company** currency (docs §4).
   *
   * The alternative — carrying each document's own currency through — means
   * `Money.plus` starts throwing `CurrencyMismatchError` the first time a client
   * bills in two currencies, which is `Money` doing exactly its job: refusing to
   * add dollars to euros rather than quietly producing a number. Until Phase 1.5
   * has a rate source, the honest handling of a multi-currency book is to read
   * the company-currency amounts Odoo already computes (`*_signed` on documents,
   * `balance` on lines, both stored in company currency) and to say so, not to
   * convert at an invented rate.
   */
  async currency(companyId: number | null = null): Promise<Currency> {
    return (await this.resolve(companyId)).currency;
  }

  private async load(companyId: number | null): Promise<OdooCompany> {
    const domain = companyId === null ? [] : [["id", "=", companyId]];
    const rows = await this.rpc.searchRead<OdooRow>("res.company", domain, COMPANY_FIELDS, {
      limit: 1,
    });

    const row = rows[0];
    if (!row) throw new Error(`Odoo returned no res.company for ${companyId ?? "the API key"}`);

    return {
      id: typeof row["id"] === "number" ? row["id"] : (companyId ?? 0),
      name: typeof row["name"] === "string" ? row["name"] : "Unnamed company",
      currency: currencyOf(row["currency_id"]),
      fiscalYearLastMonth: monthIndexOf(row["fiscalyear_last_month"]),
      fiscalYearLastDay: dayOf(row["fiscalyear_last_day"]),
    };
  }
}

/**
 * The company clause every report appends, or nothing when the client's
 * `companyId` is unknown — an unfiltered read against a single-company database
 * is correct, whereas a filter on a guessed id silently returns an empty book.
 *
 * `field` exists because the models disagree: `account.move` and
 * `account.move.line` carry `company_id`, while Odoo 17+ made `account.account`
 * multi-company through `company_ids`. **Verify the account one against the live
 * instance** — it is the field name most likely to differ across versions.
 */
export function companyFilter(companyId: number | null, field = "company_id"): unknown[] {
  if (companyId === null) return [];
  return field === "company_ids" ? [[field, "in", [companyId]]] : [[field, "=", companyId]];
}

/** `currency_id` is `[125, "EUR"]`; the name is already the ISO code. */
function currencyOf(value: unknown): Currency {
  if (Array.isArray(value) && typeof value[1] === "string" && value[1].trim()) {
    return value[1].trim().toUpperCase();
  }
  throw new Error("Odoo res.company has no readable currency_id — every Money needs one");
}

/** Odoo stores `fiscalyear_last_month` as a *selection*, so it arrives as `"12"`. */
function monthIndexOf(value: unknown): MonthIndex {
  const index = Number(value);
  return Number.isInteger(index) && index >= 1 && index <= 12 ? (index as MonthIndex) : 12;
}

function dayOf(value: unknown): number {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 31;
}
