import { BookPart, PART_LABELS, Tier } from "./BookPart.js";

/**
 * One report that didn't come back.
 *
 * Note what this is *not*: a month that has ended but not settled is not a gap.
 * That book read fine and may still move — it is `MonthlyBook.settling`, a
 * boolean. A gap means **couldn't read**, and conflating the two would have the
 * footer apologise for data it actually has (docs/architecture_phase1.md §5).
 */
export class BookGap {
  private constructor(
    readonly part: BookPart,
    readonly tier: Tier,
    readonly reason: string,
  ) {}

  static from(part: BookPart, tier: Tier, error: unknown): BookGap {
    return new BookGap(part, tier, describe(error));
  }

  isFatal(): boolean {
    return this.tier === Tier.Required;
  }

  /** The client-facing words, not the part key — this is printed in the reply. */
  label(): string {
    return PART_LABELS[this.part];
  }

  toString(): string {
    return `${this.part}: ${this.reason}`;
  }
}

/**
 * The reason is diagnostic, never client-facing, so it keeps whatever the
 * adapter threw. `domain/` has no logger and no vendor types, so this flattens
 * to a string at the boundary rather than holding a live error object that would
 * make the book unserialisable to a fixture.
 */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string" && error.trim()) return error.trim();
  return "unknown error";
}
