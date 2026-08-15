/**
 * What the inbound adapter hands to `ConversationChannel.sendText`. One field,
 * because Phase 1 sends plain text — cards and tapbacks are Phase 2 view models
 * on a Phase 2 channel method (docs/imessage_flow_phase1.md).
 */
export interface MessageViewModel {
  text: string;
}
