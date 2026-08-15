import { config as loadDotenv } from "dotenv";

loadDotenv();

/**
 * Thrown when a vendor's credentials are absent from the environment.
 * Kept distinct from a network/auth failure so the connectivity check can tell
 * "you never set this" apart from "you set it and it was rejected".
 */
export class MissingCredentialsError extends Error {
  constructor(
    readonly service: string,
    readonly missing: readonly string[],
  ) {
    super(`${service}: missing environment variable(s): ${missing.join(", ")}`);
    this.name = "MissingCredentialsError";
  }
}

/**
 * Reads every named variable up front so one failure reports *all* the missing
 * ones, then hands back a lookup that is guaranteed non-empty.
 */
function read(service: string, names: readonly string[]): (name: string) => string {
  const values = new Map<string, string>();
  const missing: string[] = [];

  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) values.set(name, value);
    else missing.push(name);
  }

  if (missing.length > 0) throw new MissingCredentialsError(service, missing);

  return (name) => {
    const value = values.get(name);
    if (value === undefined) throw new MissingCredentialsError(service, [name]);
    return value;
  };
}

export interface ClaudeConfig {
  apiKey: string;
}

export interface LinqConfig {
  apiKey: string;
  phoneNumber: string;
  baseUrl: string;
}

/**
 * Odoo 19's JSON-2 API resolves the database from the hostname and the user
 * from the bearer key, so `ODOO_DB` and `ODOO_USERNAME` are no longer needed.
 * They remain in `.env` for reference but nothing reads them.
 */
export interface OdooConfig {
  url: string;
  apiKey: string;
}

export function claudeConfig(): ClaudeConfig {
  const env = read("Claude", ["ANTHROPIC_API_KEY"]);
  return { apiKey: env("ANTHROPIC_API_KEY") };
}

export function linqConfig(): LinqConfig {
  const env = read("Linq", ["LINQ_API_KEY", "LINQ_PHONE_NUMBER"]);
  return {
    apiKey: env("LINQ_API_KEY"),
    phoneNumber: env("LINQ_PHONE_NUMBER"),
    // Overridable so a sandbox host can be swapped without touching the adapter.
    baseUrl: (
      process.env.LINQ_API_BASE_URL?.trim() ||
      "https://api.linqapp.com/api/partner/v3"
    ).replace(/\/+$/, ""),
  };
}

export function odooConfig(): OdooConfig {
  const env = read("Odoo", ["ODOO_URL", "ODOO_API_KEY"]);
  return {
    url: env("ODOO_URL").replace(/\/+$/, ""),
    apiKey: env("ODOO_API_KEY"),
  };
}
