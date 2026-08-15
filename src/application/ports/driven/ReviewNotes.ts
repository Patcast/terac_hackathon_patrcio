import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import type { ReviewNote } from "../../../domain/model/ReviewNote.js";

/**
 * Where an expert's before → after for a month is kept.
 *
 * The **only** write port in the system, and it writes to us rather than to a
 * client's ledger — the read-only promise about Odoo is untouched
 * (docs/product_demo.md: "writing back to Odoo — read-only forever").
 *
 * A month with no note returns null, and every surface renders that as "not
 * reviewed yet". Nothing anywhere may substitute the agent's own take for a
 * missing expert one: an unreviewed brief claiming review is the single most
 * damaging thing this product could do.
 */
export interface ReviewNotes {
  find(clientId: ClientId, month: Month): Promise<ReviewNote | null>;
  record(note: ReviewNote): Promise<void>;
}
