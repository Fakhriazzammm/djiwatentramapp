export type Kind = "out" | "in" | "tf";
export type EntrySource = "manual" | "voice" | "pay";

export type Entry = {
  id: string;
  kind: Kind;
  amount: number;
  categoryId: string;
  accountId: string;
  toAccountId?: string;
  /** ISO timestamp the money moved. */
  at: string;
  note: string;
  tags: string[];
  source: EntrySource;
  createdAt: string;
};

export type AccountType = "cash" | "bank" | "ewallet" | "card" | "other";
export type Account = { id: string; name: string; type: AccountType; opening: number; archived?: boolean };

export type Category = { id: string; name: string; icon: string; tone: string; income: boolean; custom?: boolean };
export type Budget = { categoryId: string; limit: number; rollover: boolean };
export type Goal = { id: string; name: string; target: number; deposits: { at: string; amount: number }[]; createdAt: string };
export type Debt = { id: string; person: string; direction: "owed_to_me" | "i_owe"; amount: number; note: string; due?: string; settled: boolean; createdAt: string };

export type Override = { categoryId?: string; note?: string };

export type FinanceState = {
  v: 1;
  onboarded: boolean;
  accounts: Account[];
  categories: Category[];
  entries: Entry[];
  budgets: Budget[];
  goals: Goal[];
  debts: Debt[];
  /** Edits to read-only Djiwa Pay entries, keyed by `pay:<transaction id>`. */
  overrides: Record<string, Override>;
};
