import { PhoneNumber } from "../../../domain/model/Ids.js";

/**
 * Linq's webhook body, typed as loosely as it actually is.
 *
 * Vendor payloads stop at this file (docs/architecture_phase1.md §10, hop one).
 * The shape is wide because Linq wraps events inconsistently between endpoints
 * and because a webhook is the one input we do not control: an unexpected key is
 * a Tuesday, not an incident.
 */
export interface LinqInboundWebhookPayload {
  event?: string;
  type?: string;
  data?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

/**
 * What the controller actually needs: who texted, and what they said.
 * Everything else Linq sends is either routing or telemetry.
 */
export interface InboundTextMessage {
  from: PhoneNumber;
  text: string;
  /** For tracing a reply back to its question; null when the payload carries none. */
  messageId: string | null;
}

const FROM_KEYS = ["from", "from_number", "sender", "phone_number", "author"];
const TEXT_KEYS = ["text", "body", "value", "content"];
const ID_KEYS = ["id", "message_id", "uuid"];

/**
 * Reads an inbound text out of whatever Linq posted, or returns null.
 *
 * **Null is the normal case, not an error.** Delivery receipts, read receipts,
 * reactions and echoes of Tammy's own outbound messages all arrive on this
 * endpoint, and the right response to every one of them is to do nothing. Only
 * a payload with a sender and some text is a question.
 */
export function parseInboundMessage(payload: unknown): InboundTextMessage | null {
  const root = asRecord(payload);
  if (!root) return null;

  // `data` is where the v3 events put their body; some endpoints post it flat.
  const body = asRecord(root["data"]) ?? root;

  if (isOutbound(body) || isOutbound(root)) return null;

  const from = readPhone(body) ?? readPhone(root);
  if (!from) return null;

  const text = readText(body) ?? readText(root);
  if (!text) return null;

  return { from, text, messageId: readId(body) ?? readId(root) };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Tammy's own sends come back on the same hook; answering them is an infinite loop. */
function isOutbound(record: Record<string, unknown>): boolean {
  if (record["is_from_me"] === true || record["from_me"] === true) return true;
  const direction = record["direction"];
  return typeof direction === "string" && direction.toLowerCase() === "outbound";
}

function readPhone(record: Record<string, unknown>): PhoneNumber | null {
  for (const key of FROM_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return PhoneNumber.of(value);
    // `from` is sometimes an object carrying the number one level down.
    const nested = asRecord(value);
    if (nested) {
      for (const inner of ["phone_number", "number", "value"]) {
        const candidate = nested[inner];
        if (typeof candidate === "string" && candidate.trim()) return PhoneNumber.of(candidate);
      }
    }
  }
  return null;
}

/**
 * Linq's own send format is `{ message: { parts: [{ type, value }] } }`, and the
 * inbound side mirrors it — but flat `text`/`body` shows up too, so both are
 * accepted rather than guessed between.
 */
function readText(record: Record<string, unknown>): string | null {
  const message = asRecord(record["message"]);
  if (message) {
    const parts = message["parts"];
    if (Array.isArray(parts)) {
      const texts = parts
        .map((part) => asRecord(part))
        .filter((part): part is Record<string, unknown> => part !== null)
        .filter((part) => part["type"] === undefined || part["type"] === "text")
        .map((part) => part["value"] ?? part["text"])
        .filter((value): value is string => typeof value === "string");
      const joined = texts.join("\n").trim();
      if (joined) return joined;
    }
    const inner = readFlatText(message);
    if (inner) return inner;
  }
  return readFlatText(record);
}

function readFlatText(record: Record<string, unknown>): string | null {
  for (const key of TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readId(record: Record<string, unknown>): string | null {
  for (const key of ID_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}
