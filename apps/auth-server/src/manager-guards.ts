import type { Context } from "hono";
import type { Pool } from "pg";
import type { auth as defaultAuth } from "./auth.js";

export type Role = "manager" | "supervisor";
export const ROLES: Role[] = ["manager", "supervisor"];
const ADMIN_ROLES = new Set(["admin", "administrator", "owner", "superadmin", "super admin"]);

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
export const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");


export function createGuards(auth: typeof defaultAuth, pool: Pool) {
  async function member(c: Context) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return { res: json({ success: false, error: "UNAUTHORIZED" }, 401) } as const;
    const r = await pool.query(
      `SELECT status, role, requested_role FROM public.mgr_memberships WHERE user_id = $1`,
      [session.user.id],
    );
    const m = r.rows[0];
    if (!m || m.status !== "approved" || !ROLES.includes(m.role)) {
      return { res: json({ success: false, error: "FORBIDDEN" }, 403) } as const;
    }
    return { userId: session.user.id as string, name: (session.user.name as string) || "", role: m.role as Role } as const;
  }

  async function owner(c: Context) {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token.startsWith("ys_")) return { res: json({ success: false, error: "UNAUTHORIZED" }, 401) } as const;
    const r = await pool.query(
      `SELECT u.source_id, u.name, lower(btrim(ro.name)) AS role_name
         FROM public.yumi_sessions s
         JOIN public.yumi_users u ON u.source_id = s.user_source_id AND u.is_active
         JOIN public.yumi_roles ro ON ro.source_id = u.role_source_id
        WHERE s.token = $1 AND s.expires_at > now()`,
      [token],
    );
    const row = r.rows[0];
    if (!row || !ADMIN_ROLES.has(row.role_name)) return { res: json({ success: false, error: "FORBIDDEN" }, 403) } as const;
    return { userId: `yumi:${row.source_id}` as string, name: row.name as string };
  }

  return { member, owner };
}
