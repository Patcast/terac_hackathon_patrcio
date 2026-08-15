import type { Client } from "../../../domain/model/Client.js";
import type { ClientId, PhoneNumber } from "../../../domain/model/Ids.js";

/**
 * Who Tamoa has books for. Phase 1 has no client database — the registry is a
 * config value — but the use case shouldn't know that.
 *
 * `require` throws where `findByPhone` returns null on purpose: an unknown
 * *phone* is an ordinary inbound message from a stranger, which the webhook
 * answers with "I don't have books linked to this number yet"; an unknown
 * *ClientId* means we built a command for a client we can't resolve, which is a
 * bug rather than a conversation.
 */
export interface ClientRegistry {
  /** @throws UnknownClientError */
  require(clientId: ClientId): Client;
  findByPhone(phone: PhoneNumber): Client | null;
  all(): readonly Client[];
}
