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
export class OdooJsonApiClient {
  private constructor(private readonly config: OdooConfig) {}

  static fromEnv(config: OdooConfig = odooConfig()): OdooJsonApiClient {
    return new OdooJsonApiClient(config);
  }

  private async call<T>(
    model: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await fetch(`${this.config.url}/json/2/${model}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new OdooApiError(response.status, model, method, text);
    }

    return (text ? JSON.parse(text) : null) as T;
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

  async read<T = Record<string, unknown>>(
    model: string,
    ids: number[],
    fields: string[] = [],
  ): Promise<T[]> {
    return this.call<T[]>(model, "read", { ids, fields });
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
