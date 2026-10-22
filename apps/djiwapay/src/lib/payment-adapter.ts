import type { CustomerProfile } from "./identity-adapter";
export async function createTopup(_profile: CustomerProfile, amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 1000) throw new Error("Nominal minimal Rp1.000");
  const response = await fetch("/api/pay-bridge/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "topup", amount }) });
  const payload = await response.json().catch(() => ({})) as { result?: { invoice_url?: string; invoice_id?: string }; error?: string };
  if (!response.ok || typeof payload.result?.invoice_url !== "string") throw new Error(payload.error || "Invoice top up tidak tersedia");
  return { invoiceUrl: payload.result.invoice_url, invoiceId: payload.result.invoice_id };
}
