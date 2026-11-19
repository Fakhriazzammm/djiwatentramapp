export type Kind = "out" | "in" | "tf";
export type EntrySource = "manual" | "voice" | "pay" | "receipt" | "email" | "sheet";

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
  /** Set when the entry was read from a payment e-mail (server-side finance.inbound_messages id). */
  inboundId?: string;
  createdAt: string;
};

export type AccountType = "cash" | "bank" | "ewallet" | "card" | "other";
export type Account = { id: string; name: string; type: AccountType; opening: number; archived?: boolean };

export type Category = { id: string; name: string; icon: string; tone: string; income: boolean; custom?: boolean };
export type Budget = { categoryId: string; limit: number; rollover: boolean };
export type Goal = { id: string; name: string; target: number; deposits: { at: string; amount: number }[]; /** Target date, YYYY-MM-DD. */ due?: string; createdAt: string };
export type Debt = { id: string; person: string; direction: "owed_to_me" | "i_owe"; amount: number; note: string; due?: string; settled: boolean; /** Repayments made so far (the debt itself keeps its original amount). */ payments?: { at: string; amount: number }[]; createdAt: string };

/** Local-only management data (not synced yet): recurring bills, spending pockets and manual assets. */
export type Bill = { id: string; name: string; amount: number; /** Day of month 1-31. */ day: number; icon: string; tone: string; /** "YYYY-MM" months already paid. */ paid: string[] };
/** Instalment credit: KPR, vehicle, multi-purpose and other loans. `balance` is the principal still owed; `paid` the instalments paid so far. */
export type LoanKind = "kpr" | "kendaraan" | "multiguna" | "lainnya";
export type LoanModel = "anuitas" | "flat" | "syariah";
export type LoanPayment = { at: string; amount: number; interest: number; principal: number; extra?: boolean };
export type Loan = {
  id: string; name: string; kind: LoanKind; lender: string; model: LoanModel; principal: number; months: number; startDate?: string; dueDay: number;
  /** Annual percentages. The fixed rate applies to the first `fixedMonths` instalments, the floating rate afterwards. */
  fixedRate: number; fixedMonths: number; floatRate: number;
  balance: number; paid: number; /** The instalment the bank actually charges, when it differs from the computed one. */ installment: number | null;
  payments: LoanPayment[]; billId?: string; note: string; createdAt: string;
};
export type Pocket = { id: string; name: string; percent: number; categoryIds: string[]; tone: string; icon: string };
export type AssetKind = "gold" | "fund" | "stock" | "crypto" | "property" | "vehicle" | "electronics" | "other";
export type AssetSub = "batangan" | "perhiasan" | "koin" | "lainnya";
export type Asset = { id: string; name: string; kind: AssetKind; value: number; sub?: AssetSub; weight?: number; purity?: number; boughtOn?: string; cost?: number; shop?: string; note?: string; stickerId?: string; auto?: boolean; /** Value follows an estimated yearly change from the purchase price (non-gold assets). */ est?: boolean; /** Estimated change per year in percent; negative for assets that lose value. */ rate?: number };

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
  loans: Loan[];
  /** Edits to read-only Djiwa Pay entries, keyed by `pay:<transaction id>`. */
  overrides: Record<string, Override>;
  bills: Bill[];
  pockets: Pocket[];
  assets: Asset[];
};
