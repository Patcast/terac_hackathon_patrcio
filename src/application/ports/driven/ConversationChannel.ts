import type { PhoneNumber } from "../../../domain/model/Ids.js";

/** Whatever the channel calls the message it just sent, so a reply can be traced. */
export interface MessageRef {
  id: string;
}

/**
 * The thread Tammy speaks in. Two methods only — Phase 1 sends text and shows a
 * typing indicator while Odoo and Claude run. Cards, tapbacks and read receipts
 * are Phase 2 methods on this same interface (docs/imessage_flow_phase1.md).
 */
export interface ConversationChannel {
  sendText(to: PhoneNumber, text: string): Promise<MessageRef>;
  setTyping(to: PhoneNumber, on: boolean): Promise<void>;
}
