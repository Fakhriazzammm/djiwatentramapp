import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  authorizeLedgerSecret,
  buildTravelBookReport,
  INTERNAL_SECRET_HEADER,
  normalizeBookRows,
  parseLedgerRequest,
  type LedgerExpenseRequest,
} from "./core.ts";

const MAX_ROWS = 2000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function requestIsBrowserOrigin(req: Request): boolean {
  return Boolean(req.headers.get("origin") || req.headers.get("referer") || req.headers.get("sec-fetch-site"));
}

function databaseConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("canonical database configuration is missing");
  return { supabaseUrl, serviceRoleKey };
}

/** Reads the Travel book only; the finance schema keeps it isolated from the F&B book. */
async function readTravelBook(days: number) {
  const { supabaseUrl, serviceRoleKey } = databaseConfig();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const query = new URLSearchParams({
    select: "source_id,tx_type,amount,category,merchant,description,tx_date,status",
    tx_date: `gte.${since}`,
    order: "tx_date.desc",
    limit: String(MAX_ROWS + 1),
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/travel_transactions?${query.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      // PostgREST selects the schema for reads with Accept-Profile (Content-Profile only covers writes).
      "Accept-Profile": "finance",
    },
  });
  if (!response.ok) throw new Error("travel book is unavailable");
  return await response.json();
}

/** Expenses are written through the same canonical contract as settlements, never directly. */
async function recordExpense(request: LedgerExpenseRequest) {
  const { supabaseUrl, serviceRoleKey } = databaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_transaction`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Profile": "finance",
    },
    body: JSON.stringify({
      p_source_app: "djiwa_travel",
      p_source_id: request.sourceId,
      p_tx_type: "expense",
      p_amount: request.amount,
      p_category: request.category,
      p_description: request.description,
      p_merchant: request.merchant,
      p_tx_date: request.occurredAtMs,
      p_payment_method: request.paymentMethod,
      p_status: "completed",
      p_transaction_kind: "expense",
      p_metadata: { ...request.metadata, source: "djiwa_travel" },
      p_raw: { kind: "travel_finance_expense", sourceId: request.sourceId },
    }),
  });
  if (!response.ok) throw new Error("canonical RPC failed");
  const result = await response.json();
  const record = (Array.isArray(result) ? result[0] : result) as Record<string, unknown> | null;
  return {
    ok: true as const,
    duplicate: record?.["duplicate"] === true,
    sourceId: String(record?.["source_id"] ?? request.sourceId),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (requestIsBrowserOrigin(req)) return json({ error: "server_only" }, 403);

  const configuredSecret = Deno.env.get("DJIWA_TRAVEL_SETTLEMENT_SECRET")?.trim() || "";
  const suppliedSecret = req.headers.get(INTERNAL_SECRET_HEADER)?.trim() || "";
  const authResult = authorizeLedgerSecret(suppliedSecret, configuredSecret);
  if (authResult === "missing_config") return json({ error: "gateway_not_configured" }, 503);
  if (authResult === "unauthorized") return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  let parsed;
  try {
    parsed = parseLedgerRequest(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    return json({ error: "invalid_request", detail: message }, 400);
  }

  try {
    if (parsed.kind === "expense") return json(await recordExpense(parsed), 200);
    const rows = await readTravelBook(parsed.days);
    const { entries, truncated } = normalizeBookRows(rows, MAX_ROWS);
    return json(buildTravelBookReport(entries, parsed.days, truncated), 200);
  } catch (error) {
    console.error("travel finance ledger failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return json({ error: "ledger_unavailable" }, 502);
  }
});
