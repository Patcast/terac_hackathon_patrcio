import { afterEach, describe, expect, it, vi } from "vitest";
import { OdooJsonApiClient } from "../../../src/adapters/outbound/odoo/OdooJsonApiClient.js";

const client = OdooJsonApiClient.fromEnv({ url: "https://example.invalid", apiKey: "test-key" });

function captureFetch(response: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return { ok: true, text: async () => JSON.stringify(response) };
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("OdooJsonApiClient.readGroup", () => {
  it("forces lazy:false so a two-key groupby actually groups by two keys", async () => {
    // Odoo's default groups by the *first* key only and hides the rest behind
    // `__domain`, so `["account_type", "date:month"]` comes back with no months
    // in it — a wrong answer that looks right (docs §4).
    const calls = captureFetch([]);
    await client.readGroup("account.move.line", {
      domain: [["parent_state", "=", "posted"]],
      fields: ["balance:sum"],
      groupby: ["account_type", "date:month"],
    });

    expect(calls[0]?.url).toBe("https://example.invalid/json/2/account.move.line/read_group");
    expect(calls[0]?.body["lazy"]).toBe(false);
    expect(calls[0]?.body["groupby"]).toEqual(["account_type", "date:month"]);
  });

  it("omits limit and orderby rather than sending undefined", async () => {
    const calls = captureFetch([]);
    await client.readGroup("account.move.line", { fields: ["balance:sum"], groupby: ["partner_id"] });

    expect(Object.keys(calls[0]?.body ?? {})).toEqual(["domain", "fields", "groupby", "lazy"]);
  });
});

/** Replies with `statuses` in order, then 200s forever. */
function flakyFetch(statuses: number[], headers: Record<string, string> = {}) {
  let attempt = 0;
  const seen: number[] = [];
  vi.stubGlobal("fetch", async () => {
    const status = statuses[attempt] ?? 200;
    seen.push(status);
    attempt += 1;
    return {
      ok: status === 200,
      status,
      headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
      text: async () => (status === 200 ? "[]" : "<html>Rate limit exceeded</html>"),
    };
  });
  return seen;
}

describe("OdooJsonApiClient rate limiting", () => {
  it("retries a 429 rather than reporting it as a missing report", async () => {
    // Odoo Online rate-limits the assembler's six-in-flight fan-out. A 429 is
    // "come back in a moment", and turning it into a BookGap would tell a client
    // we couldn't read their receivables over a hiccup.
    const seen = flakyFetch([429, 429]);
    await expect(client.searchCount("account.move")).resolves.toEqual([]);
    expect(seen).toEqual([429, 429, 200]);
  });

  it("gives up after the retry budget rather than outliving the report timeout", async () => {
    const seen = flakyFetch([429, 429, 429, 429]);
    await expect(client.searchCount("account.move")).rejects.toThrow("HTTP 429");
    expect(seen).toEqual([429, 429, 429]);
  });

  it("does not retry a 4xx that will fail identically forever", async () => {
    const seen = flakyFetch([403]);
    await expect(client.searchCount("account.move")).rejects.toThrow("HTTP 403");
    expect(seen).toEqual([403]);
  });

  it("honours Retry-After when the server sends one", async () => {
    const started = Date.now();
    flakyFetch([429], { "retry-after": "1" });
    await client.searchCount("account.move");
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });
});
