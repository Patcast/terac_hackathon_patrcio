import type { BuildMonthlyReport } from "../../../application/usecases/BuildMonthlyReport.js";
import type { Clock } from "../../../application/ports/driven/Clock.js";
import type { ReviewNotes } from "../../../application/ports/driven/ReviewNotes.js";
import { ClientId } from "../../../domain/model/Ids.js";
import { Month } from "../../../domain/model/Month.js";
import { ReviewNote } from "../../../domain/model/ReviewNote.js";
import { failureMessageFor } from "../../../presentation/FailureMessages.js";
import type { MonthlyReportPresenter } from "../../../presentation/presenters/MonthlyReportPresenter.js";

/** What the HTTP edge hands back. The server writes it; it decides nothing. */
export interface ControllerResponse {
  status: number;
  body: unknown;
}

/**
 * Which clients a browser is allowed to ask about.
 *
 * There is no login in Phase 1, so this is the whole of the access control:
 * an id that isn't on the list is a 404, and `?client=` therefore cannot be used
 * to walk through every company in the Odoo database. Composition owns the list
 * because composition owns the registry (docs/architecture_phase1.md §12).
 */
export interface BriefAudience {
  /** The id to show when the URL names none — the demo's single client. */
  default(): ClientId | null;
  /** Null when this id is not one we serve briefs for. */
  resolve(requested: string): ClientId | null;
}

/**
 * The web brief's inbound adapter — the shared page the owner and the fractional
 * CFO open on the call (docs/ui_proposal.md).
 *
 * Sibling of `LinqWebhookController`: it translates one transport into a use
 * case call and a view model, and it holds no logic of its own. The failure copy
 * comes from `FailureMessages`, the same strings Tammy texts, so a book that is
 * too broken to answer on says the same thing on both surfaces rather than
 * showing a stack trace on one of them.
 */
export class BriefController {
  constructor(
    private readonly report: BuildMonthlyReport,
    private readonly presenter: MonthlyReportPresenter,
    private readonly reviews: ReviewNotes,
    private readonly audience: BriefAudience,
    private readonly clock: Clock,
    /**
     * Only used to resolve "the month the brief is showing" when a review names
     * none. It is the same value the use case defaults with, injected rather
     * than repeated so the two cannot drift onto different months.
     */
    private readonly settlingDays: number,
  ) {}

  /** `GET /api/brief?client=demo&month=2026-07` */
  async brief(query: URLSearchParams): Promise<ControllerResponse> {
    const client = this.client(query.get("client"));
    if (client === null) return notFound();

    let month: Month | null;
    try {
      month = this.month(query.get("month"));
    } catch (error) {
      return { status: 400, body: { error: failureMessageFor(error) } };
    }

    try {
      const result = await this.report.execute({ clientId: client, month });
      return { status: 200, body: this.presenter.present(result) };
    } catch (error) {
      // An unreadable ledger is a 503, not a 500: nothing is wrong with the
      // request, and the honest advice — the same one Tammy gives — is to try
      // again in a minute.
      console.error("[brief]", error);
      return { status: 503, body: { error: failureMessageFor(error) } };
    }
  }

  /**
   * `POST /api/brief/review` — the human loop, written back.
   *
   * The one write in the product, and it writes an opinion about our own output.
   * Nothing on this path can reach Odoo (docs/product_demo.md: read-only forever).
   */
  async recordReview(query: URLSearchParams, payload: unknown): Promise<ControllerResponse> {
    const client = this.client(query.get("client"));
    if (client === null) return notFound();

    const fields = asReviewPayload(payload);
    if (fields === null) {
      return { status: 400, body: { error: "expected { before, after, author? }" } };
    }

    let month: Month | null;
    try {
      month = this.month(query.get("month"));
    } catch (error) {
      return { status: 400, body: { error: failureMessageFor(error) } };
    }

    const target = month ?? Month.lastClosed(this.clock.now(), this.settlingDays);
    await this.reviews.record(
      new ReviewNote(
        client,
        target,
        fields.before,
        fields.after,
        fields.author ?? "Fractional CFO",
        this.clock.now(),
      ),
    );
    return { status: 200, body: { recorded: true, month: target.key() } };
  }

  private client(requested: string | null): ClientId | null {
    const trimmed = requested?.trim();
    return trimmed ? this.audience.resolve(trimmed) : this.audience.default();
  }

  /** @throws UnparseableMonthError — a month in the URL that resolves to nothing. */
  private month(requested: string | null): Month | null {
    const trimmed = requested?.trim();
    return trimmed ? Month.require(trimmed, this.clock.now()) : null;
  }
}

function notFound(): ControllerResponse {
  return { status: 404, body: { error: "No brief published for that client." } };
}

interface ReviewPayload {
  before: string;
  after: string;
  author?: string;
}

/**
 * Both halves are required. A note with only an "after" would render as an
 * improvement with nothing to have improved on, which is the one thing the
 * before → after must never claim (see `ReviewNote`).
 */
function asReviewPayload(payload: unknown): ReviewPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const before = record["before"];
  const after = record["after"];
  const author = record["author"];

  if (typeof before !== "string" || typeof after !== "string") return null;
  if (before.trim() === "" || after.trim() === "") return null;

  return {
    before: before.trim(),
    after: after.trim(),
    ...(typeof author === "string" && author.trim() !== "" ? { author: author.trim() } : {}),
  };
}
