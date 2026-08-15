import { ClientId, PhoneNumber } from "./Ids.js";

/**
 * A business Tammy answers for.
 *
 * `odooCompanyId` is nullable because a single-company Odoo database needs no
 * company filter at all, and a `0` sentinel would be indistinguishable from a
 * real id. Phase 1 has no billing, no plan and no user account — a client is a
 * name, a number to text, and a ledger to read.
 */
export class Client {
  constructor(
    readonly id: ClientId,
    readonly businessName: string,
    readonly phone: PhoneNumber,
    readonly odooCompanyId: number | null,
  ) {}
}
