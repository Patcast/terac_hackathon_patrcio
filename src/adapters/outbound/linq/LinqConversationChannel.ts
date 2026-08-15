import type {
  ConversationChannel,
  MessageRef,
} from "../../../application/ports/driven/ConversationChannel.js";
import type { PhoneNumber } from "../../../domain/model/Ids.js";
import { LinqClient, type LinqSentMessage } from "./LinqClient.js";

/** The slice of `LinqClient` this channel needs — an interface so a test can stub it. */
export interface LinqMessaging {
  sendText(to: string, text: string): Promise<LinqSentMessage>;
  setTyping(to: string, on: boolean): Promise<void>;
}

/**
 * Where a swallowed failure goes. Injected so the composition root decides, but
 * defaulted to a real write rather than a no-op: an error that is deliberately
 * ignored and leaves no trace is the kind you find out about on stage.
 */
export type ChannelLog = (message: string, error: unknown) => void;

const DEFAULT_LOG: ChannelLog = (message, error) => {
  console.warn(`[linq] ${message}`, error);
};

/**
 * The thread Tammy speaks in (docs/architecture_phase1.md §6), over Linq.
 *
 * Thin by design: it maps `PhoneNumber` to a string and delegates. The one
 * decision it owns is what a failed typing indicator means — see `setTyping`.
 */
export class LinqConversationChannel implements ConversationChannel {
  constructor(
    private readonly client: LinqMessaging,
    private readonly log: ChannelLog = DEFAULT_LOG,
  ) {}

  static fromEnv(): LinqConversationChannel {
    return new LinqConversationChannel(LinqClient.fromEnv());
  }

  async sendText(to: PhoneNumber, text: string): Promise<MessageRef> {
    const sent = await this.client.sendText(to.value, text);
    // A send that succeeded without a recognisable id is still a delivered
    // message; refusing to return a ref would fail the answer over a trace field.
    return { id: sent.id ?? "unknown" };
  }

  /**
   * Cosmetic, and therefore never fatal.
   *
   * If the endpoint 404s, is rate-limited, or the assumption in
   * the indicator endpoint moves, the client loses a "…" bubble. Letting
   * that reject would lose them the answer instead, which is a strictly worse
   * trade — so this swallows and logs.
   */
  async setTyping(to: PhoneNumber, on: boolean): Promise<void> {
    try {
      await this.client.setTyping(to.value, on);
    } catch (error) {
      this.log(`typing indicator (${on ? "on" : "off"}) failed for ${to.value}`, error);
    }
  }
}
