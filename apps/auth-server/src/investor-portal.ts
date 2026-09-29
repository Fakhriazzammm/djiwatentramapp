import type { Hono } from "hono";
import type { Pool } from "pg";
import { auth, pool as authPool } from "./auth.js";

/**
 * Investor access reuses the central Djiwa App identity/session.
 * Membership approval remains the separate gate for investor data.
 */
export const investorAuth = auth;

type InvestorAuth = typeof investorAuth;

type InvestorMembership = {
  status: "approved" | "pending" | "suspended" | "revoked";
};

type EcosystemRow = {
  settled_orders: string | number;
  order_value: string | number;
  first_date_wib: string | null;
  last_date_wib: string | null;
};

type MetricsRow = {
  month: string;
  month_label: string;
  current_income: string | number;
  current_expense: string | number;
  current_net: string | number;
  target_revenue: string | number;
  remaining: string | number;
  progress_pct: string | number;
  daily_collected: string | number;
  shift_collected: string | number;
  days_in_month: string | number;
  days_passed: string | number;
  days_remaining: string | number;
};

const requestRateLimit = new Map<string, number[]>();
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
const REQUEST_LIMIT = 3;

function privateJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function publicSnapshotJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": status === 200 ? "public, max-age=300" : "no-store" },
  });
}

function numberValue(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : null;
}

