import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import type { MonthlyBook } from "../../../domain/model/MonthlyBook.js";

/**
 * The client's books for one month (docs/architecture_phase1.md §6).
 *
 * **One method, and read-only by construction** — no `create`, no `update`, no
 * `postJournalEntry`. The promise that Tamoa never writes to the ledger is
 * enforced here as a vocabulary, backed by a read-only Odoo service user.
 *
 * The port is deliberately coarse. Whether a book costs one round trip or
 * fifteen is a fact about Odoo, and facts about Odoo live in the Odoo adapter —
 * so concurrency, timeouts and partial failure never leak into `application/`.
 */
export interface AccountingRepository {
  getMonthlyBook(clientId: ClientId, month: Month): Promise<MonthlyBook>;
}
