import { createHash } from "node:crypto";

export type IakServiceKind = "prepaid" | "postpaid";
export type IakServiceType = "pulsa" | "data" | "pln" | "pdam" | "bpjs" | "tv" | "multifinance" | "internet" | "gas" | "pbb" | "tax" | "insurance" | "bpjs-ketenagakerjaan" | "game" | "esim";
export type IakProviderStatus = "pending" | "success" | "failed";
export type IakNormalizedProduct = { code: string; name: string; nominal?: string; price?: number; type: string; category?: string; activePeriod?: string; status: "active" | "inactive"; iconUrl?: string; fee?: number; commission?: number };
export type IakInquiry = { refId: string; serviceType: IakServiceType; productCode: string; customerNumber: string; customerName?: string; period?: string; billAmount: number; adminFee: number; totalAmount: number; status: IakProviderStatus; raw: Record<string, unknown> };
export type IakTransactionResult = { refId: string; status: IakProviderStatus; productCode?: string; customerNumber?: string; amount?: number; message?: string; serialNumber?: string; pin?: string; activationCode?: string; providerTransactionId?: string; responseCode?: string; raw: Record<string, unknown> };

const postpaidServices = new Set<IakServiceType>(["pln", "pdam", "bpjs", "tv", "multifinance", "internet", "gas", "pbb", "tax", "insurance", "bpjs-ketenagakerjaan"]);
const prepaidServices = new Set<IakServiceType>(["pulsa", "data", "pln", "game", "esim"]);

export function buildSignature(username: string, apiKey: string, refId: string) { return createHash("md5").update(`${username}${apiKey}${refId}`).digest("hex"); }
function assertService(serviceType: string, kind: IakServiceKind) {
  const known = kind === "postpaid" ? postpaidServices : prepaidServices;
  if (!known.has(serviceType as IakServiceType)) throw new Error("UNKNOWN_SERVICE_TYPE");
  return serviceType as IakServiceType;
}
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function statusValue(value: unknown): "active" | "inactive" { return String(value) === "1" || String(value).toLowerCase() === "active" ? "active" : "inactive"; }

export function normalizePrepaidProduct(payload: Record<string, unknown>): IakNormalizedProduct {
  return { code: String(payload.product_code ?? ""), name: String(payload.product_description ?? payload.product_code ?? ""), nominal: String(payload.product_nominal ?? ""), price: numberValue(payload.product_price ?? payload.price), type: String(payload.product_type ?? ""), category: String(payload.product_category ?? ""), activePeriod: String(payload.active_period ?? payload.masaaktif ?? ""), status: statusValue(payload.status), iconUrl: typeof payload.icon_url === "string" ? payload.icon_url : undefined };
}

export function normalizePostpaidProduct(payload: Record<string, unknown>): IakNormalizedProduct {
  return { code: String(payload.code ?? ""), name: String(payload.name ?? payload.code ?? ""), type: String(payload.type ?? ""), status: statusValue(payload.status), fee: numberValue(payload.fee), commission: numberValue(payload.komisi ?? payload.commission) };
}

export function normalizeProviderStatus(value: unknown): IakProviderStatus {
  const status = String(value ?? "").toLowerCase();
  if (["1", "success", "00", "paid", "completed"].includes(status)) return "success";
  if (["2", "failed", "fail", "cancelled", "canceled"].includes(status)) return "failed";
  return "pending";
}

type PrepaidInput = { serviceType?: string; refId: string; customerId: string; productCode: string };
export function buildPrepaidRequest(operation: "top-up", input: PrepaidInput) {
  if (input.serviceType) assertService(input.serviceType, "prepaid");
  if (!input.refId || !input.customerId || !input.productCode) throw new Error("INVALID_PREPAID_REQUEST");
  return { path: "top-up", body: { ref_id: input.refId, customer_id: input.customerId, product_code: input.productCode } };
}

type PostpaidInput = { serviceType: string; productCode: string; customerNumber: string; refId: string };
export function buildPostpaidInquiryRequest(input: PostpaidInput) {
  assertService(input.serviceType, "postpaid");
  if (!input.productCode || !input.customerNumber || !input.refId) throw new Error("INVALID_POSTPAID_REQUEST");
  return { path: "v1/bill/check", body: { commands: "inq-pasca", code: input.productCode, hp: input.customerNumber, ref_id: input.refId } };
}

export function buildPostpaidPaymentRequest(input: { serviceType: string; providerTransactionId: string }) {
  assertService(input.serviceType, "postpaid");
  if (!/^\d+$/.test(input.providerTransactionId)) throw new Error("INVALID_POSTPAID_REQUEST");
  return { path: "v1/bill/check", body: { commands: "pay-pasca", tr_id: input.providerTransactionId } };
}

export function buildCheckStatusRequest(input: { kind: IakServiceKind; refId: string; serviceType?: string }) {
  if (!input.refId) throw new Error("INVALID_STATUS_REQUEST");
  if (input.kind === "postpaid") {
    assertService(input.serviceType ?? "", "postpaid");
    return { path: "v1/bill/check", body: { commands: "checkstatus", ref_id: input.refId } };
  }
  return { path: "check-status", body: { ref_id: input.refId } };
}

export function redactProviderPayload(payload: Record<string, unknown>) {
  const redacted = { ...payload };
  for (const key of ["pin", "activation_code", "api_key", "sign"]) if (key in redacted) redacted[key] = "[REDACTED]";
  for (const key of ["customer_id", "customer_number", "hp", "account_number"]) if (typeof redacted[key] === "string") {
    const value = String(redacted[key]); redacted[key] = value.length > 4 ? `••••••${value.slice(-4)}` : "••••";
  }
  return redacted;
}
