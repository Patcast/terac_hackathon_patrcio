import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { StaticFiles } from "../../../../src/adapters/inbound/web/StaticFiles.js";

/**
 * The traversal guard is the whole reason this class exists rather than a
 * `readFile` in the server. `.env` sits one directory above the web root on
 * every deployment, so "can a URL reach a parent directory" is not a theoretical
 * question here.
 */
describe("StaticFiles", () => {
  let root: string;
  let files: StaticFiles;

  beforeAll(async () => {
    const base = await mkdtemp(join(tmpdir(), "tamoa-static-"));
    root = join(base, "web");
    await mkdir(root);
    await writeFile(join(root, "index.html"), "<h1>brief</h1>");
    await writeFile(join(root, "app.js"), "export {};");
    await writeFile(join(root, "notes.txt"), "not served");
    // The neighbour a traversal would be reaching for.
    await writeFile(join(base, "secrets.html"), "ANTHROPIC_API_KEY=sk-live");
    files = new StaticFiles(root);
  });

  it("serves the shell at the root path", async () => {
    const asset = await files.read("/");
    expect(asset?.body.toString()).toBe("<h1>brief</h1>");
    expect(asset?.contentType).toBe("text/html; charset=utf-8");
  });

  it("never lets a source file be cached", async () => {
    expect((await files.read("/app.js"))?.maxAge).toBe(0);
    expect((await files.read("/index.html"))?.maxAge).toBe(0);
  });

  it.each([
    ["/../secrets.html", "a plain parent hop"],
    ["/..%2fsecrets.html", "a percent-encoded slash"],
    ["/%2e%2e/secrets.html", "percent-encoded dots"],
    ["/a/../../secrets.html", "a hop back out through a subdirectory"],
  ])("refuses %s (%s)", async (path) => {
    expect(await files.read(path)).toBeNull();
  });

  it("refuses an extension it does not ship, even when the file exists", async () => {
    expect(await files.read("/notes.txt")).toBeNull();
  });

  it("returns null rather than throwing on a malformed escape", async () => {
    expect(await files.read("/%E0%A4%A")).toBeNull();
  });

  it("returns null for a file that isn't there", async () => {
    expect(await files.read("/missing.css")).toBeNull();
  });
});
