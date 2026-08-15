import type { ClientRegistry } from "../../../application/ports/driven/ClientRegistry.js";
import { UnknownClientError } from "../../../domain/errors/BookErrors.js";
import { Client } from "../../../domain/model/Client.js";
import { ClientId, PhoneNumber } from "../../../domain/model/Ids.js";

/** One entry of `CLIENT_REGISTRY_JSON`, keyed by the phone the client texts from. */
export interface ClientRegistryEntry {
  clientId: string;
  businessName: string;
  odooCompanyId?: number | null;
}

/**
 * Phase 1's client "database": a JSON object in the environment
 * (docs/architecture_phase1.md §13).
 *
 * ```json
 * { "+1 (555) 010-1234": { "clientId": "acme", "businessName": "Acme Ltd", "odooCompanyId": 1 } }
 * ```
 *
 * Lookups match on digits only, so the number Linq reports (`15550101234`) finds
 * the client however the operator typed it into `.env`. Getting this wrong shows
 * up as "I don't have books linked to this number yet" for a client who is in
 * fact configured — a confusing failure worth three lines of normalisation.
 */
export class InMemoryClientRegistry implements ClientRegistry {
  private readonly byId: Map<string, Client>;
  private readonly byDigits: Map<string, Client>;

  constructor(private readonly clients: readonly Client[]) {
    this.byId = new Map(clients.map((client) => [client.id.value, client]));
    this.byDigits = new Map(clients.map((client) => [client.phone.digits, client]));
  }

  /** Parses `CLIENT_REGISTRY_JSON`. A null or empty value is an empty registry, not an error. */
  static fromJson(json: string | null): InMemoryClientRegistry {
    return new InMemoryClientRegistry(parseClientRegistry(json));
  }

  require(clientId: ClientId): Client {
    const client = this.byId.get(clientId.value);
    if (client === undefined) throw new UnknownClientError(clientId.value);
    return client;
  }

  findByPhone(phone: PhoneNumber): Client | null {
    return this.byDigits.get(phone.digits) ?? null;
  }

  all(): readonly Client[] {
    return this.clients;
  }
}

/**
 * Fails loudly on malformed config rather than booting with an empty registry —
 * a typo in `.env` should surface at startup, not as an unknown client mid-demo.
 */
export function parseClientRegistry(json: string | null): Client[] {
  if (json === null || json.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new TypeError(`CLIENT_REGISTRY_JSON is not valid JSON: ${String(error)}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("CLIENT_REGISTRY_JSON must be an object keyed by phone number");
  }

  return Object.entries(parsed).map(([phone, raw]) => {
    const entry = asEntry(phone, raw);
    return new Client(
      ClientId.of(entry.clientId),
      entry.businessName,
      PhoneNumber.of(phone),
      entry.odooCompanyId ?? null,
    );
  });
}

function asEntry(phone: string, raw: unknown): ClientRegistryEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new TypeError(`CLIENT_REGISTRY_JSON entry for ${phone} is not an object`);
  }
  const record: Record<string, unknown> = { ...raw };
  const clientId = record["clientId"];
  const businessName = record["businessName"];
  const odooCompanyId = record["odooCompanyId"];

  if (typeof clientId !== "string" || typeof businessName !== "string") {
    throw new TypeError(`CLIENT_REGISTRY_JSON entry for ${phone} needs clientId and businessName`);
  }
  return {
    clientId,
    businessName,
    odooCompanyId: typeof odooCompanyId === "number" ? odooCompanyId : null,
  };
}
