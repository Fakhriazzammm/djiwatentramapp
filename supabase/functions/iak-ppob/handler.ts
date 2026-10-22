import {
  buildCheckStatusRequest,
  buildPostpaidInquiryRequest,
  buildPostpaidPaymentRequest,
  buildPrepaidRequest,
  buildSignature,
  normalizePostpaidProduct,
  normalizePrepaidProduct,
  normalizeProviderStatus,
  type IakServiceKind,
  type IakServiceType,
} from "./adapter.ts";

type Json = Record<string, unknown>;
export type IakFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type IakHandlerConfig = { username: string; apiKey: string; baseUrl: string; fetcher?: IakFetch };
export type IakHandlerResult = { body: Json; status: number };

const postpaidServices = new Set<IakServiceType>(["pln", "pdam", "bpjs", "tv", "multifinance", "internet", "gas", "pbb", "tax", "insurance", "bpjs-ketenagakerjaan"]);
const prepaidServices = new Set<IakServiceType>(["pulsa", "data", "pln", "game", "esim"]);

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const numberValue = (value: unknown) => { const valueAsNumber = Number(value); return Number.isFinite(valueAsNumber) ? valueAsNumber : 0; };
const dataOf = (payload: unknown): Json => payload && typeof payload === "object" && "data" in payload && payload.data && typeof payload.data === "object" ? payload.data as Json : (payload as Json);
const success = (data: unknown): IakHandlerResult => ({ body: { success: true, data: data as Json }, status: 200 });
const failure = (code: string, message: string, status = 400): IakHandlerResult => ({ body: { success: false, error: { code, message } }, status });

export function createIakActionHandler(config: IakHandlerConfig) {
  const fetcher = config.fetcher ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function provider(path: string, body: Json) {
    const response = await fetcher(`${baseUrl}/${path.replace(/^\//, "")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`IAK HTTP ${response.status}`);
    return payload;
  }

  return async function handle(body: Json): Promise<IakHandlerResult> {
    if (!config.username || !config.apiKey) return failure("IAK_NOT_CONFIGURED", "IAK username/API key belum dikonfigurasi sebagai secret server", 503);
    const action = text(body.action);
    const kind = (text(body.kind) || "prepaid") as IakServiceKind;
    const serviceType = text(body.service_type || body.serviceType) as IakServiceType;
    const refId = text(body.ref_id || body.refId);
    try {
      if (action === "check-balance") return success(await provider("check-balance", { username: config.username, sign: buildSignature(config.username, config.apiKey, "bl") }));
      if (action === "price-list") {
        if (kind === "postpaid") {
          if (!postpaidServices.has(serviceType)) return failure("UNKNOWN_SERVICE_TYPE", "Jenis layanan pascabayar tidak didukung");
          const payload = await provider("v1/bill/list", { commands: "pln", status: "active", username: config.username, sign: buildSignature(config.username, config.apiKey, "pl") });
          const raw = Array.isArray(dataOf(payload).products) ? dataOf(payload).products as Json[] : Array.isArray(dataOf(payload).data) ? dataOf(payload).data as Json[] : [];
          return success({ ...payload as Json, products: raw.map(normalizePostpaidProduct) });
        }
        if (serviceType && !prepaidServices.has(serviceType)) return failure("UNKNOWN_SERVICE_TYPE", "Jenis layanan prabayar tidak didukung");
        const payload = await provider("pricelist", { username: config.username, sign: buildSignature(config.username, config.apiKey, "pl"), status: "active" });
        const raw = Array.isArray(dataOf(payload).products) ? dataOf(payload).products as Json[] : [];
        return success({ ...payload as Json, products: raw.map(normalizePrepaidProduct) });
      }
      if (action === "top-up") {
        const customerId = text(body.customer_id); const productCode = text(body.product_code);
        if (kind !== "prepaid" || !refId || !customerId || !productCode) return failure("INVALID_TOPUP", "kind prabayar, ref_id, customer_id, dan product_code wajib diisi");
        const request = buildPrepaidRequest("top-up", { serviceType: serviceType || undefined, refId, customerId, productCode });
        return success(await provider(request.path, { username: config.username, ...request.body, sign: buildSignature(config.username, config.apiKey, refId) }));
      }
      if (action === "inquiry" || action === "payment") {
        const productCode = text(body.product_code); const customerNumber = text(body.customer_number || body.customer_id);
        if (kind !== "postpaid" || !serviceType || !productCode || !customerNumber || !refId) return failure("INVALID_POSTPAID_REQUEST", "kind pascabayar, service_type, product_code, customer_number, dan ref_id wajib diisi");
        const request = action === "inquiry" ? buildPostpaidInquiryRequest({ serviceType, productCode, customerNumber, refId }) : buildPostpaidPaymentRequest({ serviceType, productCode, customerNumber, refId });
        const payload = await provider(request.path, { username: config.username, ...request.body, sign: buildSignature(config.username, config.apiKey, refId) });
        const raw = dataOf(payload);
        return success({ refId, serviceType, productCode, customerNumber, customerName: text(raw.customer_name || raw.name) || undefined, period: text(raw.period || raw.periode) || undefined, billAmount: numberValue(raw.bill_amount || raw.bill || raw.tagihan), adminFee: numberValue(raw.admin_fee || raw.admin), totalAmount: numberValue(raw.total_amount || raw.total), status: normalizeProviderStatus(raw.status || raw.rc), message: text(raw.message), raw: payload });
      }
      if (action === "check-status") {
        if (!refId) return failure("INVALID_STATUS_REQUEST", "ref_id wajib diisi");
        const request = buildCheckStatusRequest({ kind, refId, serviceType: serviceType || undefined });
        const payload = await provider(request.path, { username: config.username, ...request.body, sign: buildSignature(config.username, config.apiKey, refId) });
        const raw = dataOf(payload);
        return success({ refId, status: normalizeProviderStatus(raw.status || raw.rc), message: text(raw.message), serialNumber: text(raw.sn), raw: payload });
      }
      return failure("UNKNOWN_ACTION", "Gunakan check-balance, price-list, inquiry, top-up, payment, atau check-status");
    } catch (error) {
      if (error instanceof Error && ["UNKNOWN_SERVICE_TYPE", "INVALID_PREPAID_REQUEST", "INVALID_POSTPAID_REQUEST", "INVALID_STATUS_REQUEST"].includes(error.message)) {
        return failure(error.message, "Parameter layanan PPOB tidak valid");
      }
      console.error("iak provider request failed", error instanceof Error ? error.message : "unknown error");
      return failure("IAK_PROVIDER_ERROR", "PPOB provider tidak tersedia", 502);
    }
  };
}
