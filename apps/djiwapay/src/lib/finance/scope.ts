import { PAY_ACCOUNT_ID } from "./categories";
import type { Account, AccountScope, Entry, FinanceState } from "./types";

/** "all" shows everything; the other two show one pool of wallets and the records that touch it. */
export type Scope = "all" | AccountScope;
export const SCOPES: readonly (readonly [Scope, string])[] = [["all", "Semua"], ["personal", "Pribadi"], ["business", "Bisnis"]];
export const SCOPE_LABEL: Record<AccountScope, string> = { personal: "Pribadi", business: "Bisnis" };

export const accountScope = (a: Pick<Account, "scope">): AccountScope => (a.scope === "business" ? "business" : "personal");
export const hasBusiness = (accounts: Account[]) => accounts.some((a) => !a.archived && accountScope(a) === "business");
/** Scope of a wallet id. Djiwa Pay and unknown ids count as personal. */
export const scopeOfId = (id: string | undefined, accounts: Account[]): AccountScope => (!id || id === PAY_ACCOUNT_ID ? "personal" : accountScope(accounts.find((a) => a.id === id) ?? {}));

/** A transfer between a personal and a business wallet. It moves money between pools; it is not income or spending in either. */
export const isCrossScope = (e: Entry, accounts: Account[]) => e.kind === "tf" && Boolean(e.toAccountId) && scopeOfId(e.accountId, accounts) !== scopeOfId(e.toAccountId, accounts);

export const accountInScope = (a: Account, scope: Scope) => scope === "all" || accountScope(a) === scope;
/** Records that touch a wallet in the scope (a transfer shows in both pools when it crosses). */
export const entriesInScope = (entries: Entry[], accounts: Account[], scope: Scope): Entry[] =>
  scope === "all" ? entries : entries.filter((e) => scopeOfId(e.accountId, accounts) === scope || (e.kind === "tf" && scopeOfId(e.toAccountId, accounts) === scope));

/** The slice of the person's data a page should compute from. Everything else (budgets, goals, bills...) is unchanged; budgets measure the scoped spending. */
export function scopedState(state: FinanceState, scope: Scope): FinanceState {
  if (scope === "all") return state;
  return { ...state, allAccounts: state.accounts, accounts: state.accounts.filter((a) => accountInScope(a, scope)), entries: entriesInScope(state.entries, state.accounts, scope) };
}
/** A saved business choice falls back to "all" once the last business wallet is gone. */
export const effectiveScope = (scope: Scope, accounts: Account[]): Scope => (scope === "business" && !hasBusiness(accounts) ? "all" : scope);
