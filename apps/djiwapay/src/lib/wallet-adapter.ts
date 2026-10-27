import type { WalletLedgerEntry, WalletSummary } from "@yumipos/djiwapay-core";
import type { WalletWithdrawalDraft } from "./djiwa-pay-withdrawal";
import { normalizeWalletPhone } from "./djiwa-pay-transfer";
export type WalletResponse = { wallet: WalletSummary; ledger: WalletLedgerEntry[]; transactions?: WalletTransaction[] };
export type WalletTransaction = {
  id: number;
  transfer_id: string | null;
  direction: "credit" | "debit";
  category: "transfer" | "topup" | "payment" | "refund" | "hold" | "release" | "adjustment" | string;
  type: string;
  amount: number;
  balance_after: number;
  status: string;
  counterparty_name: string | null;
  counterparty_phone: string | null;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_at: string;
};
export type WalletNotification = { id: string; title: string; message: string; notification_type: string; action_payload?: { transferId?: string }; created_at: string; unread: boolean };
export type TopupStatusResponse = { status: "pending" | "success" | "expired"; message?: string; wallet?: WalletSummary; ledger?: WalletLedgerEntry[] };
export type WalletTransferResult = { success: boolean; error?: string; transfer?: { transfer_id?: string; amount?: number; sender_balance?: number }; recipient?: { sourceId: string; name: string } };
export type WalletRecipientResult = { success: boolean; error?: string; recipient?: { name: string; phone: string } };

// PostgreSQL NUMERIC values arrive from node-postgres as strings. Convert them
// at the API boundary so wallet arithmetic cannot accidentally concatenate.
function walletAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(amount) ? amount : 0;
}

function normalizeWalletSummary(wallet: WalletSummary): WalletSummary {
  return {
    ...wallet,
    available_balance: walletAmount(wallet.available_balance),
    held_balance: walletAmount(wallet.held_balance),
    total_credited: walletAmount(wallet.total_credited),
    total_debited: walletAmount(wallet.total_debited),
  };
}

function normalizeLedger(entries: WalletLedgerEntry[]): WalletLedgerEntry[] {
  return entries.map((entry) => ({ ...entry, amount: walletAmount(entry.amount) }));
}

function normalizeTransactions(entries: WalletTransaction[]): WalletTransaction[] {
  return entries.map((entry) => ({
    ...entry,
    amount: walletAmount(entry.amount),
    balance_after: walletAmount(entry.balance_after),
  }));
}

export async function readWallet(_profile: { source_id: string }): Promise<WalletResponse & { transactions: WalletTransaction[] }> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get" }) });
  if (response.status === 401) throw new Error("Sesi Djiwa Pay kedaluwarsa");
  if (!response.ok) throw new Error("Wallet customer tidak dapat dimuat");
  const payload = await response.json() as { wallet?: WalletSummary; ledger?: WalletLedgerEntry[]; transactions?: WalletTransaction[] };
  if (!payload.wallet) throw new Error("Wallet customer tidak ditemukan");
  return {
    wallet: normalizeWalletSummary(payload.wallet),
    ledger: normalizeLedger(payload.ledger ?? []),
    transactions: normalizeTransactions(payload.transactions ?? []),
  };
}

export async function readWalletNotifications(): Promise<WalletNotification[]> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "notifications" }) });
  const payload = await response.json().catch(() => ({})) as { notifications?: WalletNotification[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "Notifikasi wallet gagal dimuat");
  return payload.notifications ?? [];
}

export async function markWalletNotificationRead(notificationId: string): Promise<void> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-notification-read", notificationId }) });
  if (!response.ok) throw new Error("Notifikasi wallet gagal diperbarui");
}

export async function markAllWalletNotificationsRead(): Promise<void> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-all-notifications-read" }) });
  if (!response.ok) throw new Error("Notifikasi wallet gagal diperbarui");
}

