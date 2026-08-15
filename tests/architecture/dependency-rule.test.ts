import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The one rule, enforced (docs/architecture_phase1.md §1):
 *
 * > Business logic depends on nothing. Everything depends on business logic.
 *
 * The doc suggests an ESLint `no-restricted-imports` guard. This is the same
 * check without adding a linter to the toolchain — it runs in the same suite as
 * everything else, and it is what stops `@anthropic-ai/*` drifting into
 * `domain/` on hour 30 of a hackathon.
 */

const SRC = new URL("../../src/", import.meta.url).pathname;

function sources(dir: string): string[] {
  const entries = readdirSync(join(SRC, dir));
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    if (statSync(join(SRC, path)).isDirectory()) files.push(...sources(path));
    else if (entry.endsWith(".ts")) files.push(path);
  }
  return files;
}

/**
 * Every module specifier a file imports, `import` and `export … from` alike.
 *
 * Comments are stripped first: these files talk about their own dependencies in
 * prose, and a bare `from "…"` search happily flags a sentence.
 */
function importsOf(file: string): string[] {
  const text = readFileSync(join(SRC, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  return [...text.matchAll(/^\s*(?:import|export)\b[^;]*?from\s*["']([^"']+)["']/gm)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

function ringOf(file: string): string {
  return file.split("/")[0] ?? "";
}

/** Resolves a relative specifier back to a `src/`-relative ring name. */
function targetRing(file: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const from = file.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === ".") continue;
    else if (segment === "..") from.pop();
    else from.push(segment);
  }
  return from[0] ?? null;
}

describe("the dependency rule", () => {
  it("keeps domain/ free of every dependency", () => {
    const offences: string[] = [];
    for (const file of sources("domain")) {
      for (const specifier of importsOf(file)) {
        const ring = targetRing(file, specifier);
        const isDomainRelative = ring === "domain";
        const isBare = !specifier.startsWith(".");
        if (isBare || !isDomainRelative) offences.push(`${file} → ${specifier}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("keeps application/ on domain and itself — no vendors, no adapters", () => {
    const offences: string[] = [];
    for (const file of sources("application")) {
      for (const specifier of importsOf(file)) {
        const ring = targetRing(file, specifier);
        if (ring === null) offences.push(`${file} → ${specifier} (package import)`);
        else if (ring !== "domain" && ring !== "application") {
          offences.push(`${file} → ${specifier}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("keeps presentation/ off vendor SDKs and adapters", () => {
    const allowed = new Set(["domain", "application", "presentation"]);
    const offences: string[] = [];
    for (const file of sources("presentation")) {
      for (const specifier of importsOf(file)) {
        const ring = targetRing(file, specifier);
        if (ring === null || !allowed.has(ring)) offences.push(`${file} → ${specifier}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it("keeps the assembler vendor-neutral — it must not know Odoo exists", () => {
    const offences: string[] = [];
    for (const file of sources("adapters/outbound/accounting")) {
      for (const specifier of importsOf(file)) {
        if (specifier.includes("odoo") || specifier.includes("claude") || specifier.includes("linq")) {
          offences.push(`${file} → ${specifier}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("lets only composition/ construct the outside world", () => {
    // A vendor SDK import anywhere but its own adapter (or composition) means a
    // detail has leaked inward.
    const offences: string[] = [];
    for (const file of sources("")) {
      const ring = ringOf(file);
      if (ring === "composition" || ring === "config") continue;
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith("@anthropic-ai/") && !file.includes("outbound/claude")) {
          offences.push(`${file} → ${specifier}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
