const API_BASE = import.meta.env?.VITE_MAYAR_API_BASE ?? "https://api.mayar.club/hl/v1";
const API_KEY = import.meta.env?.VITE_MAYAR_API_KEY ?? "";
const WEBTOKEN = import.meta.env?.VITE_MAYAR_WEBTOKEN ?? "";
const AUTH_SCHEME = import.meta.env?.VITE_MAYAR_AUTH_SCHEME ?? "Bearer";
const DEFAULT_EMAIL_ENV = import.meta.env?.VITE_MAYAR_DEFAULT_EMAIL ?? "";
const DEFAULT_MOBILE_ENV = import.meta.env?.VITE_MAYAR_DEFAULT_MOBILE ?? "";

async function callMayar<T>(path: string, init: RequestInit & { timeoutMs?: number; retries?: number } = {}): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const timeoutMs = init.timeoutMs ?? 1500;
  const retries = init.retries ?? 2;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `${AUTH_SCHEME} ${API_KEY}`,
    webtoken: WEBTOKEN,
    ...(init.headers || {}),
  };

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      if (retries > 0 && (res.status === 429 || (res.status >= 500 && res.status < 600))) {
        await new Promise((r) => setTimeout(r, 250 * (3 - retries)));
        return callMayar<T>(path, { ...init, retries: retries - 1 });
      }
      let detail = "";
      try {
        const json = await res.json();
        const sc = json?.statusCode ?? res.status;
        const msg = json?.messages ?? json?.message ?? res.statusText;
        const dataStr = json?.data ? `; data=${JSON.stringify(json.data)}` : "";
        detail = `Mayar API error ${sc}: ${msg}${dataStr}`;
      } catch {
        const text = await res.text().catch(() => "");
        detail = `Mayar API error ${res.status}: ${text || res.statusText}`;
      }
      throw new Error(detail);
    }
    const data = (await res.json().catch(() => ({}))) as T;
    return data;
  } catch (err: unknown) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const isNetwork = err instanceof Error && err.message?.includes("network");
    if (retries > 0 && (isAbort || isNetwork)) {
      await new Promise((r) => setTimeout(r, 200 * (3 - retries)));
      return callMayar<T>(path, { ...init, retries: retries - 1 });
    }
    throw err;
  }
}

export interface MayarPaymentResponse {
  success?: boolean;
  message?: string;
  id?: string;
  transactionId?: string;
  paymentId?: string;
  invoiceNumber?: string;
  payment_link?: string;
  link?: string;
  statusCode?: number;
  messages?: string;
}

export interface MayarInvoiceDetailResponse {
  statusCode?: number;
  messages?: string;
  data?: {
    id?: string;
    amount?: number;
    status?: string;
    link?: string;
    customerId?: string;
    customer?: { id?: string; email?: string; mobile?: string; name?: string };
    transactions?: any[];
  };
}

export function getDefaultContact(): { email: string; mobile: string } {
  const email = (DEFAULT_EMAIL_ENV || "").trim();
  const mobile = (DEFAULT_MOBILE_ENV || "").trim();
  const emailOk = /.+@.+\..+/.test(email);
  const mobileOk = mobile.replace(/\D/g, "").length >= 10;
  return {
    email: emailOk ? email : "no-reply@restaurant.local",
    mobile: mobileOk ? mobile : "085000000000",
  };
}

export async function mayarCreateInvoiceViaItems(payload: {
  name: string;
  email?: string;
  mobile: string;
  redirectUrl?: string;
  description?: string;
  expiredAt?: string;
  items: { quantity: number; rate: number; description: string }[];
}): Promise<{ success: boolean; id?: string; transactionId?: string; link?: string; message?: string }> {
  const fallback = getDefaultContact();
  const body = {
    name: payload.name,
    email: (payload.email ?? fallback.email) || fallback.email,
    mobile: payload.mobile || fallback.mobile,
    redirectUrl: payload.redirectUrl ?? "",
    description: payload.description ?? "",
    expiredAt: payload.expiredAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    items: payload.items,
  };
  try {
    const resp = await callMayar<{ statusCode?: number; messages?: string; data?: { id?: string; transactionId?: string; link?: string } }>(
      "invoice/create",
      { method: "POST", body: JSON.stringify(body), timeoutMs: 2500 }
    );
    const success = resp?.statusCode === 200 || resp?.messages === "success";
    return { success, id: resp?.data?.id, transactionId: resp?.data?.transactionId, link: resp?.data?.link, message: resp?.messages };
  } catch (err: any) {
    let message = err?.message || "Gagal membuat invoice Mayar";
    const match = /Mayar API error\s+\d+:\s+(.+)/.exec(message || "");
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        const msgs = Array.isArray((parsed as any)?.data)
          ? (parsed as any).data.map((d: any) => d?.message || d?.type).filter(Boolean).join("; ")
          : (parsed as any)?.messages || message;
        message = `Validasi Mayar: ${msgs}`;
      } catch {
        // biarkan message apa adanya
      }
    }
    return { success: false, message };
  }
}

export async function mayarEditInvoice(payload: {
  id: string;
  redirectUrl?: string;
  description?: string;
  items?: { quantity: number; rate: number; description: string }[];
}): Promise<{ success: boolean; id?: string; transactionId?: string; link?: string; message?: string }> {
  const body = {
    id: payload.id,
    redirectUrl: payload.redirectUrl ?? "",
    description: payload.description ?? "",
    items: payload.items ?? [],
  };
  try {
    const resp = await callMayar<{ statusCode?: number; messages?: string; data?: { id?: string; transactionId?: string; link?: string } }>(
      "invoice/edit",
      { method: "POST", body: JSON.stringify(body), timeoutMs: 2500 }
    );
    const success = resp?.statusCode === 200 || resp?.messages === "success";
    return { success, id: resp?.data?.id, transactionId: resp?.data?.transactionId, link: resp?.data?.link, message: resp?.messages };
  } catch (err: any) {
    return { success: false, message: err?.message || "Gagal mengedit invoice Mayar" };
  }
}

export async function mayarListInvoices(sort?: "active" | "paid" | "closed"): Promise<any> {
  const path = sort ? `invoice?sort=${encodeURIComponent(sort)}` : "invoice";
  return callMayar<any>(path, { method: "GET", timeoutMs: 2500 });
}

export async function mayarGetTransaction(id: string): Promise<MayarInvoiceDetailResponse> {
  return callMayar<MayarInvoiceDetailResponse>(`invoice/${encodeURIComponent(id)}`, { method: "GET", timeoutMs: 2500 });
}

export async function mayarCancelTransaction(id: string): Promise<MayarPaymentResponse> {
  try {
    const closeResp = await callMayar<any>(`invoice/close/${encodeURIComponent(id)}`, { method: "GET", timeoutMs: 2500 });
    const ok = closeResp?.statusCode === 200 || closeResp?.messages === "success";
    if (ok) return { success: true, message: "Invoice ditutup" };
    return await callMayar<MayarPaymentResponse>(`transaction/${encodeURIComponent(id)}/cancel`, { method: "POST", timeoutMs: 2500 });
  } catch (err: any) {
    return { success: false, message: err?.message || "Pembatalan transaksi tidak didukung" };
  }
}

export function isMayarConfigured(): boolean {
  return !!(API_KEY && API_KEY.length > 0);
}
