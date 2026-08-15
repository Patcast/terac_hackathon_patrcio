import { ClientId } from "./Ids.js";
import { Month } from "./Month.js";

/**
 * A human expert's pass over one month's brief — the "after" in the before →
 * after the hackathon requires (docs/product_demo.md).
 *
 * Both halves are stored, not just the correction, because the improvement *is*
 * the pair: an updated recommendation on its own is indistinguishable from the
 * agent having been right the first time, and the whole claim being made is that
 * human input changed something.
 *
 * `before` is the agent's own take, captured when the note is recorded rather
 * than regenerated later — a take re-derived after the fact would drift with the
 * model and quietly turn the comparison into fiction.
 */
export class ReviewNote {
  constructor(
    readonly clientId: ClientId,
    readonly month: Month,
    /** The agent's recommendation as it stood before a human read it. */
    readonly before: string,
    /** What the expert changed it to, in their words. */
    readonly after: string,
    /** Who reviewed it — a name a client can be told, not a user id. */
    readonly author: string,
    readonly recordedAt: Date,
  ) {}
}