export type PpobProduct = { product_code: string; product_description: string; product_nominal: string; product_details?: string; product_price: number; product_type: string; status: string; icon_url?: string };
export function ppobProductName(product: Pick<PpobProduct, "product_nominal" | "product_description" | "product_code">): string {
  const nominal = String(product.product_nominal ?? "").trim();
  if (nominal && nominal.toLowerCase() !== "nan") {
    const numericNominal = Number(nominal);
    if (Number.isFinite(numericNominal)) return `Paket ${numericNominal.toLocaleString("id-ID")}`;
    return nominal;
  }
  return product.product_description.trim() || product.product_code;
}
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

export async function transferWallet(recipient: string, amount: number, note = ""): Promise<WalletTransferResult> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transfer", phone: normalizeWalletPhone(recipient), amount, note, idempotencyKey: `djiwapay-transfer-${crypto.randomUUID()}` }) });
  const payload = await response.json().catch(() => ({})) as WalletTransferResult;
  if (!response.ok || !payload.success) throw new Error(payload.error || "Transfer saldo gagal diproses");
  return payload;
}

export async function resolveWalletRecipient(phone: string): Promise<WalletRecipientResult> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve-recipient", phone: normalizeWalletPhone(phone) }) });
  const payload = await response.json().catch(() => ({})) as WalletRecipientResult;
  if (!response.ok || !payload.success) throw new Error(payload.error || "RECIPIENT_NOT_FOUND");
  return payload;
}

export type WalletWithdrawalResult = { success: boolean; error?: string; message?: string; request?: { request_id?: string; status?: string; amount?: number; requested_balance?: number } };
export async function requestWalletWithdrawal(draft: WalletWithdrawalDraft): Promise<WalletWithdrawalResult> {
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdrawal-request", ...draft, idempotencyKey: `djiwapay-withdrawal-${crypto.randomUUID()}` }) });
  const payload = await response.json().catch(() => ({})) as WalletWithdrawalResult;
  if (!response.ok || !payload.success) throw new Error(payload.error || "WITHDRAWAL_REQUEST_FAILED");
  return payload;
}

export type PostpaidProduct = { code: string; name: string; type: string; status: "active" | "inactive"; fee?: number; commission?: number };
export type PostpaidInquiry = { refId: string; serviceType: string; productCode: string; customerNumber: string; customerName?: string; period?: string; billAmount: number; adminFee: number; totalAmount: number; status: "pending" | "success" | "failed"; message?: string };
export type PostpaidPaymentResult = { success: boolean; status?: "pending" | "success" | "failed"; data?: PostpaidInquiry & { serialNumber?: string; reference?: string }; error?: string };
async function postpaidRequest<T>(body: Record<string, unknown>): Promise<T> {
  const endpoint = body.action === "price-list" ? "catalog" : String(body.action);
  const response = await fetch("/api/pay-bridge/ppob/postpaid/" + endpoint, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as T & { error?: string; success?: boolean };
  if (!response.ok && !payload.error) throw new Error("PPOB pascabayar belum dapat diproses");
  return payload;
}
export async function readPostpaidCatalog(serviceType: "pln" | "pdam"): Promise<PostpaidProduct[]> {
  const payload = await postpaidRequest<{ success: boolean; data?: { products?: PostpaidProduct[] }; error?: string }>({ action: "price-list", kind: "postpaid", service_type: serviceType });
  const products = payload.data?.products;
  if (!payload.success || !Array.isArray(products)) throw new Error(payload.error || "Katalog pascabayar tidak valid");
  return products.filter((item) => item.status === "active");
}
export async function inquirePostpaid(serviceType: "pln" | "pdam", productCode: string, customerNumber: string): Promise<PostpaidInquiry> {
  const payload = await postpaidRequest<{ success: boolean; data?: PostpaidInquiry; error?: string }>({ action: "inquiry", serviceType, productCode, customerNumber });
  if (!payload.success || !payload.data) throw new Error(payload.error || "Inquiry tagihan gagal");
  return payload.data;
}
export async function payPostpaid(refId: string): Promise<PostpaidPaymentResult> {
  return postpaidRequest<PostpaidPaymentResult>({ action: "payment", refId, paymentMethod: "wallet" });
}
export async function checkPostpaidStatus(refId: string): Promise<PostpaidPaymentResult> {
  return postpaidRequest<PostpaidPaymentResult>({ action: "status", refId });
}
