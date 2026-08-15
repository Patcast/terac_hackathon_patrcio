import { describe, expect, it } from "vitest";
import { ClaudeClient } from "../src/adapters/outbound/claude/ClaudeClient.js";
import { LinqClient } from "../src/adapters/outbound/linq/LinqClient.js";
import { OdooJsonApiClient } from "../src/adapters/outbound/odoo/OdooJsonApiClient.js";
import type { ConnectivityResult } from "../src/adapters/outbound/connectivity.js";

/**
 * Live credential check — this suite talks to the real vendors.
 *
 * It is a contract test in the sense of docs/architecture.md §11: slow, few, and
 * the vendor is the test. It answers one question per service: are the
 * credentials in `.env` real and usable? It asserts nothing about business
 * behaviour, and it never sends a message or writes to the ledger.
 *
 * Run with: npm test
 */

const TIMEOUT_MS = 60_000;

function report(result: ConnectivityResult): void {
  const mark = result.ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${result.service}: ${result.detail}`);
}

describe("vendor connectivity", () => {
  it(
    "Claude — API key is valid and authorised for claude-opus-5",
    async () => {
      const result = await ClaudeClient.fromEnv().checkConnectivity();
      report(result);
      expect(result.ok, result.detail).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    "Linq — bearer token works and owns LINQ_PHONE_NUMBER",
    async () => {
      const result = await LinqClient.fromEnv().checkConnectivity();
      report(result);
      expect(result.ok, result.detail).toBe(true);
    },
    TIMEOUT_MS,
  );

  it(
    "Odoo — API key authenticates and the ledger is readable",
    async () => {
      const result = await OdooJsonApiClient.fromEnv().checkConnectivity();
      report(result);
      expect(result.ok, result.detail).toBe(true);
    },
    TIMEOUT_MS,
  );
});
