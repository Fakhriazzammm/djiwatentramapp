// Client for the Djiwa Pay wallet endpoints, called from the customer storefront with its own session.
// Same-origin (/api/pay-bridge is proxied by nginx); the server accepts the Better Auth cookie and still demands the PIN for payments.

export type PayResult<T = Record<string, unknown>> = { ok: boolean; http: number; error?: string; attemptsLeft?: number; lockedUntil?: string } & T;

async function call<T = Record<string, unknown>>(path: string, body?: Record<string, unknown>): Promise<PayResult<T>> {
	try {
		const res = await fetch(`/api/pay-bridge/${path}`, { method: body ? "POST" : "GET", credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
		const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
		const error = typeof json.error === "string" ? json.error : undefined;
		return { ...(json as T), ok: res.ok && json.success !== false, http: res.status, error: res.ok && json.success !== false ? undefined : error ?? (res.status === 401 ? "UNAUTHORIZED" : "REQUEST_FAILED") } as PayResult<T>;
	} catch {
		return { ok: false, http: 0, error: "NETWORK" } as PayResult<T>;
	}
}

const MESSAGES: Record<string, string> = {
	NETWORK: "Koneksi bermasalah. Coba lagi.", UNAUTHORIZED: "Sesi berakhir. Masuk lagi untuk melanjutkan.", INVALID_PHONE: "Nomor HP tidak valid.",
	RECIPIENT_NOT_FOUND: "Nomor ini belum terdaftar di Djiwa.", RECIPIENT_AMBIGUOUS: "Nomor terdaftar lebih dari satu akun. Hubungi admin.", SELF_TRANSFER: "Tidak bisa kirim ke diri sendiri.",
	INVALID_TRANSFER: "Data transfer tidak valid.", INSUFFICIENT_BALANCE: "Saldo tidak cukup.", WALLET_BLOCKED: "Wallet sedang diblokir.", PROFILE_INCOMPLETE: "Lengkapi profil terlebih dulu.",
	INVALID_INPUT: "Data belum lengkap.", WEAK_PIN: "PIN terlalu mudah ditebak.", INVALID_PIN: "PIN harus 6 angka.", PIN_EXISTS: "PIN sudah dibuat.",
	PIN_LOCKED: "PIN terkunci sementara karena terlalu banyak salah.", REQUEST_FAILED: "Permintaan gagal. Coba lagi.", INVALID_INQUIRY: "Tagihan belum valid. Cek ulang nomor pelanggan.",
};
export const payMessage = (code?: string) => (code && MESSAGES[code]) || (code && !/^[A-Z_]+$/.test(code) ? code : "Permintaan gagal. Coba lagi.");
export const isPinError = (code?: string) => code === "PIN_INVALID" || code === "PIN_REQUIRED" || code === "PIN_LOCKED" || code === "PIN_NOT_SET";

// ---- PIN
export const pinStatus = () => call<{ set?: boolean; lockedUntil?: string | null }>("pin/status");
export const pinSet = (pin: string) => call("pin/set", { pin });

// ---- Transfer
export function normalizePhone(value: string) {
	const d = value.trim().replace(/\D/g, "");
	return d.startsWith("0") ? `62${d.slice(1)}` : d.startsWith("62") ? d : "";
}
export const formatPhone = (v: string) => { const p = normalizePhone(v); return p ? `0${p.slice(2)}`.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3") : v; };
export const isPhone = (v: string) => /^628\d{8,11}$/.test(normalizePhone(v));
export const resolveRecipient = (phone: string) => call<{ recipient?: { name: string; phone: string } }>("wallet", { action: "resolve-recipient", phone: normalizePhone(phone) });
export const transfer = (phone: string, amount: number, note: string, pin: string, idempotencyKey: string) =>
	call<{ recipient?: { name: string } }>("wallet", { action: "transfer", phone: normalizePhone(phone), amount, note, idempotencyKey, pin });
export const TRANSFER_MIN = 1000;
export const TRANSFER_MAX = 10_000_000;

const QR_HOSTS = new Set(["djiwapay.web.id", "pay.djiwatentram.web.id"]);
/** Reads a Djiwa Pay receive QR: `djiwapay://transfer?phone=` or the equivalent https link. Returns a 62… phone or null. */
export function parseRecipientQr(value: string): string | null {
	try {
		const url = new URL(value.trim());
		let phone: string | null = null;
		if (url.protocol === "djiwapay:") phone = url.hostname === "transfer" ? url.searchParams.get("phone") : null;
		else if ((url.protocol === "https:" || url.protocol === "http:") && QR_HOSTS.has(url.hostname)) phone = url.pathname.replace(/\/+$/, "") === "/wallet/transfer" ? url.searchParams.get("phone") : null;
		const n = normalizePhone(phone ?? "");
		return /^628\d{8,11}$/.test(n) ? n : null;
	} catch { return null; }
}

// ---- PPOB (prepaid catalog is public; payments are PIN-guarded)
export type PpobProduct = { product_code: string; product_description: string; product_nominal: string; product_price: number; product_type: string; status: string; icon_url?: string };
export async function ppobCatalog(): Promise<PpobProduct[]> {
	const res = await fetch("https://api.djiwatentram.web.id/api/ppob/iak/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "price-list" }), signal: AbortSignal.timeout(50_000) }).catch(() => null);
	if (!res?.ok) throw new Error("Katalog belum bisa dimuat. Coba lagi.");
	const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { data?: { pricelist?: PpobProduct[] } } };
	const list = json.data?.data?.pricelist;
	if (!json.success || !Array.isArray(list)) throw new Error("Format katalog tidak valid.");
	return list.filter((p) => p.status === "active");
}
export function productName(p: PpobProduct) {
	const nominal = String(p.product_nominal ?? "").trim();
	if (nominal && nominal.toLowerCase() !== "nan") {
		const n = Number(nominal);
		return Number.isFinite(n) ? `${({ pln: "Token PLN", etoll: "Saldo", pulsa: "Pulsa" } as Record<string, string>)[p.product_type.toLowerCase()] ?? "Paket"} ${n.toLocaleString("id-ID")}` : nominal;
	}
	return p.product_description.trim() || p.product_code;
}
export function operatorOf(p: PpobProduct) {
	if (!["pulsa", "data"].includes(p.product_type.toLowerCase())) return "Lainnya";
	const s = `${p.product_description} ${p.product_code} ${p.icon_url ?? ""}`.toLowerCase();
	for (const [k, v] of [["axis", "AXIS"], ["indosat", "Indosat"], ["isat", "Indosat"], ["byu", "by.U"], ["telkomsel", "Telkomsel"], ["tsel", "Telkomsel"], ["smartfren", "Smartfren"], ["tri", "Tri"], ["three", "Tri"]] as const) if (s.includes(k)) return v;
	return "Lainnya";
}

export type PpobService = { key: string; tab: string; label: string; placeholder: string; min: number; max: number; group: number[] };
export const PPOB_SERVICES: PpobService[] = [
	{ key: "pulsa", tab: "Pulsa", label: "Nomor HP", placeholder: "0812 3456 7890", min: 9, max: 14, group: [4, 4, 4] },
	{ key: "data", tab: "Paket Data", label: "Nomor HP", placeholder: "0812 3456 7890", min: 9, max: 14, group: [4, 4, 4] },
	{ key: "pln", tab: "Token PLN", label: "No. meter / ID pelanggan", placeholder: "32123456789", min: 11, max: 12, group: [4, 4, 4] },
	{ key: "etoll", tab: "e-Wallet", label: "Nomor HP atau kartu", placeholder: "0812 3456 7890", min: 8, max: 19, group: [] },
];
export function groupDigits(value: string, group: number[]) {
	if (!group.length) return value;
	const out: string[] = []; let i = 0;
	for (const g of group) { if (i >= value.length) break; out.push(value.slice(i, i + g)); i += g; }
	if (i < value.length) out.push(value.slice(i));
	return out.join(" ");
}
export const ppobPurchase = (productCode: string, customerNumber: string, pin: string) =>
	call<{ status?: "success" | "pending" | "failed"; message?: string; serialNumber?: string | null; refId?: string }>("ppob/purchase", { productCode, customerNumber, pin });

export type PostpaidProduct = { code: string; name: string; type: string; status: string };
export type PostpaidInquiry = { refId: string; customerName?: string; period?: string; billAmount: number; adminFee: number; totalAmount: number; customerNumber: string; productCode: string; serviceType: string };
export const postpaidCatalog = (serviceType: "pln" | "pdam") => call<{ data?: { products?: PostpaidProduct[] } }>("ppob/postpaid/catalog", { action: "price-list", kind: "postpaid", service_type: serviceType });
export const postpaidInquiry = (serviceType: "pln" | "pdam", productCode: string, customerNumber: string) => call<{ data?: PostpaidInquiry }>("ppob/postpaid/inquiry", { action: "inquiry", serviceType, productCode, customerNumber });
export const postpaidPay = (refId: string, pin: string) => call<{ status?: "success" | "pending" | "failed"; data?: { serialNumber?: string }; message?: string }>("ppob/postpaid/payment", { action: "payment", refId, paymentMethod: "wallet", pin });
