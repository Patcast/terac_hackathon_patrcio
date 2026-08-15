/**
 * Identity types. Thin wrappers, but they stop an `InvoiceId` being passed where
 * a `ClientId` belongs — the kind of mix-up that reads as a plausible answer
 * about the wrong company.
 */

export class ClientId {
  private constructor(readonly value: string) {}

  static of(value: string): ClientId {
    const trimmed = value.trim();
    if (!trimmed) throw new TypeError("ClientId.of: empty id");
    return new ClientId(trimmed);
  }

  equals(other: ClientId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** Odoo's `account.move` id, carried as a string so fixtures round-trip cleanly. */
export class InvoiceId {
  private constructor(readonly value: string) {}

  static of(value: string | number): InvoiceId {
    const text = String(value).trim();
    if (!text) throw new TypeError("InvoiceId.of: empty id");
    return new InvoiceId(text);
  }

  equals(other: InvoiceId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** A customer or vendor: Odoo's `[id, name]` tuple, made into a domain type. */
export class PartyRef {
  private constructor(
    readonly id: string,
    readonly name: string,
  ) {}

  static of(id: string | number, name: string): PartyRef {
    return new PartyRef(String(id), name.trim() || `partner ${id}`);
  }

  /** Odoo returns `false` for an unset partner — bills entered without one. */
  static unknown(): PartyRef {
    return new PartyRef("0", "Unknown");
  }

  equals(other: PartyRef): boolean {
    return this.id === other.id;
  }

  toString(): string {
    return this.name;
  }
}

/** A GL account: code plus name, both of which appear in answers. */
export class AccountRef {
  private constructor(
    readonly id: string,
    readonly code: string,
    readonly name: string,
  ) {}

  static of(id: string | number, code: string, name: string): AccountRef {
    return new AccountRef(String(id), code.trim(), name.trim());
  }

  /** `read_group` gives `[id, "600000 Rent"]` and nothing else to split on. */
  static fromLabel(id: string | number, label: string): AccountRef {
    const match = /^\s*(\S+)\s+(.*)$/.exec(label);
    return match?.[1] !== undefined && match[2] !== undefined
      ? new AccountRef(String(id), match[1], match[2])
      : new AccountRef(String(id), "", label.trim());
  }

  toString(): string {
    return this.code ? `${this.code} ${this.name}` : this.name;
  }
}

/** The client's iMessage number — how an inbound webhook is identified. */
export class PhoneNumber {
  private constructor(readonly value: string) {}

  static of(value: string): PhoneNumber {
    const trimmed = value.trim();
    if (!trimmed) throw new TypeError("PhoneNumber.of: empty number");
    return new PhoneNumber(trimmed);
  }

  /** Digits only, for comparing `+1 (555) 010-1234` with `15550101234`. */
  get digits(): string {
    return this.value.replace(/\D/g, "");
  }

  equals(other: PhoneNumber): boolean {
    return this.digits === other.digits;
  }

  toString(): string {
    return this.value;
  }
}
