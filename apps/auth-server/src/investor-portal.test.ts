import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { Pool } from "pg";
import { investorAuth, registerInvestorPortalRoutes } from "./investor-portal.js";

type TestUser = { id: string; name: string; email: string };
type PoolHarness = { status: string | null; queries: string[]; parameters: unknown[][] };

function appFor(status: string | null) {
  const harness: PoolHarness = { status, queries: [], parameters: [] };
  const authStub = {
    handler: async () => new Response("not found", { status: 404 }),
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get("x-test-user");
        return id ? { user: { id, name: "Test Investor", email: "investor@example.test" } satisfies TestUser } : null;
      },
    },
  } as unknown as Parameters<typeof registerInvestorPortalRoutes>[1];
  const poolStub = {
    query: async (sql: string, parameters?: unknown[]) => {
      harness.queries.push(sql);
      harness.parameters.push(parameters ?? []);
      if (sql.includes("FROM public.investor_memberships")) {
        return { rows: harness.status ? [{ status: harness.status }] : [] };
      }
      if (sql.includes("FROM public.pos_orders")) {
        return { rows: [{ settled_orders: 419, order_value: "18140840", average_order_value: "43296", first_date_wib: "2026-08-09", last_date_wib: "2026-09-25" }] };
      }
      if (sql.includes("FROM public.pos_current_month_progress")) {
        return { rows: [{
          month: "2026-09-01",
          month_label: "September 2026",
          current_income: "125000000",
          current_expense: "72000000",
          current_net: "53000000",
          target_revenue: "150000000",
          remaining: "25000000",
          progress_pct: "83.3",
          daily_collected: "5000000",
          shift_collected: "2000000",
          days_in_month: "30",
          days_passed: "20",
          days_remaining: "10",
        }] };
      }
      return { rows: [] };
    },
    connect: async () => ({
      query: async (sql: string) => { harness.queries.push(sql); return { rows: [] }; },
      release: () => undefined,
    }),
  } as unknown as Pool;
  const app = new Hono();
  registerInvestorPortalRoutes(app, authStub, poolStub);
  return { app, harness };
}

function sessionHeaders(userId?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (userId) headers.set("x-test-user", userId);
  return headers;
}

describe("investor portal server boundary", () => {
  test("unauthenticated access and metrics endpoints fail closed", async () => {
    const { app } = appFor(null);
    const access = await app.request("/api/investor/access");
    const metrics = await app.request("/api/investor/metrics");
    expect(access.status).toBe(401);
    expect(metrics.status).toBe(401);
  });

  test("public snapshot exposes only tagged channel aggregates without investor login", async () => {
    const { app, harness } = appFor(null);
    const response = await app.request("/api/investor/public-snapshot");
    const body = await response.json() as { data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(body.data).toEqual({
      settledOrders: 419,
      orderValue: 18140840,
      averageOrderValue: 43296,
      firstDateWib: "2026-08-09",
      lastDateWib: "2026-09-25",
      source: "public.pos_orders",
      scope: "tagged_customer_self_service_only",
      completeness: "partial",
    });
    const queryIndex = harness.queries.findIndex((sql) => sql.includes("FROM public.pos_orders"));
    expect(queryIndex).toBeGreaterThanOrEqual(0);
    expect(harness.parameters[queryIndex]).toEqual(["djiwatentram", "customer_self_service"]);
    expect(harness.queries[queryIndex]).toContain("status IN ('paid', 'completed')");
    expect(harness.queries[queryIndex]).not.toContain("customerName");
  });

  test("pending membership is visible as pending but cannot read metrics", async () => {
    const { app } = appFor("pending");
    const access = await app.request("/api/investor/access", { headers: sessionHeaders("test-user") });
    const metrics = await app.request("/api/investor/metrics", { headers: sessionHeaders("test-user") });
    expect(access.status).toBe(200);
    expect(await access.json()).toEqual({ status: "pending" });
    expect(metrics.status).toBe(403);
  });

  test("approved investor receives only allowlisted monthly aggregates", async () => {
    const { app, harness } = appFor("approved");
    const response = await app.request("/api/investor/metrics", { headers: sessionHeaders("test-user") });
    const body = await response.json() as { data: { metrics: Record<string, unknown>; periodLabel: string; completeness: string } };
    expect(response.status).toBe(200);
    expect(body.data.periodLabel).toBe("September 2026");
    expect(body.data.completeness).toBe("available");
    expect(Object.keys(body.data.metrics).sort()).toEqual([
      "currentExpense", "currentIncome", "currentNet", "progressPct", "targetRevenue",
    ]);
    expect(body.data.metrics.currentIncome).toBe(125000000);
    expect(JSON.stringify(body)).not.toContain("daily_collected");
    expect(harness.queries.some((sql) => sql.includes("pos_financial_transactions"))).toBe(false);
  });

  test("access requests require consent and insert only the lead contract", async () => {
    const { app, harness } = appFor(null);
    const missingConsent = await app.request("/api/investor/access-request", {
      method: "POST", headers: sessionHeaders("request-user"),
      body: JSON.stringify({ consent: false, consentVersion: "investor-portal-v1" }),
    });
    expect(missingConsent.status).toBe(400);

    const submitted = await app.request("/api/investor/access-request", {
      method: "POST", headers: sessionHeaders("request-user"),
      body: JSON.stringify({ city: "Bandung", investmentRange: "Diskusi awal", consent: true, consentVersion: "investor-portal-v1" }),
    });
    expect(submitted.status).toBe(202);
    expect(harness.queries.some((sql) => sql.includes("INSERT INTO public.investor_leads"))).toBe(true);
  });

  test("investor Better Auth uses a dedicated path and rejects email/password sign-in", async () => {
    const session = await investorAuth.handler(new Request("https://djiwatentram.yumme.id/api/investor-auth/get-session"));
    const passwordLogin = await investorAuth.handler(new Request("https://djiwatentram.yumme.id/api/investor-auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.invalid", password: "test-only" }),
    }));
    expect(session.status).toBe(200);
    expect(passwordLogin.status).toBeGreaterThanOrEqual(400);
  });
});
