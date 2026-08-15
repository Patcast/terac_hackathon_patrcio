import { odooConfig, type OdooConfig } from "../../../config/env.js";
import { failed, ok, type ConnectivityResult } from "../connectivity.js";

const SERVICE = "Odoo";

export class OdooApiError extends Error {
  constructor(
    readonly status: number,
    readonly model: string,
    readonly method: string,
    readonly body: string,
  ) {
    super(`${model}.${method} -> HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "OdooApiError";
  }
}

/** A raw Odoo record: `snake_case` keys, `[id, name]` tuples, `false` for unset. */
export type OdooRow = Record<string, unknown>;

/**
 * One `read_group` bucket. Alongside the groupby keys and the aggregates it
 * carries `__count`, `__domain` and — for date groupings — `__range`, which is
 * the only trustworthy way to know *which* month a row is (docs §4: the
 * `date:month` label is localised).
 */
export type ReadGroupRow = OdooRow;

export interface ReadGroupSpec {
  domain?: unknown[];
  fields: string[];
  groupby: string[];
  limit?: number;
  orderby?: string;
}

/**
 * The read surface the reports are allowed to see.
 *
 * Depending on the interface rather than the class is what makes a report
 * testable without a live instance, and it re-states the read-only promise in
 * the type system: there is no `create`, `write` or `unlink` to call.
 */
export interface OdooReads {
  searchRead<T = OdooRow>(
    model: string,
    domain?: unknown[],
    fields?: string[],
    options?: { limit?: number; offset?: number; order?: string },
  ): Promise<T[]>;
  searchCount(model: string, domain?: unknown[]): Promise<number>;
  read<T = OdooRow>(model: string, ids: number[], fields?: string[]): Promise<T[]>;
  readGroup<T = ReadGroupRow>(model: string, spec: ReadGroupSpec): Promise<T[]>;
}

/**
 * Odoo 19's JSON-2 API — `POST /json/2/<model>/<method>` with a bearer API key.
 *
 * **Why not XML-RPC**, which docs/tech_stack.md §5 specifies: on this Odoo 19
 * Online instance `/xmlrpc/2/common.authenticate` rejects a valid API key with
 * `AccessDenied`, while the same key works on JSON-2. XML-RPC and JSON-RPC are
 * also both slated for removal in Odoo 20, so JSON-2 is the forward-compatible
 * path rather than a workaround.
 *
 * The bearer key identifies both the database (resolved from the hostname) and
 * the user, so no db name, login, or separate authenticate round-trip is needed.
 *
 * **Read-only by construction.** `call()` is private and only read methods are
 * exposed — there is deliberately no way to reach `create`/`write`/`unlink`
 * from here, backing the promise in docs/architecture.md §6.
 */
/** Two retries: enough for a rate-limit blip, small enough to fit the 8s report timeout. */
const MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OdooJsonApiClient implements OdooReads {
  private constructor(private readonly config: OdooConfig) {}

  static fromEnv(config: OdooConfig = odooConfig()): OdooJsonApiClient {
    return new OdooJsonApiClient(config);
  }

  private async call<T>(
    model: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(`${this.config.url}/json/2/${model}/${method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      const text = await response.text();
      if (response.ok) return (text ? JSON.parse(text) : null) as T;

      const wait = this.retryDelayMs(response, attempt);
      if (wait === null) throw new OdooApiError(response.status, model, method, text);
      await sleep(wait);
    }
  }

  /**
   * How long to wait before trying again, or null when the answer won't change.
   *
   * **Odoo Online rate-limits, and the assembler's six-in-flight fan-out is
   * exactly what trips it** (docs/architecture_phase1.md §7 predicted the worker
   * pool; this is what finding it looks like). A 429 is a "come back in a
   * moment", not a missing report, and swallowing it as a `BookGap` would put
   * "I couldn't read your receivables" in front of a client over a hiccup.
   *
   * Retries stay small on purpose: the per-report timeout is 8s, so a budget
   * bigger than this would turn a rate limit into a timeout — the same gap by a
   * slower route. 5xx gets the same treatment; 4xx other than 429 does not,
   * because a bad domain or a missing field will fail identically forever.
   */
  private retryDelayMs(response: Response, attempt: number): number | null {
    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt >= MAX_RETRIES) return null;

    const header = Number(response.headers.get("retry-after"));
    if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 4_000);

    // 300ms, 900ms — plus jitter, so fifteen reports rejected together don't
    // come back in the same instant and trip the limit a second time.
    return 300 * 3 ** attempt + Math.random() * 200;
  }

  /** The uid and context the API key resolves to. */
  async contextGet(): Promise<{ uid: number; lang?: string; tz?: string }> {
    return this.call("res.users", "context_get");
  }

  async searchRead<T = Record<string, unknown>>(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    options: { limit?: number; offset?: number; order?: string } = {},
  ): Promise<T[]> {
    return this.call<T[]>(model, "search_read", { domain, fields, ...options });
  }

  async searchCount(model: string, domain: unknown[] = []): Promise<number> {
    return this.call<number>(model, "search_count", { domain });
  }

  async read<T = OdooRow>(model: string, ids: number[], fields: string[] = []): Promise<T[]> {
    return this.call<T[]>(model, "read", { ids, fields });
  }

  /**
   * Server-side aggregation — how the nine line-level reports read a month of
   * `account.move.line` as tens of rows instead of thousands (docs §4 B).
   *
   * **`lazy` is forced to `false`.** Odoo's default (`lazy: true`) groups by the
   * *first* key only and hides the rest behind `__domain`, so a
   * `["account_type", "date:month"]` request silently comes back as twelve-ish
   * account-type rows with no months in them — a wrong answer that looks right,
   * which is the whole category §4 warns about. Nothing here ever wants that.
   */
  async readGroup<T = ReadGroupRow>(model: string, spec: ReadGroupSpec): Promise<T[]> {
    const { domain = [], fields, groupby, limit, orderby } = spec;
    return this.call<T[]>(model, "read_group", {
      domain,
      fields,
      groupby,
      lazy: false,
      ...(limit === undefined ? {} : { limit }),
      ...(orderby === undefined ? {} : { orderby }),
    });
  }

  /**
   * Verifies, in order: the key authenticates, it resolves to a real user, and
   * the accounting models are actually readable — the docs/tech_stack.md §5
   * risk, which login success alone would not catch.
   */
  async checkConnectivity(): Promise<ConnectivityResult> {
    try {
      const { uid } = await this.contextGet();

      const users = await this.read<{ name?: string; login?: string }>(
        "res.users",
        [uid],
        ["name", "login"],
      );
      const user = users[0];

      const companies = await this.searchRead<{
        name?: string;
        currency_id?: [number, string];
      }>("res.company", [], ["name", "currency_id"], { limit: 1 });
      const company = companies[0];

      const invoiceCount = await this.searchCount("account.move", [
        ["move_type", "=", "out_invoice"],
      ]);

      return ok(
        SERVICE,
        `JSON-2 API as ${user?.name ?? "?"} <${user?.login ?? "?"}> (uid ${uid}); ` +
          `company ${company?.name ?? "?"} (${company?.currency_id?.[1] ?? "?"}); ` +
          `account.move readable (${invoiceCount} customer invoice(s))`,
      );
    } catch (error) {
      return failed(SERVICE, error);
    }
  }
}
