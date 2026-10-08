export type DeliveryConfig = { active: boolean; couriers: Array<"gojek" | "grab">; defaultCourier: "gojek" | "grab"; fallbackFee: number };
export class DeliveryApiError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
// Raw fetch preserves structured HTTP errors so intentional disablement never becomes a fallback quote.
export async function deliveryApi<T>(fn: "delivery-admin" | "biteship-rates", body: Record<string, unknown>): Promise<T> {
  const url = import.meta.env.VITE_SUPABASE_URL ?? "https://supabase.yumme.id";
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!key) throw new DeliveryApiError("NOT_CONFIGURED", 503, "Layanan delivery belum dikonfigurasi");
  const res = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: key }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) throw new DeliveryApiError(data?.error?.code ?? "HTTP_ERROR", res.status, data?.error?.message ?? "Layanan delivery tidak tersedia");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new DeliveryApiError("INVALID_RESPONSE", 502, "Respons delivery tidak valid");
  return data as T;
}
