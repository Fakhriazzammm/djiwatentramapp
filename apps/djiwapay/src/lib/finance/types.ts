export type Kind = "out" | "in" | "tf";
export type EntrySource = "manual" | "voice" | "pay" | "receipt";

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
  /** Set when the entry came from a scanned receipt (server-side finance.receipts id). */
  receiptId?: string;
  createdAt: string;
};

export type AccountType = "cash" | "bank" | "ewallet" | "card" | "other";
export type Account = { id: string; name: string; type: AccountType; opening: number; archived?: boolean };

export type Category = { id: string; name: string; icon: string; tone: string; income: boolean; custom?: boolean };
export type Budget = { categoryId: string; limit: number; rollover: boolean };
export type Goal = { id: string; name: string; target: number; deposits: { at: string; amount: number }[]; createdAt: string };
export type Debt = { id: string; person: string; direction: "owed_to_me" | "i_owe"; amount: number; note: string; due?: string; settled: boolean; createdAt: string };

/** Local-only management data (not synced yet): recurring bills, spending pockets and manual assets. */
export type Bill = { id: string; name: string; amount: number; /** Day of month 1-31. */ day: number; icon: string; tone: string; /** "YYYY-MM" months already paid. */ paid: string[] };
export type Pocket = { id: string; name: string; percent: number; categoryIds: string[]; tone: string; icon: string };
export type AssetKind = "gold" | "fund" | "stock" | "crypto" | "property" | "vehicle" | "other";
export type Asset = { id: string; name: string; kind: AssetKind; value: number };

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
  bills: Bill[];
  pockets: Pocket[];
  assets: Asset[];
};
