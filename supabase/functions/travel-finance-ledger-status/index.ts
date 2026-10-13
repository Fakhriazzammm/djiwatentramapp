/**
 * Status endpoint for the Travel finance book.
 *
 * The Travel host must be able to answer "does the ledger already hold this order?" without holding
 * the Supabase service-role key, so this function owns that read and authenticates callers with the
 * same shared settlement secret. It only ever reads finance.travel_transactions (never the F&B book),
 * which keeps the two books isolated.
 */

const INTERNAL_SECRET_HEADER = "x-djiwa-travel-settlement-secret";
const MAX_ORDERS = 200;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function constantTimeEqual(supplied: string, configured: string) {
  const left = new TextEncoder().encode(supplied);
  const right = new TextEncoder().encode(configured);
  if (left.length === 0 || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("origin") || req.headers.get("referer")) return json({ error: "server_only" }, 403);

  const configured = Deno.env.get("DJIWA_TRAVEL_SETTLEMENT_SECRET")?.trim() || "";
  if (!configured) return json({ error: "gateway_not_configured" }, 503);
  const supplied = (req.headers.get(INTERNAL_SECRET_HEADER) ?? "").trim();
  if (!constantTimeEqual(supplied, configured)) return json({ error: "unauthorized" }, 401);

  let body: { orderIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 128)
        .slice(0, MAX_ORDERS)
    : [];
  if (orderIds.length === 0) return json({ error: "invalid_request" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "ledger_not_configured" }, 503);

  const sourceIds = orderIds.map((orderId) => `fin_mayar_${orderId}`);
  const query = new URLSearchParams({
    select: "source_id",
    source_id: `in.(${sourceIds.map((sourceId) => `"${sourceId}"`).join(",")})`,
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/travel_transactions?${query.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      // PostgREST picks the schema from the profile header; without it the F&B book (public) is used.
      "Accept-Profile": "finance",
    },
  });
  if (!response.ok) {
    console.error("travel finance ledger status failed", { status: response.status });
    return json({ error: "ledger_unavailable" }, 502);
  }

  const rows = (await response.json()) as Array<{ source_id?: unknown }>;
  const found = new Set(
    rows
      .map((row) => String(row.source_id ?? ""))
      .filter((sourceId) => sourceId.startsWith("fin_mayar_"))
      .map((sourceId) => sourceId.slice("fin_mayar_".length)),
  );
  return json({
    ok: true,
    checked: orderIds.length,
    found: orderIds.filter((orderId) => found.has(orderId)).length,
    missing: orderIds.filter((orderId) => !found.has(orderId)),
  });
});

export { INTERNAL_SECRET_HEADER, MAX_ORDERS };
