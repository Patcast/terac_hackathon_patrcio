import type { ClientId } from "../../../domain/model/Ids.js";
import type { Month } from "../../../domain/model/Month.js";
import type { MonthlyBook } from "../../../domain/model/MonthlyBook.js";
import type { AccountingRepository } from "../../../application/ports/driven/AccountingRepository.js";
import type { MonthlyBookAssembler } from "../accounting/MonthlyBookAssembler.js";

/** How a `ClientId` becomes an Odoo company. Null means "don't scope the reads". */
export type CompanyIdResolver = (clientId: ClientId) => number | null;

/**
 * The live side of the `AccountingRepository` port.
 *
 * It is this thin on purpose. Everything that knows *how* to read Odoo lives in
 * the fifteen reports; everything that knows how to run them concurrently and
 * turn failures into gaps lives in the assembler. What is left here is the one
 * thing neither of them can know: which Odoo company this client's books are in.
 *
 * `AccountingRepository` takes a `ClientId` and nothing else, so the mapping has
 * to be injected rather than looked up — the registry lives in `application/`
 * and an outbound adapter reaching into it would invert the dependency the
 * whole design is built on. The default resolver returns null, which is correct
 * for the single-company instance Phase 1 demos against.
 */
export class OdooAccountingRepository implements AccountingRepository {
  constructor(
    private readonly assembler: MonthlyBookAssembler,
    private readonly companyIdOf: CompanyIdResolver = () => null,
  ) {}

  async getMonthlyBook(clientId: ClientId, month: Month): Promise<MonthlyBook> {
    return this.assembler.assemble(clientId, month, this.companyIdOf(clientId));
  }
}
