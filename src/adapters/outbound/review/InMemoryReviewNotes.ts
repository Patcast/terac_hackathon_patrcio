import type { ReviewNotes } from "../../../application/ports/driven/ReviewNotes.js";
import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import type { ReviewNote } from "../../../domain/model/ReviewNote.js";

/**
 * Expert notes, in a `Map`. They do not survive a restart.
 *
 * That is the right trade for Phase 1 and it should be a deliberate one: the
 * before → after is recorded minutes before it is shown, in the same process,
 * during a two-minute demo. A database here would be a schema, a migration and a
 * connection string bought for a value with a ten-minute lifetime.
 *
 * The port is async, so swapping this for a real store is a one-line change in
 * the composition root and nothing else moves.
 */
export class InMemoryReviewNotes implements ReviewNotes {
  private readonly notes = new Map<string, ReviewNote>();

  async find(clientId: ClientId, month: Month): Promise<ReviewNote | null> {
    return this.notes.get(key(clientId, month)) ?? null;
  }

  /** Last write wins: a second pass over the same month is a correction, not a duplicate. */
  async record(note: ReviewNote): Promise<void> {
    this.notes.set(key(note.clientId, note.month), note);
  }
}

function key(clientId: ClientId, month: Month): string {
  return `${clientId.value}:${month.key()}`;
}
