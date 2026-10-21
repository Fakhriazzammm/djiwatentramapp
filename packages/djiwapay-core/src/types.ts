export type DjiwaPayContext = "customer" | "b2b" | "merchandise" | "pos" | "admin";
export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "cancelled";
export type ReturnTarget = { origin: string; path: string };
export type WalletSummary = { available_balance: number; held_balance: number; total_credited: number; total_debited: number; status: "active" | "blocked" };
export type WalletLedgerEntry = { id: string; amount: number; direction: "credit" | "debit"; status: string; transaction_type: string; note: string | null; created_at: string };
