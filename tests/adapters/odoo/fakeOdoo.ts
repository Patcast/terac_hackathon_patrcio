import type {
  OdooReads,
  OdooRow,
  ReadGroupRow,
  ReadGroupSpec,
} from "../../../src/adapters/outbound/odoo/OdooJsonApiClient.js";

export interface SearchReadCall {
  model: string;
  domain: unknown[];
  fields: string[];
  options: { limit?: number; offset?: number; order?: string };
}

export interface ReadGroupCall {
  model: string;
  spec: ReadGroupSpec;
}

/**
 * A recording stand-in for `OdooJsonApiClient`.
 *
 * The reports depend on `OdooReads` rather than the class precisely so this can
 * exist: the thing worth testing without a live instance is the **shape of the
 * query** — whether a balance report grew a `date >=` clause, whether the refund
 * move types are still in the list — because those are the bugs that come back
 * as plausible numbers rather than as errors.
 */
export class FakeOdoo implements OdooReads {
  readonly searchReadCalls: SearchReadCall[] = [];
  readonly readGroupCalls: ReadGroupCall[] = [];

  rows: OdooRow[] = [];
  groupRows: ReadGroupRow[] = [];
  company: OdooRow = {
    id: 1,
    name: "Blackthorn Studio",
    currency_id: [125, "EUR"],
    fiscalyear_last_month: "12",
    fiscalyear_last_day: 31,
  };

  async searchRead<T = OdooRow>(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    options: { limit?: number; offset?: number; order?: string } = {},
  ): Promise<T[]> {
    this.searchReadCalls.push({ model, domain, fields, options });
    if (model === "res.company") return [this.company] as T[];
    return this.rows as T[];
  }

  async searchCount(): Promise<number> {
    return this.rows.length;
  }

  async read<T = OdooRow>(): Promise<T[]> {
    return [] as T[];
  }

  async readGroup<T = ReadGroupRow>(model: string, spec: ReadGroupSpec): Promise<T[]> {
    this.readGroupCalls.push({ model, spec });
    return this.groupRows as T[];
  }

  /** The last query issued against a model other than `res.company`. */
  lastSearchRead(): SearchReadCall {
    const call = this.searchReadCalls.filter((c) => c.model !== "res.company").at(-1);
    if (!call) throw new Error("no search_read was issued");
    return call;
  }

  lastReadGroup(): ReadGroupCall {
    const call = this.readGroupCalls.at(-1);
    if (!call) throw new Error("no read_group was issued");
    return call;
  }
}

/** Odoo domains are positional triples, so reading them needs a little help. */
export function clauses(domain: readonly unknown[]): [string, string, unknown][] {
  return domain.filter(
    (clause): clause is [string, string, unknown] =>
      Array.isArray(clause) && clause.length === 3 && typeof clause[0] === "string",
  );
}

export function findClause(
  domain: readonly unknown[],
  field: string,
  operator?: string,
): [string, string, unknown] | undefined {
  return clauses(domain).find(
    ([name, op]) => name === field && (operator === undefined || op === operator),
  );
}

export function hasClause(domain: readonly unknown[], field: string, operator?: string): boolean {
  return findClause(domain, field, operator) !== undefined;
}
