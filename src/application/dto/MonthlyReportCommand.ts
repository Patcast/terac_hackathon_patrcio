import type { ClientId } from "../../domain/model/Ids.js";
import type { Month } from "../../domain/model/Month.js";

/**
 * A request for one client's brief. Same shape as `AnswerQuestionCommand` minus
 * the question — the brief *is* the question, fixed.
 *
 * `month` is nullable for the same reason it is there: which month a URL means
 * is the inbound adapter's parse, and most requests name none, in which case the
 * use case falls back to the last settled one.
 */
export interface MonthlyReportCommand {
  clientId: ClientId;
  month: Month | null;
}
