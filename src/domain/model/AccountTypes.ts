/**
 * Odoo 17+ `account_type` values, kept verbatim rather than mapped to an enum of
 * our own (docs/architecture_phase1.md §4).
 *
 * A translation table here would be a second place to get the classification
 * wrong, and the values are already stable strings. What the domain needs is not
 * a different vocabulary but the *grouping* — "is this line revenue or cost" —
 * so that lives here, once, and nothing downstream string-matches on
 * `"expense_direct_cost"` again.
 *
 * The **sign** rule that travels with these is not enforced here: Odoo stores
 * credits negative, and `OdooMapper` flips it exactly once at the boundary, so
 * every `Money` reaching this layer is already oriented with revenue and
 * expenses both positive.
 */
export type AccountType = string;

export const AccountTypes = {
  income: ["income", "income_other"],
  expense: ["expense", "expense_direct_cost", "expense_depreciation"],
  costOfSales: ["expense_direct_cost"],
  cash: ["asset_cash"],
  receivable: ["asset_receivable"],
  payable: ["liability_payable"],
  asset: [
    "asset_cash",
    "asset_receivable",
    "asset_current",
    "asset_non_current",
    "asset_prepayments",
    "asset_fixed",
  ],
  liability: [
    "liability_payable",
    "liability_credit_card",
    "liability_current",
    "liability_non_current",
  ],
  equity: ["equity", "equity_unaffected"],
} as const;

/**
 * `as const` makes each group a tuple of string literals, so a bare `.includes`
 * would reject any `AccountType` that isn't already one of them — a compile
 * error where we want a runtime answer. Widening to `readonly string[]` is the
 * whole point of the helper.
 */
function isIn(group: readonly string[], type: AccountType): boolean {
  return group.includes(type);
}

export function isIncome(type: AccountType): boolean {
  return isIn(AccountTypes.income, type);
}

/** Cost of sales is a *subset* of this, not a sibling — see `ProfitAndLoss`. */
export function isExpense(type: AccountType): boolean {
  return isIn(AccountTypes.expense, type);
}

export function isCostOfSales(type: AccountType): boolean {
  return isIn(AccountTypes.costOfSales, type);
}

export function isAsset(type: AccountType): boolean {
  return isIn(AccountTypes.asset, type);
}

export function isLiability(type: AccountType): boolean {
  return isIn(AccountTypes.liability, type);
}

export function isEquity(type: AccountType): boolean {
  return isIn(AccountTypes.equity, type);
}
