import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { auth, pool } from "./auth.js";
import { staffAuth } from "./staff-auth.js";

const app = new Hono();
const customerOrigins = [
  "https://djiwatentram.yumme.id",
  "https://merchandise.yumme.id",
  "https://b2b.yumme.id",
  "https://ordermieyamin.yumme.id",
  "https://500kopitasik.yumme.id",
  "http://localhost:5173",
];

// CORS — allow customer app domain with credentials
app.use(
  "/api/auth/*",
  cors({
    origin: customerOrigins,
    allowHeaders: ["Content-Type", "Authorization", "X-Visitor-Id", "X-Request-Id"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

// Better Auth handler (customer)
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// ── Better Auth KARYAWAN (staff) ──────────────────────────────────
const staffOrigins = [
  "https://karyawan.yumme.id",
  "http://localhost:5173",
  "http://localhost:5174",
];

app.use(
  "/api/staff-auth/*",
  cors({
    origin: staffOrigins,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/staff-auth/*", (c) => {
  return staffAuth.handler(c.req.raw);
});

// Bridge: Better Auth staff session → Yumi session (ys_) supaya useYumiAuth jalan
app.post("/api/staff/yumi-login", async (c) => {
  const session = await staffAuth.api.getSession({ headers: c.req.raw.headers });
  const yumiSourceId = String((session?.user as { metadata?: { yumiSourceId?: string } } | undefined)?.metadata?.yumiSourceId ?? "");
  if (!session || !yumiSourceId) {
    return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);
  }
  const yumi = await pool.query(
    `SELECT u.source_id, u.name, u.is_active
       FROM public.yumi_users u
      WHERE u.source_id = $1 LIMIT 1`,
    [yumiSourceId],
  );
  const staff = yumi.rows[0];
  if (!staff || !staff.is_active) {
    return privateJson({ success: false, error: "STAFF_INACTIVE" }, 403);
  }
  const token = `ys_${crypto.randomUUID().replace(/-/g, "")}_${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 18)}`;
  await pool.query(
    `INSERT INTO public.yumi_sessions (token, user_source_id, expires_at)
     VALUES ($1, $2, now() + interval '24 hours')`,
    [token, staff.source_id],
  );
  return privateJson({ success: true, token, user: staff });
});

app.use(
  "/api/customer/*",
  cors({
    origin: customerOrigins,
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

async function requireCustomerSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session?.user?.id) return null;
  return session;
}

function privateJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

app.get("/api/customer/profile", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);

  const result = await pool.query(
    "SELECT * FROM public.pos_customers_view WHERE source_id = $1 LIMIT 1",
    [session.user.id],
  );
  return privateJson({ success: true, customer: result.rows[0] ?? null });
});

app.get("/api/customer/orders", async (c) => {
  const session = await requireCustomerSession(c.req.raw.headers);
  if (!session) return privateJson({ success: false, error: "UNAUTHORIZED" }, 401);

  const result = await pool.query(
    'SELECT * FROM public.pos_orders WHERE "customerSourceId" = $1 ORDER BY "createdAt" DESC NULLS LAST LIMIT 50',
    [session.user.id],
  );
  return privateJson({ success: true, orders: result.rows });
});

app.post("/api/customer/guest-orders", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { orderIds?: unknown };
  const orderIds = Array.isArray(body.orderIds)
    ? Array.from(new Set(body.orderIds.filter((value): value is string =>
        typeof value === "string" && /^order_[a-f0-9]{24}$/.test(value),
      ))).slice(0, 20)
    : [];
  if (orderIds.length === 0) return privateJson({ success: true, orders: [] });

  const result = await pool.query(
    'SELECT * FROM public.pos_orders WHERE "_id" = ANY($1::text[]) ORDER BY "createdAt" DESC NULLS LAST',
    [orderIds],
  );
  return privateJson({ success: true, orders: result.rows });
});

const PORT = parseInt(process.env.BETTER_AUTH_PORT || "3001");
console.log(`⚡ Auth server running on http://localhost:${PORT}`);
serve({ fetch: app.fetch, port: PORT });
