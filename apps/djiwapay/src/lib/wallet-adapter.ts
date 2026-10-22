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

export type PpobProduct = { product_code: string; product_description: string; product_nominal: string; product_details?: string; product_price: number; product_type: string; status: string; icon_url?: string };
export async function readPpobCatalog(): Promise<PpobProduct[]> {
  const response = await fetch("https://api.djiwatentram.web.id/api/ppob/iak/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "price-list" }) });
  if (!response.ok) throw new Error("Katalog PPOB tidak dapat dimuat");
  const payload = await response.json() as { success?: boolean; data?: { data?: { pricelist?: PpobProduct[] } } };
  if (!payload.success || !Array.isArray(payload.data?.data?.pricelist)) throw new Error("Format katalog PPOB tidak valid");
  return payload.data.data.pricelist.filter((product) => product.status === "active");
}