function allowRequest(userId: string) {
  const now = Date.now();
  const recent = (requestRateLimit.get(userId) || []).filter((time) => now - time < REQUEST_WINDOW_MS);
  if (recent.length >= REQUEST_LIMIT) {
    requestRateLimit.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestRateLimit.set(userId, recent);
  return true;
}

async function investorSession(auth: InvestorAuth, headers: Headers) {
  return auth.api.getSession({ headers });
}

async function membershipStatus(pool: Pool, userId: string): Promise<InvestorMembership["status"] | "none"> {
  const result = await pool.query<InvestorMembership>(
    `SELECT status
       FROM public.investor_memberships
      WHERE user_id = $1
        AND role = 'investor'
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.status ?? "none";
}

async function requireApprovedInvestor(auth: InvestorAuth, pool: Pool, headers: Headers) {
  const session = await investorSession(auth, headers);
  if (!session?.user?.id) return { response: privateJson({ success: false, error: "UNAUTHORIZED" }, 401) } as const;
  const status = await membershipStatus(pool, session.user.id);
  if (status !== "approved") return { response: privateJson({ success: false, error: "FORBIDDEN" }, 403) } as const;
  return { userId: session.user.id } as const;
}

export function registerInvestorPortalRoutes(app: Hono, auth: InvestorAuth, pool: Pool) {
  // Investor access/data routes reuse the central Better Auth session.
  app.get("/api/investor/access", async (c) => {
    const session = await investorSession(auth, c.req.raw.headers);
    if (!session?.user?.id) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
    const status = await membershipStatus(pool, session.user.id);
    return privateJson({ status: status === "approved" || status === "pending" || status === "suspended" ? status : "none" });
  });

  // Public landing-page teaser: deliberately limited to one tagged self-service channel.
  // It returns aggregates only, never order rows, identifiers, or customer fields.
  app.get("/api/investor/public-snapshot", async () => {
    try {
      const [result, ecosystemResult] = await Promise.all([
        pool.query<{
          settled_orders: string | number;
          order_value: string | number;
          average_order_value: string | number;
          first_date_wib: string | null;
          last_date_wib: string | null;
        }>(
          `SELECT COUNT(*) FILTER (WHERE status IN ('paid', 'completed'))::int AS settled_orders,
                  COALESCE(ROUND(SUM("totalAmount") FILTER (WHERE status IN ('paid', 'completed'))), 0)::text AS order_value,
                  COALESCE(ROUND(AVG("totalAmount") FILTER (WHERE status IN ('paid', 'completed'))), 0)::text AS average_order_value,
                  MIN((to_timestamp("createdAt" / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date) FILTER (WHERE status IN ('paid', 'completed'))::text AS first_date_wib,
                  MAX((to_timestamp("createdAt" / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date) FILTER (WHERE status IN ('paid', 'completed'))::text AS last_date_wib
             FROM public.pos_orders
            WHERE "brandSlug" = $1
              AND source = $2`,
          ["djiwatentram", "customer_self_service"],
        ),
        pool.query<EcosystemRow>(
          `SELECT COUNT(*) FILTER (WHERE status IN ('paid', 'completed'))::int AS settled_orders,
                  COALESCE(ROUND(SUM("totalAmount") FILTER (WHERE status IN ('paid', 'completed'))), 0)::text AS order_value,
                  MIN((to_timestamp("createdAt" / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date) FILTER (WHERE status IN ('paid', 'completed'))::text AS first_date_wib,
                  MAX((to_timestamp("createdAt" / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date) FILTER (WHERE status IN ('paid', 'completed'))::text AS last_date_wib
             FROM public.pos_orders`,
        ),
      ]);
      const row = result.rows[0];
      const ecosystemRow = ecosystemResult.rows[0];
      if (!row || !ecosystemRow) return publicSnapshotJson({ success: false, error: "SNAPSHOT_UNAVAILABLE" }, 503);
      const ecosystemOrders = numberValue(ecosystemRow.settled_orders) ?? 0;
      const ecosystemValue = numberValue(ecosystemRow.order_value) ?? 0;
      return publicSnapshotJson({
        success: true,
        data: {
          settledOrders: numberValue(row.settled_orders),
          orderValue: numberValue(row.order_value),
          averageOrderValue: numberValue(row.average_order_value),
          firstDateWib: row.first_date_wib,
          lastDateWib: row.last_date_wib,
          ecosystemSettledOrders: ecosystemOrders,
          ecosystemOrderValue: ecosystemValue,
          ecosystemAverageOrderValue: ecosystemOrders > 0 ? Math.round(ecosystemValue / ecosystemOrders) : 0,
          ecosystemFirstDateWib: ecosystemRow.first_date_wib,
          ecosystemLastDateWib: ecosystemRow.last_date_wib,
          source: "public.pos_orders",
          scope: "tagged_customer_self_service_only",
          ecosystemScope: "all_recorded_pos_orders_paid_or_completed",
          completeness: "partial",
        },
      });
    } catch {
      return publicSnapshotJson({ success: false, error: "SNAPSHOT_UNAVAILABLE" }, 503);
    }
  });

  app.post("/api/investor/access-request", async (c) => {
    const session = await investorSession(auth, c.req.raw.headers);
    if (!session?.user?.id) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
    if (!allowRequest(session.user.id)) return privateJson({ success: false, error: "RATE_LIMITED" }, 429);

    const body = await c.req.json().catch(() => ({})) as {
      consent?: unknown;
      consentVersion?: unknown;
      city?: unknown;
      investmentRange?: unknown;
    };
    if (body.consent !== true) return privateJson({ success: false, error: "CONSENT_REQUIRED" }, 400);
    const consentVersion = typeof body.consentVersion === "string" ? body.consentVersion.trim() : "";
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(consentVersion)) return privateJson({ success: false, error: "CONSENT_VERSION_REQUIRED" }, 400);
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : null;
    const investmentRange = typeof body.investmentRange === "string" ? body.investmentRange.trim().slice(0, 80) : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ status: InvestorMembership["status"] }>(
        `SELECT status FROM public.investor_memberships
          WHERE user_id = $1 AND role = 'investor'
          FOR UPDATE`,
        [session.user.id],
      );
      const current = existing.rows[0]?.status;
      if (current === "approved") {
        await client.query("COMMIT");
        return privateJson({ success: true, status: "approved" });
      }
      if (current === "suspended" || current === "revoked") {
        await client.query("COMMIT");
        return privateJson({ success: false, error: "ACCESS_UNAVAILABLE" }, 403);
      }
      await client.query(
        `INSERT INTO public.investor_memberships (user_id, role, status, requested_at, updated_at)
         VALUES ($1, 'investor', 'pending', now(), now())
         ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
          WHERE public.investor_memberships.status = 'pending'`,
        [session.user.id],
      );
      await client.query(
        `INSERT INTO public.investor_leads
          (user_id, city_interest, investment_range, consent_at, consent_version, status, created_at, updated_at)
         VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), now(), $4, 'new', now(), now())`,
        [session.user.id, city || "", investmentRange || "", consentVersion],
      );
      await client.query("COMMIT");
      return privateJson({ success: true, status: "pending" }, 202);
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return privateJson({ success: true, status: "pending" }, 202);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/investor/metrics", async (c) => {
    const access = await requireApprovedInvestor(auth, pool, c.req.raw.headers);
    if ("response" in access) return access.response;
    const unavailable = () => privateJson({
      success: true,
      data: {
        periodLabel: "Unavailable",
        asOf: new Date().toISOString(),
        metrics: { currentIncome: null, currentExpense: null, currentNet: null, targetRevenue: null, progressPct: null },
        source: "public.pos_current_month_progress",
        completeness: "unavailable",
      },
    });
    let result;
    try {
      result = await pool.query<MetricsRow>(
        `SELECT month, month_label, current_income, current_expense, current_net,
                target_revenue, remaining, progress_pct, daily_collected,
                shift_collected, days_in_month, days_passed, days_remaining
           FROM public.pos_current_month_progress
          LIMIT 1`,
      );
    } catch {
      return unavailable();
    }
    const row = result.rows[0];
    if (!row) return unavailable();
    const metrics = {
      currentIncome: numberValue(row.current_income),
      currentExpense: numberValue(row.current_expense),
      currentNet: numberValue(row.current_net),
      targetRevenue: numberValue(row.target_revenue),
      progressPct: numberValue(row.progress_pct),
    };
    const metricValues = Object.values(metrics);
    const hasMetric = metricValues.some((value) => value !== null);
    const completeness = !hasMetric ? "unavailable" : metricValues.some((value) => value === null) ? "partial" : "available";
    return privateJson({
      success: true,
      data: {
        periodLabel: row.month_label,
        asOf: new Date().toISOString(),
        metrics,
        source: "public.pos_current_month_progress",
        completeness,
      },
    });
  });
}
