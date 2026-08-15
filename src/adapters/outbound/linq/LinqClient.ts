import { linqConfig, type LinqConfig } from "../../../config/env.js";
import { failed, ok, type ConnectivityResult } from "../connectivity.js";

const SERVICE = "Linq";

export class LinqApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly body: string,
  ) {
    super(`${method} ${path} -> ${status}: ${body.slice(0, 400)}`);
    this.name = "LinqApiError";
  }
}

/** A phone number owned by the Linq account. Only the fields we rely on. */
export interface LinqPhoneNumber {
  phone_number?: string;
  number?: string;
  [key: string]: unknown;
}

/** What Linq hands back after a send, reduced to the one field we can use. */
export interface LinqSentMessage {
  /** Null when the response carries no identifier we recognise — a send is still a send. */
  id: string | null;
}

/**
 * The typing indicator, **verified against the live API**: it hangs off a chat,
 * not off a phone number, and stopping is a `DELETE` rather than a flag.
 *
 *     POST   /chats/{chatId}/typing   → 204, "…" appears
 *     DELETE /chats/{chatId}/typing   → 204, "…" clears
 *
 * The chat id is the catch: it only exists once a conversation does, so
 * `typingPath` can only be built after the client has texted us at least once
 * — which in sandbox is a precondition for sending anyway.
 */
export function typingPath(chatId: string): string {
  return `/chats/${chatId}/typing`;
}

/** A conversation, as `GET /chats` returns it. Only the fields we rely on. */
export interface LinqChat {
  id?: string;
  handles?: { handle?: string; is_me?: boolean }[];
  [key: string]: unknown;
}

/**
 * HTTP client for the Linq partner API v3 — messaging today, payment requests
 * later (docs/architecture.md §9). Vendor payload shapes stop at this file;
 * mapping them into domain types is `LinqMapper`'s job, not this one's.
 */
export class LinqClient {
  /** number (digits only) → chat id. A chat id never changes once assigned. */
  private readonly chatIds = new Map<string, string>();

  private constructor(private readonly config: LinqConfig) {}

  static fromEnv(config: LinqConfig = linqConfig()): LinqClient {
    return new LinqClient(config);
  }

  /** The number the agent owns — the one clients save as "Tammy". */
  get phoneNumber(): string {
    return this.config.phoneNumber;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new LinqApiError(response.status, method, path, text);
    }

    return (text ? JSON.parse(text) : {}) as T;
  }

  /** `GET /phone_numbers` — read-only, and the basis of the connectivity check. */
  async listPhoneNumbers(): Promise<LinqPhoneNumber[]> {
    const payload = await this.request<unknown>("GET", "/phone_numbers");
    return extractList(payload);
  }

  /**
   * `POST /chats` — start a chat and deliver the first message.
   * Not exercised by the connectivity check: it would text a real handset.
   */
  async sendText(to: string, text: string): Promise<LinqSentMessage> {
    const payload = await this.request<unknown>("POST", "/chats", {
      from: this.config.phoneNumber,
      to: [to],
      message: { parts: [{ type: "text", value: text }] },
    });
    return { id: extractId(payload) };
  }

  /**
   * The typing indicator — cosmetic, and treated as such.
   *
   * It still throws on failure: deciding that a missing "…" bubble is not worth
   * failing an answer over is a policy, and policy belongs to
   * `LinqConversationChannel`, not to an HTTP client. A number we have no chat
   * with yet is not a failure though — there is simply nothing to type into.
   */
  async setTyping(to: string, on: boolean): Promise<void> {
    const chatId = await this.chatIdFor(to);
    if (chatId === null) return; // No conversation yet, so nothing to type into.
    await this.request(on ? "POST" : "DELETE", typingPath(chatId));
  }

  /**
   * The chat this number is in, or null.
   *
   * Cached per number: a chat id does not change, and the alternative is listing
   * every chat on the account twice per answer — once to start the indicator and
   * once to clear it — for a cosmetic bubble.
   */
  private async chatIdFor(handle: string): Promise<string | null> {
    const digits = handle.replace(/\D/g, "");
    const cached = this.chatIds.get(digits);
    if (cached !== undefined) return cached;

    const chats = await this.listChats();
    for (const chat of chats) {
      const match = chat.handles?.some(
        (participant) =>
          participant.is_me !== true &&
          typeof participant.handle === "string" &&
          participant.handle.replace(/\D/g, "") === digits,
      );
      if (match === true && typeof chat.id === "string") {
        this.chatIds.set(digits, chat.id);
        return chat.id;
      }
    }
    return null;
  }

  /** `GET /chats` — the account's conversations, newest page first. */
  async listChats(): Promise<LinqChat[]> {
    const payload = await this.request<unknown>("GET", "/chats");
    if (payload && typeof payload === "object") {
      const chats = (payload as Record<string, unknown>)["chats"];
      if (Array.isArray(chats)) return chats as LinqChat[];
    }
    return [];
  }

  /**
   * Proves the bearer token is accepted and that `LINQ_PHONE_NUMBER` is a number
   * this account actually owns — a mismatch there fails at send time, not here,
   * which is a bad way to find out during a demo.
   */
  async checkConnectivity(): Promise<ConnectivityResult> {
    try {
      const numbers = await this.listPhoneNumbers();
      const owned = numbers
        .map((entry) => entry.phone_number ?? entry.number)
        .filter((value): value is string => typeof value === "string");

      const configured = normalizeNumber(this.config.phoneNumber);
      const matches = owned.some((value) => normalizeNumber(value) === configured);

      const summary =
        `token accepted; ${numbers.length} phone number(s) on the account` +
        (owned.length > 0 ? ` [${owned.join(", ")}]` : "");

      if (!matches) {
        return failed(
          SERVICE,
          new Error(
            `${summary} — but LINQ_PHONE_NUMBER (${this.config.phoneNumber}) is not among them`,
          ),
        );
      }

      return ok(SERVICE, `${summary}; LINQ_PHONE_NUMBER matches`);
    } catch (error) {
      return failed(SERVICE, error);
    }
  }
}

/** Linq wraps collections inconsistently across endpoints; accept either shape. */
function extractList(payload: unknown): LinqPhoneNumber[] {
  if (Array.isArray(payload)) return payload as LinqPhoneNumber[];
  if (payload && typeof payload === "object") {
    for (const key of ["data", "phone_numbers", "results"]) {
      const value = (payload as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as LinqPhoneNumber[];
    }
  }
  return [];
}

/** Linq has called this `id`, `message_id` and `chat_id` across endpoints. */
function extractId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested = record["data"];
  const source =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : record;

  for (const key of ["id", "message_id", "chat_id", "uuid"]) {
    const value = source[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function normalizeNumber(value: string): string {
  return value.replace(/[^\d]/g, "");
}
