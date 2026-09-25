import type { Hono } from "hono";
import type { Pool } from "pg";
import { betterAuth } from "better-auth";
import { pool as authPool } from "./auth.js";

const investorOrigins = [
  "https://investor.yumme.id",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3011",
];

/** Dedicated investor identity surface. It intentionally cannot sign in with a password. */
export const investorAuth = betterAuth({
  database: authPool,
  baseURL: process.env.BETTER_AUTH_URL || "https://djiwatentram.yumme.id",
  basePath: "/api/investor-auth",
  trustedOrigins: investorOrigins,
  advanced: {
    cookiePrefix: "djiwa_investor",
    defaultCookieAttributes: {
      secure: true,
      httpOnly: true,
      sameSite: "lax",
    },
  },
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});

type InvestorAuth = typeof investorAuth;

type InvestorMembership = {
  status: "approved" | "pending" | "suspended" | "revoked";
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
  // Better Auth OAuth/session handlers are isolated from customer and staff cookies.
  app.on(["POST", "GET"], "/api/investor-auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/investor/access", async (c) => {
    const session = await investorSession(auth, c.req.raw.headers);
    if (!session?.user?.id) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
    const status = await membershipStatus(pool, session.user.id);
    return privateJson({ status: status === "approved" || status === "pending" || status === "suspended" ? status : "none" });
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
