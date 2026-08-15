import { linqConfig, type LinqConfig } from "../../../config/env.js";
import { failed, ok, type ConnectivityResult } from "../connectivity.js";

const SERVICE = "Linq";

export class LinqApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(`${method} ${path} -> ${status}: ${body.slice(0, 400)}`);
    this.name = "LinqApiError";
  }
}

/** A phone number owned by the Linq account. Only the fields we rely on. */
export interface LinqPhoneNumber {
  phone_number?: string;
  number?: string;
  [key: string]: unknown;
}

/**
 * HTTP client for the Linq partner API v3 — messaging today, payment requests
 * later (docs/architecture.md §9). Vendor payload shapes stop at this file;
 * mapping them into domain types is `LinqMapper`'s job, not this one's.
 */
export class LinqClient {
  private constructor(private readonly config: LinqConfig) {}

  static fromEnv(config: LinqConfig = linqConfig()): LinqClient {
    return new LinqClient(config);
  }

  /** The number the agent owns — the one clients save as "Tammy". */
  get phoneNumber(): string {
    return this.config.phoneNumber;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new LinqApiError(response.status, method, path, text);
    }

    return (text ? JSON.parse(text) : {}) as T;
  }

  /** `GET /phone_numbers` — read-only, and the basis of the connectivity check. */
  async listPhoneNumbers(): Promise<LinqPhoneNumber[]> {
    const payload = await this.request<unknown>("GET", "/phone_numbers");
    return extractList(payload);
  }

  /**
   * `POST /chats` — start a chat and deliver the first message.
   * Not exercised by the connectivity check: it would text a real handset.
   */
  async sendText(to: string, text: string): Promise<unknown> {
    return this.request("POST", "/chats", {
      from: this.config.phoneNumber,
      to: [to],
      message: { parts: [{ type: "text", value: text }] },
    });
  }

  /**
   * Proves the bearer token is accepted and that `LINQ_PHONE_NUMBER` is a number
   * this account actually owns — a mismatch there fails at send time, not here,
   * which is a bad way to find out during a demo.
   */
  async checkConnectivity(): Promise<ConnectivityResult> {
    try {
      const numbers = await this.listPhoneNumbers();
      const owned = numbers
        .map((entry) => entry.phone_number ?? entry.number)
        .filter((value): value is string => typeof value === "string");

      const configured = normalizeNumber(this.config.phoneNumber);
      const matches = owned.some((value) => normalizeNumber(value) === configured);

      const summary =
        `token accepted; ${numbers.length} phone number(s) on the account` +
        (owned.length > 0 ? ` [${owned.join(", ")}]` : "");

      if (!matches) {
        return failed(
          SERVICE,
          new Error(
            `${summary} — but LINQ_PHONE_NUMBER (${this.config.phoneNumber}) is not among them`,
          ),
        );
      }

      return ok(SERVICE, `${summary}; LINQ_PHONE_NUMBER matches`);
    } catch (error) {
      return failed(SERVICE, error);
    }
  }
}

/** Linq wraps collections inconsistently across endpoints; accept either shape. */
function extractList(payload: unknown): LinqPhoneNumber[] {
  if (Array.isArray(payload)) return payload as LinqPhoneNumber[];
  if (payload && typeof payload === "object") {
    for (const key of ["data", "phone_numbers", "results"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as LinqPhoneNumber[];
    }
  }
  return [];
}

function normalizeNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}
