import type { WalletLedgerEntry, WalletSummary } from "@yumipos/djiwapay-core";
export type WalletResponse = { wallet: WalletSummary; ledger: WalletLedgerEntry[] };
export async function readWallet(_profile: { source_id: string }): Promise<WalletResponse> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get" }) });
  if (response.status === 401) throw new Error("Sesi Djiwa Pay kedaluwarsa");
  if (!response.ok) throw new Error("Wallet customer tidak dapat dimuat");
  const payload = await response.json() as { wallet?: WalletSummary; ledger?: WalletLedgerEntry[] };
  if (!payload.wallet) throw new Error("Wallet customer tidak ditemukan");
  return { wallet: payload.wallet, ledger: payload.ledger ?? [] };
}
