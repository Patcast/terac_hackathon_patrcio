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

/**
 * The Phase 1 knobs (docs/architecture_phase1.md §13). None are secrets and all
 * have defaults, so a missing `.env` still boots — unlike the vendor configs
 * above, which fail loudly rather than pretend.
 *
 * `settlingDays` is the one to think about rather than copy: it decides which
 * month Tammy talks about by default, so it is a product setting wearing a
 * config variable's clothes.
 */
export interface Phase1Config {
  settlingDays: number;
  trailingMonths: number;
  runwayWindowMonths: number;
  reportConcurrency: number;
  reportTimeoutMs: number;
  bookCacheEnabled: boolean;
  useFixtures: boolean;
  clientRegistryJson: string | null;
  /**
   * The two links the brief's call-to-action block offers, and the price beside
   * them (docs/imessage_flow.md beats 10 and 11).
   *
   * Null rather than a placeholder URL: an unconfigured booking button renders
   * as visibly unavailable, where a `https://cal.com/example` default would
   * render as a working one and 404 on stage.
   */
  bookingUrl: string | null;
  paymentUrl: string | null;
  sessionPrice: string | null;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function boolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function phase1Config(): Phase1Config {
  return {
    settlingDays: number("SETTLING_DAYS", 10),
    trailingMonths: number("TRAILING_MONTHS", 12),
    runwayWindowMonths: number("RUNWAY_WINDOW_MONTHS", 3),
    reportConcurrency: number("REPORT_CONCURRENCY", 6),
    reportTimeoutMs: number("REPORT_TIMEOUT_MS", 8_000),
    bookCacheEnabled: boolean("BOOK_CACHE_ENABLED", true),
    useFixtures: boolean("USE_FIXTURES", false),
    clientRegistryJson: process.env["CLIENT_REGISTRY_JSON"]?.trim() || null,
    bookingUrl: process.env["BOOKING_URL"]?.trim() || null,
    paymentUrl: process.env["PAYMENT_URL"]?.trim() || null,
    sessionPrice: process.env["SESSION_PRICE"]?.trim() || null,
  };
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
