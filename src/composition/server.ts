import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { LinqWebhookController } from "../adapters/inbound/linq/LinqWebhookController.js";
import { buildBriefContainer, buildContainer, type BriefContainer } from "./container.js";
import { isEntrypoint } from "./entrypoint.js";

/**
 * The HTTP edge. Node's own server, no framework — a dependency you don't take
 * is a dependency you don't upgrade.
 *
 * Nothing here decides anything. It reads a body, hands it to an inbound
 * adapter, and writes what comes back: `LinqWebhookController` owns what happens
 * to a message, `BriefController` owns what a brief says, and `StaticFiles` owns
 * what may be read off disk.
 */

const MAX_BODY_BYTES = 1_000_000;

/**
 * The webhook is optional so the brief can be served without Claude and Linq
 * credentials (see `buildBriefContainer`). Absent, `/webhooks/linq` answers 503
 * rather than 404 — the route exists, the messaging half just isn't configured,
 * and those are worth telling apart at 3am.
 */
export type ServerContainer = BriefContainer & { webhook?: LinqWebhookController };

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
    // The brief is a private URL shared with a client; keeping it out of search
    // results costs one header.
    "X-Robots-Tag": "noindex",
  });
  response.end(text);
}

export function createApp(container: ServerContainer) {
  const secret = process.env["LINQ_WEBHOOK_SECRET"]?.trim();

  return createServer((request, response) => {
    void (async () => {
      // A base is required to parse, and is then discarded — only the path and
      // the query survive, so the host it names is irrelevant.
      const url = new URL(request.url ?? "/", "http://brief.local");
      const path = url.pathname;
      const method = request.method ?? "GET";

      if (method === "GET" && path === "/health") {
        send(response, 200, {
          service: "tamoa",
          phase: 1,
          clients: container.clients.all().length,
          fixtures: container.config.useFixtures,
          messaging: container.webhook !== undefined,
        });
        return;
      }

      // --- the web brief (docs/ui_proposal.md) -------------------------------

      // Demo config, not book data — kept off the brief payload so the rule that
      // every figure on that page traces to a report stays literally true.
      if (method === "GET" && path === "/api/settings") {
        send(response, 200, {
          booking: container.config.bookingUrl,
          payment: container.config.paymentUrl,
          price: container.config.sessionPrice,
          fixtures: container.config.useFixtures,
          messaging: container.webhook !== undefined,
        });
        return;
      }

      if (method === "GET" && path === "/api/brief") {
        const { status, body } = await container.brief.brief(url.searchParams);
        send(response, status, body);
        return;
      }

      if (method === "POST" && path === "/api/brief/review") {
        let payload: unknown;
        try {
          payload = JSON.parse(await readBody(request));
        } catch {
          send(response, 400, { error: "body was not JSON" });
          return;
        }
        const { status, body } = await container.brief.recordReview(url.searchParams, payload);
        send(response, status, body);
        return;
      }

      // --- the thread --------------------------------------------------------

      if (method === "POST" && path.startsWith("/webhooks/linq")) {
        const webhook = container.webhook;
        if (webhook === undefined) {
          send(response, 503, { error: "messaging is not configured on this instance" });
          return;
        }

        // A shared secret when one is configured. Linq's signature scheme is
        // the Phase 1.5 upgrade; an unauthenticated webhook that can only make
        // us text our own registered clients is a small blast radius.
        if (secret && request.headers["x-linq-signature"] !== secret) {
          send(response, 401, { error: "bad signature" });
          return;
        }

        let payload: unknown;
        try {
          payload = JSON.parse(await readBody(request));
        } catch {
          send(response, 400, { error: "body was not JSON" });
          return;
        }

        // Answer the webhook immediately: assembling a book and asking Claude
        // takes seconds, and Linq retries anything it thinks timed out — which
        // would text the client the same answer twice.
        send(response, 200, { received: true });

        try {
          await webhook.handle(payload);
        } catch (error) {
          console.error("[webhook] unhandled:", error);
        }
        return;
      }

      // --- the page itself ---------------------------------------------------

      if (method === "GET" || method === "HEAD") {
        const asset = await container.web.read(path);
        if (asset !== null) {
          response.writeHead(200, {
            "Content-Type": asset.contentType,
            "Content-Length": asset.body.length,
            "Cache-Control": `max-age=${asset.maxAge}`,
            "X-Robots-Tag": "noindex",
          });
          response.end(method === "HEAD" ? undefined : asset.body);
          return;
        }
      }

      send(response, 404, { error: "not found" });
    })();
  });
}

/**
 * Boots the whole system, or — when the messaging credentials are absent — the
 * brief on its own.
 *
 * The fallback is loud on purpose. A silent one would let a typo'd
 * `ANTHROPIC_API_KEY` look like a working server right up until the moment a
 * client texts and nothing happens.
 */
function boot(): ServerContainer {
  try {
    return buildContainer();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[server] messaging is OFF — ${reason}`);
    console.warn("[server] serving the web brief only; the Linq webhook will answer 503.");
    return buildBriefContainer();
  }
}

async function main(): Promise<void> {
  const container = boot();
  const port = Number(process.env["PORT"] ?? 3000);

  createApp(container).listen(port, () => {
    console.log(`tamoa phase 1 listening on http://localhost:${port}`);
    console.log(`  brief:    http://localhost:${port}/`);
    console.log(`  clients:  ${container.clients.all().length}`);
    console.log(`  ledger:   ${container.config.useFixtures ? "fixtures" : "odoo"}`);
    console.log(`  settling: ${container.config.settlingDays} days`);
  });
}

if (isEntrypoint(import.meta.url)) await main();
