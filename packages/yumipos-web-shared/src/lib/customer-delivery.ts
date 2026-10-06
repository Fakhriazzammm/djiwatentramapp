export type DeliveryConfig = { active: boolean; couriers: Array<"gojek" | "grab">; defaultCourier: "gojek" | "grab"; fallbackFee: number };
export class DeliveryApiError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
// Raw fetch preserves structured HTTP errors so intentional disablement never becomes a fallback quote.
export async function deliveryApi<T>(fn: "delivery-admin" | "biteship-rates", body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) throw new DeliveryApiError(data?.error?.code ?? "HTTP_ERROR", res.status, data?.error?.message ?? "Layanan delivery tidak tersedia");
  if (!data) throw new DeliveryApiError("INVALID_RESPONSE", 502, "Respons delivery tidak valid");
  return data as T;
}
