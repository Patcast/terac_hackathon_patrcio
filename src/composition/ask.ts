import { Month } from "../domain/model/Month.js";
import { failureMessageFor } from "../presentation/FailureMessages.js";
import { buildContainer } from "./container.js";
import { isEntrypoint } from "./entrypoint.js";

/**
 * The rehearsal path: ask Tammy a question and read the reply in the terminal
 * instead of texting it.
 *
 * Same use case, same book, same presenter as the webhook — it just stops one
 * step short of `ConversationChannel`. That makes it the cheapest way to check
 * the whole stack (Odoo or fixtures → book → Claude → footer) without sending a
 * real message to a real handset, which is not something to discover the shape
 * of during a demo.
 *
 *   npm run ask -- "What was my biggest cost in July?"
 *   USE_FIXTURES=true npm run ask -- "Who still hasn't paid me?" 2026-07
 */
async function main(): Promise<void> {
  const container = buildContainer();
  const question = process.argv[2];
  const monthArg = process.argv[3];

  if (!question) {
    console.error('usage: npm run ask -- "<question>" [2026-07]');
    process.exitCode = 1;
    return;
  }

  const client = container.clients.all()[0];
  if (!client) {
    console.error("no clients registered — set CLIENT_REGISTRY_JSON, see .env.example");
    process.exitCode = 1;
    return;
  }

  const now = container.clock.now();
  // The same resolution order the inbound adapter uses: an explicit argument,
  // then a month named in the question, then the last settled month.
  const month =
    (monthArg ? Month.parse(monthArg, now) : null) ??
    Month.parse(question, now) ??
    Month.lastClosed(now, container.config.settlingDays);

  const started = Date.now();
  console.log(`\n${client.businessName} · ${month.label()}\n`);

  try {
    const result = await container.answer.execute({ clientId: client.id, question, month });
    console.log(container.presenter.present(result).text);
  } catch (error) {
    // Print what the client would actually receive, not a stack trace — the
    // failure copy is part of the product and worth rehearsing too.
    console.log(failureMessageFor(error));
    console.error(`\n[${error instanceof Error ? error.message : String(error)}]`);
    process.exitCode = 1;
  }

  console.log(`\n(${Date.now() - started}ms)\n`);
}

if (isEntrypoint(import.meta.url)) await main();
