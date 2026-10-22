import type { WalletLedgerEntry, WalletSummary } from "@yumipos/djiwapay-core";
export type WalletResponse = { wallet: WalletSummary; ledger: WalletLedgerEntry[] };
export type TopupStatusResponse = { status: "pending" | "success" | "expired"; message?: string; wallet?: WalletSummary; ledger?: WalletLedgerEntry[] };
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
  const products = payload.data?.data?.pricelist;
  if (!payload.success || !Array.isArray(products)) throw new Error("Format katalog PPOB tidak valid");
  return products.filter((product) => product.status === "active");
}

export type PpobPurchaseResult = { success: boolean; status?: "success" | "pending" | "failed"; message?: string; error?: string; refId?: string; serialNumber?: string | null };
export async function purchasePpob(productCode: string, customerNumber: string): Promise<PpobPurchaseResult> {
  const response = await fetch("/api/pay-bridge/ppob/purchase", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productCode, customerNumber }) });
  const payload = await response.json().catch(() => ({})) as PpobPurchaseResult;
  if (!response.ok && !payload.error) throw new Error("Pembayaran PPOB gagal diproses");
  return payload;
}

export type PpobInvoiceResult = { success: boolean; invoiceUrl?: string; invoiceId?: string; error?: string };
export async function createPpobInvoice(productCode: string, customerNumber: string): Promise<PpobInvoiceResult> {
  const response = await fetch("/api/pay-bridge/ppob/invoice", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productCode, customerNumber }) });
  const payload = await response.json().catch(() => ({})) as PpobInvoiceResult;
  if (!response.ok || !payload.success || !payload.invoiceUrl) throw new Error(payload.error || "Invoice QRIS belum dapat dibuat");
  return payload;
}

export type PpobStatusResult = PpobPurchaseResult & { amount?: number; productCode?: string };
export async function checkPpobStatus(invoiceId: string): Promise<PpobStatusResult> {
  const response = await fetch("/api/pay-bridge/ppob/status", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoiceId }) });
  const payload = await response.json().catch(() => ({})) as PpobStatusResult;
  if (!response.ok && !payload.error) throw new Error("Status pembayaran belum dapat diperiksa");
  return payload;
}

export async function checkTopupStatus(invoiceId: string): Promise<TopupStatusResponse> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "topup-status", invoiceId }) });
  const payload = await response.json().catch(() => ({})) as TopupStatusResponse & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Status top up belum dapat diperiksa");
  return payload;
}
