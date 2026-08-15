import type { ClientId } from "../../domain/model/Ids.js";
import type { Month } from "../../domain/model/Month.js";

/**
 * One inbound question, already resolved to a client.
 *
 * `month` is nullable because parsing "in July" out of a text message is the
 * inbound adapter's job, not the use case's — and most messages name no month
 * at all, in which case the use case falls back to the last settled one.
 */
export interface AnswerQuestionCommand {
  clientId: ClientId;
  question: string;
  month: Month | null;
}
