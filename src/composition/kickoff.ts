import { Month } from "../domain/model/Month.js";
import { buildContainer, type Container } from "./container.js";
import { isEntrypoint } from "./entrypoint.js";

/**
 * The monthly close-out — the one outbound trigger (docs/architecture_phase1.md
 * §0, and beat 1 of docs/imessage_flow_phase1.md).
 *
 * **This is not a second flow.** It calls the same `AnswerMonthlyQuestion` with
 * the same book and the same presenter as an inbound question does; only the
 * entry point differs. If this file ever starts deciding *what to say* or
 * formatting its own message, it has become a second flow — and that's the bug.
 */

/**
 * The canned question. It is phrased the way an owner would ask it because the
 * system prompt and the book are what shape the answer — nothing here does.
 */
export const CLOSE_OUT_QUESTION =
  "The books for this month have settled. Give me my monthly close-out: revenue and how it " +
  "compares with last month, net, cash at month end, runway at the last three months' burn, " +
  "and the one thing in these books most worth watching. Close by offering to dig into costs, " +
  "who still owes money, or tax.";

export interface KickoffOutcome {
  clientId: string;
  month: string;
  sent: boolean;
  detail: string;
}

/**
 * Sends the close-out to every client whose books have settled for `month`.
 * Returns one line per client rather than throwing, so one client's broken Odoo
 * connection doesn't cancel everyone else's month.
 */
export async function runKickoff(
  container: Container,
  month?: Month,
): Promise<KickoffOutcome[]> {
  const { answer, channel, presenter, clients, clock, config } = container;
  const now = clock.now();
  const target = month ?? Month.lastClosed(now, config.settlingDays);
  const outcomes: KickoffOutcome[] = [];

  for (const client of clients.all()) {
    try {
      const result = await answer.execute({
        clientId: client.id,
        question: CLOSE_OUT_QUESTION,
        month: target,
      });
      const view = presenter.present(result);
      await channel.sendText(client.phone, view.text);
      outcomes.push({
        clientId: client.id.value,
        month: target.label(),
        sent: true,
        detail: `${result.documentCount} documents, ${result.gaps.length} gap(s)`,
      });
    } catch (error) {
      outcomes.push({
        clientId: client.id.value,
        month: target.label(),
        sent: false,
        detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }

  return outcomes;
}

/**
 * `node --experimental-strip-types src/composition/kickoff.ts [2026-07]`
 * — cron invokes this, and so does a human rehearsing the demo.
 */
async function main(): Promise<void> {
  const container = buildContainer();
  const requested = process.argv[2];
  const month = requested ? Month.require(requested, container.clock.now()) : undefined;

  for (const outcome of await runKickoff(container, month)) {
    const status = outcome.sent ? "SENT" : "FAILED";
    console.log(`${status}  ${outcome.clientId}  ${outcome.month}  ${outcome.detail}`);
  }
}

if (isEntrypoint(import.meta.url)) await main();
