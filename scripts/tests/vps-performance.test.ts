import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

// Execute the actual handler; only its external HTTP and Deno hosting boundaries
// are replaced. No production database or payment provider is contacted.
function loadFunction(path: string, fetcher: typeof fetch, settings: Record<string, string> = {}) {
  let handler: (req: Request) => Promise<Response>;
  if (process.env.PERF_FUNCTION_ROOT) path = path.replace("supabase/functions", process.env.PERF_FUNCTION_ROOT);
  const source = readFileSync(path, "utf8")
    .replace(/^import \{ corsHeaders \}.*;\r?\n/gm, "const corsHeaders = {};\n")
    .replace(/^import "jsr:.*";\r?\n/gm, "");
  const inlined = source.replace(/^import \{ brandMayarConfig, checkBrandTopup \} from "([^"]+)";$/m, (_line, modulePath: string) =>
    readFileSync(resolve(dirname(path), modulePath), "utf8").replace(/^export /gm, ""),
  );
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(inlined);
  const env: Record<string, string> = {
    SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-service",
    MAYAR_WEBHOOK_TOKEN: "test-webhook", MAYAR_API_KEY: "test-provider", ...settings,
  };
  new Function("Deno", "fetch", "globalThis", js)(
    { env: { get: (key: string) => env[key] }, serve: (fn: typeof handler) => { handler = fn; } },
    fetcher, { fetch: fetcher },
  );
  return (req: Request) => handler!(req);
}

describe("notification reconciliation", () => {
  test("filters the 24-hour window in the database, before paging order items", async () => {
    const requests: URL[] = [];
    const handler = loadFunction("supabase/functions/pos-notifications/index.ts", (async (input: string) => {
      const url = new URL(input); requests.push(url);
      return Response.json([]);
    }) as typeof fetch);
    const before = Date.now() - 86400000;
    const response = await handler(new Request("https://example/sync", {
      method: "POST", headers: { Authorization: "Bearer test-service" },
      body: JSON.stringify({ action: "sync_recent" }),
    }));
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(1);
    const filter = requests[0].searchParams.get("createdAt") ?? "";
    expect(filter.startsWith("gte.")).toBe(true);
    expect(Number(filter.slice(4))).toBeGreaterThanOrEqual(before);
    expect(Number(filter.slice(4))).toBeLessThanOrEqual(Date.now() - 86400000);
  });
  test("rejects unauthenticated sync without reading orders", async () => {
    const handler = loadFunction("supabase/functions/pos-notifications/index.ts", (async () => {
      throw new Error("unexpected database access");
    }) as typeof fetch);
    expect((await handler(new Request("https://example/sync", { method: "POST" }))).status).toBe(401);
  });
});

test("Mayar uses the due-selection RPC instead of rechecking every old pending invoice", async () => {
  const urls: string[] = [];
  const handler = loadFunction("supabase/functions/mayar-payment-processor/index.ts", (async (input: string) => {
    urls.push(input);
    return Response.json([]);
  }) as typeof fetch);
  const response = await handler(new Request("https://example/processor", {
    method: "POST", headers: { "x-webhook-token": "test-webhook" }, body: "{}",
  }));
  expect(response.status).toBe(200);
  expect(urls.some(url => url.endsWith("/rpc/wallet_topups_due_for_reconciliation"))).toBe(true);
  expect(urls.some(url => url.includes("customer_wallet_topups?"))).toBe(false);
});

for (const fixture of [
  { status: "paid", amount: 10000, shouldSettle: true },
  { status: "pending", amount: 10000, shouldSettle: false },
  { status: "paid", amount: 9999, shouldSettle: false },
]) test(`wallet recovery preserves settlement checks: ${fixture.status}, amount ${fixture.amount}`, async () => {
  const settlements: any[] = [];
  const handler = loadFunction("supabase/functions/mayar-payment-processor/index.ts", (async (input: string, init: RequestInit) => {
    if (input.endsWith("/rpc/wallet_topups_due_for_reconciliation")) return Response.json([
      { topup_id: "topup-a", transaction_id: "transaction-a", invoice_id: "invoice-a", status: "pending", amount: 10000 },
    ]);
    if (input.endsWith("/transactions/transaction-a")) return Response.json({ statusCode: 200, data: {
      id: "transaction-a", status: fixture.status, amount: fixture.amount, createdAt: 1793900000000,
    } });
    if (input.endsWith("/rpc/wallet_settle_topup")) {
      settlements.push(JSON.parse(String(init.body))); return Response.json({ settled: true });
    }
    return Response.json([]);
  }) as typeof fetch);
  const response = await handler(new Request("https://example/processor", {
    method: "POST", headers: { "x-webhook-token": "test-webhook" }, body: "{}",
  }));
  expect(response.status).toBe(200);
  expect(settlements.length).toBe(fixture.shouldSettle ? 1 : 0);
  if (fixture.shouldSettle) expect(settlements[0]).toMatchObject({ p_topup_id: "topup-a", p_transaction_id: "transaction-a" });
});

for (const fixture of [
  { status: "paid", amount: 100700, expected: "paid" },
  { status: "open", amount: 100700, expected: "pending" },
  { status: "paid", amount: 99900, expected: "review" },
]) test(`Brand top-up verifies stored invoice evidence: ${fixture.status}, amount ${fixture.amount}`, async () => {
  const updates: Record<string, unknown>[] = [];
  const requests: string[] = [];
  const handler = loadFunction("supabase/functions/mayar-payment-processor/index.ts", (async (input: string, init: RequestInit) => {
    requests.push(input);
    if (input.endsWith("/rpc/claim_mayar_payment_events")) return Response.json([
      { id: "delivery-a", payload: { data: { productId: "invoice-a", transactionId: "untrusted-id", status: "paid" } } },
    ]);
    if (input.endsWith("/rpc/kol_brand_topup_target")) return Response.json([
      { deposit_id: "deposit-a", invoice_id: "invoice-a", total: 100700 },
    ]);
    if (input.endsWith("/invoices/invoice-a")) return Response.json({ statusCode: 200, data: {
      id: "invoice-a", status: fixture.status, amount: 100700, transactionId: "transaction-a",
    } });
    if (input.endsWith("/transactions/transaction-a")) return Response.json({ statusCode: 200, data: {
      id: "transaction-a", status: "paid", amount: fixture.amount, paymentLink: { id: "invoice-a" },
    } });
    if (input.endsWith("/rpc/kol_brand_payment_result")) {
      updates.push(JSON.parse(String(init.body)));
      return Response.json({ status: fixture.expected });
    }
    return Response.json([]);
  }) as typeof fetch, {
    KOL_BRAND_PAYMENTS_ENABLED: "true", KOL_BRAND_MAYAR_ENV: "sandbox", KOL_BRAND_MAYAR_API_KEY: "test-brand-provider",
  });
  const response = await handler(new Request("https://example/processor", {
    method: "POST", headers: { "x-webhook-token": "test-webhook" }, body: "{}",
  }));
  expect(response.status).toBe(200);
  expect(updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({
    p_deposit: "deposit-a", p_invoice: "invoice-a", p_result: fixture.expected,
    p_transaction: fixture.expected === "paid" ? "transaction-a" : null,
  });
  expect(requests.some((url) => url.endsWith("/transactions/untrusted-id"))).toBe(false);
});
