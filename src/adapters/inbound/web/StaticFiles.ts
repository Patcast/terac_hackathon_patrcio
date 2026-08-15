import { readFile } from "node:fs/promises";
import { join, normalize, resolve, sep } from "node:path";

export interface StaticAsset {
  body: Buffer;
  contentType: string;
  /** Seconds. The shell is versionless, so it must never be held by a browser. */
  maxAge: number;
}

/**
 * Extensions the brief actually ships. An allow-list rather than a lookup with a
 * default, so a stray `.env` or `.ts` in the web root is a 404 and not a
 * download — the mime table is the second half of the traversal guard.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/** Unversioned and hand-edited — see `maxAge` below. */
const SOURCE_EXTENSIONS = new Set([".html", ".css", ".js"]);

/**
 * Serves the brief's HTML, CSS and JS off disk.
 *
 * No bundler, no build step, no `node_modules` in the browser: three files that
 * a browser can load directly are three files that cannot break on the morning
 * of the demo because a transitive dependency shipped a major version. It also
 * means the page you debug is byte-for-byte the page that is served.
 */
export class StaticFiles {
  private readonly root: string;

  constructor(root: string) {
    // Resolved once so every later comparison is between two absolute paths.
    this.root = resolve(root);
  }

  /**
   * The asset for a URL path, or null if there isn't one.
   *
   * `..` is rejected by comparing the resolved path against the resolved root
   * rather than by scrubbing the input, because every scrubbing scheme has an
   * encoding that beats it and this comparison has none.
   */
  async read(urlPath: string): Promise<StaticAsset | null> {
    const requested = decodeSafely(urlPath);
    if (requested === null) return null;

    const relative = normalize(requested === "/" ? "/index.html" : requested).replace(/^[/\\]+/, "");
    const absolute = resolve(join(this.root, relative));
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) return null;

    const extension = absolute.slice(absolute.lastIndexOf("."));
    const contentType = CONTENT_TYPES[extension];
    if (contentType === undefined) return null;

    try {
      return {
        body: await readFile(absolute),
        contentType,
        // The three source files are never cached. They carry no version in
        // their names, so a browser holding yesterday's `app.js` is a bug you
        // debug by reading code that is not the code running — and the whole
        // page is a few kilobytes served from the same machine.
        maxAge: SOURCE_EXTENSIONS.has(extension) ? 0 : 300,
      };
    } catch {
      return null;
    }
  }
}

/** A malformed percent-escape is a 404, not a 500. */
function decodeSafely(urlPath: string): string | null {
  try {
    const decoded = decodeURIComponent(urlPath);
    return decoded.includes("\0") ? null : decoded;
  } catch {
    return null;
  }
}
