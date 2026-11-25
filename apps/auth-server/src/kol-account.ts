import type { Context, Hono } from "hono";
import type { Pool } from "pg";
import type { auth as defaultAuth } from "./auth.js";

type RoleRow = { source_id: string; name: string; username: string; status: string };
type BrandRow = { id: string; name: string; status: string };

/**
 * Reading the account entry screen is side-effect free. The Brand role is
 * selected explicitly and campaign access still requires membership.
 */
export function registerKolAccountRoutes(app: Hono, auth: typeof defaultAuth, pool: Pool) {
  app.post("/api/kol/roles", async (c: Context) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return c.json({ success: false, error: "UNAUTHORIZED" }, 401);
    const origin = c.req.header("origin");
    if (origin && !["https://kol.djiwatentram.web.id", "http://localhost:3010"].includes(origin)) {
      return c.json({ success: false, error: "FORBIDDEN" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    if (body?.role !== "brand") return c.json({ success: false, error: "INVALID_ROLE" }, 400);
    await pool.query(`update public."user" set user_type = 'brand' where id = $1 and user_type = 'customer'`,
      [session.user.id]);
    return c.json({ success: true, data: { role: "brand" } }, 200, { "Cache-Control": "no-store" });
  });

  app.get("/api/kol/roles", async (c: Context) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const userId = session?.user?.id;
    if (!userId) {
      return c.json({ success: false, error: "UNAUTHORIZED" }, 401, { "Cache-Control": "no-store" });
    }
    const [creator, brands, user] = await Promise.all([
      pool.query<RoleRow>(
        `select source_id, name, username, status
           from pos.kol_creators
          where auth_user_id = $1
          limit 1`,
        [userId],
      ),
      pool.query<BrandRow>(
        `select b.id, b.name, m.status
           from pos.kol_brand_memberships m
           join pos.kol_businesses b on b.id = m.business_id
          where m.user_id = $1
          order by m.created_at desc`,
        [userId],
      ),
      pool.query<{ user_type: string }>(`select user_type from public."user" where id = $1`, [userId]),
    ]);
    return c.json(
      {
        success: true,
        data: {
          userType: user.rows[0]?.user_type ?? "customer",
          creator: creator.rows[0] ?? null,
          brands: brands.rows,
        },
      },
      200,
      { "Cache-Control": "no-store" },
    );
  });
}
