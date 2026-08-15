import { AccountRef } from "../Ids.js";
import { AccountType } from "../AccountTypes.js";

export interface AccountEntry {
  account: AccountRef;
  accountType: AccountType;
}

/**
 * The vocabulary the client's own books use.
 *
 * Changes ~never, which is why it sits at the front of the prompt behind a cache
 * breakpoint (docs/architecture_phase1.md §4). It is also the only book part
 * with no currency: a list of account names is not an amount.
 */
export class ChartOfAccounts {
  constructor(readonly entries: readonly AccountEntry[]) {}

  byType(type: AccountType): AccountEntry[] {
    return this.entries.filter((entry) => entry.accountType === type);
  }

  find(accountId: string): AccountEntry | null {
    return this.entries.find((entry) => entry.account.id === accountId) ?? null;
  }

  size(): number {
    return this.entries.length;
  }
}
