type Row = Record<string, any>;
export async function deliveryRest(table: string, params: Record<string, string>, schema = "pos", patch?: Row): Promise<Row[]> {
  const url = Deno.env.get("YUMI_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("YUMI_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Delivery storage unavailable");
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": schema, "Content-Profile": schema, "Content-Type": "application/json", Prefer: "return=representation" };
  const request = () => fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}?${new URLSearchParams(params)}`, { method: patch ? "PATCH" : "GET", headers, body: patch ? JSON.stringify(patch) : undefined });
  let res = await request();
  if (!res.ok) {
    const error = await res.clone().json().catch(() => null);
    if (error?.code === "PGRST301") { delete headers.Authorization; res = await request(); }
  }
  if (!res.ok) throw new Error("Delivery storage unavailable");
  return res.json();
}
export function validateDeliveryConfig(value: unknown) {
  const c = value as Row;
  if (!c || typeof c.active !== "boolean" || !Array.isArray(c.couriers) || c.couriers.length < 1 || c.couriers.length > 2 || c.couriers.some((v: unknown) => v !== "gojek" && v !== "grab") || new Set(c.couriers).size !== c.couriers.length || !c.couriers.includes(c.defaultCourier) || !Number.isInteger(c.fallbackFee) || c.fallbackFee < 0 || c.fallbackFee > 1000000) throw new Error("Invalid delivery configuration");
  return { active: c.active as boolean, couriers: c.couriers as string[], defaultCourier: c.defaultCourier as string, fallbackFee: c.fallbackFee as number };
}
export async function getDeliveryConfig() {
  const [row] = await deliveryRest("customer_delivery_settings", { select: "is_enabled,allowed_couriers,default_courier,fallback_fee", singleton: "eq.true", limit: "1" });
  if (!row) throw new Error("Delivery storage unavailable");
  return validateDeliveryConfig({ active: row.is_enabled, couriers: row.allowed_couriers, defaultCourier: row.default_courier, fallbackFee: row.fallback_fee });
}
