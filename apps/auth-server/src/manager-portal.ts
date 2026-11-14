import type { Context, Hono } from "hono";
import type { Pool } from "pg";
import { auth as defaultAuth } from "./auth.js";

/**
 * manager.djiwatentram.web.id — Manager & Supervisor/Purchasing.
 * Identity = central Better Auth (Google). Access = public.mgr_memberships approved by Owner.
 * Owner/admin endpoints (/api/admin-manager/*) authenticate with the existing Yumi staff session.
 */
type Auth = typeof defaultAuth;
type Role = "manager" | "supervisor";
const ROLES: Role[] = ["manager", "supervisor"];
const ADMIN_ROLES = new Set(["admin", "administrator", "owner", "superadmin", "super admin"]);
const KINDS = ["general", "purchasing", "ops", "people", "finance"];
const PRIORITIES = ["low", "normal", "high"];
const ATTACH_TYPES = ["link", "file", "photo", "video"];

export const managerOrigins = [
  "https://manager.djiwatentram.web.id",
  "https://admin.djiwatentram.web.id",
  "http://localhost:3012",
  "http://localhost:5173",
  "http://localhost:5174",
];

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function cleanAttachments(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 10).flatMap((a) => {
    const type = text((a as { type?: unknown })?.type, 10);
    const url = text((a as { url?: unknown })?.url, 2000);
    if (!ATTACH_TYPES.includes(type) || !/^https?:\/\//i.test(url)) return [];
    return [{ type, url, name: text((a as { name?: unknown }).name, 200) || url }];
  });
}

export function registerManagerPortalRoutes(app: Hono, auth: Auth, pool: Pool) {
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

  // ---------- access / onboarding ----------
  app.get("/api/manager/access", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const r = await pool.query(
      `SELECT status, role, requested_role FROM public.mgr_memberships WHERE user_id = $1`,
      [session.user.id],
    );
    const m = r.rows[0];
    return json({
      success: true,
      status: m?.status ?? "none",
      role: m?.status === "approved" ? m.role : null,
      requestedRole: m?.requested_role ?? null,
      user: { name: session.user.name, email: session.user.email },
    });
  });

  app.post("/api/manager/access-request", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user?.id) return json({ success: false, error: "UNAUTHORIZED" }, 401);
    const body = (await c.req.json().catch(() => ({}))) as { role?: unknown; note?: unknown };
    const role = text(body.role, 20) as Role;
    if (!ROLES.includes(role)) return json({ success: false, error: "ROLE_REQUIRED" }, 400);
    const existing = await pool.query(`SELECT status FROM public.mgr_memberships WHERE user_id = $1`, [session.user.id]);
    const status = existing.rows[0]?.status;
    if (status === "approved") return json({ success: true, status });
    if (status === "revoked") return json({ success: false, error: "ACCESS_UNAVAILABLE" }, 403);
    await pool.query(
      `INSERT INTO public.mgr_memberships (user_id, email, display_name, requested_role, note, status)
       VALUES ($1,$2,$3,$4,NULLIF($5,''),'pending')
       ON CONFLICT (user_id) DO UPDATE
         SET requested_role = EXCLUDED.requested_role, note = EXCLUDED.note, status = 'pending',
             email = EXCLUDED.email, display_name = EXCLUDED.display_name, requested_at = now(), updated_at = now()`,
      [session.user.id, session.user.email, session.user.name, role, text(body.note, 300)],
    );
    return json({ success: true, status: "pending" }, 202);
  });

  // ---------- tasks ----------
  app.get("/api/manager/tasks", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const status = c.req.query("status") === "done" ? "done" : "open";
    const r = await pool.query(
      `SELECT t.*, (SELECT count(*)::int FROM public.mgr_task_comments k WHERE k.task_id = t.id) AS comment_count
         FROM public.mgr_tasks t
        WHERE t.status = $1 AND t.assignee_role = $2
          AND (t.assignee_user_id IS NULL OR t.assignee_user_id = $3)
        ORDER BY (t.priority = 'high') DESC, t.due_at NULLS LAST, t.created_at DESC
        LIMIT 200`,
      [status, m.role, m.userId],
    );
    return json({ success: true, tasks: r.rows });
  });

  app.post("/api/manager/tasks", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = text(b.title, 200);
    if (!title) return json({ success: false, error: "TITLE_REQUIRED" }, 400);
    // Manager may assign to supervisor; supervisor only to self. Role comes from membership, never the client.
    const target: Role = m.role === "manager" && b.assigneeRole === "supervisor" ? "supervisor" : m.role;
    const kind = KINDS.includes(text(b.kind, 20)) ? text(b.kind, 20) : "general";
    const priority = PRIORITIES.includes(text(b.priority, 10)) ? text(b.priority, 10) : "normal";
    const due = typeof b.dueAt === "string" && !Number.isNaN(Date.parse(b.dueAt)) ? b.dueAt : null;
    const self = target === m.role;
    const r = await pool.query(
      `INSERT INTO public.mgr_tasks (title, detail, source, created_by, assignee_role, assignee_user_id, priority, kind, due_at, attachments)
       VALUES ($1, NULLIF($2,''), $3, $4, $5, $6, $7, $8, $9, $10::jsonb) RETURNING *`,
      [title, text(b.detail, 2000), m.role, m.userId, target, self ? m.userId : null, priority, kind, due, JSON.stringify(cleanAttachments(b.attachments))],
    );
    return json({ success: true, task: r.rows[0] }, 201);
  });

  app.patch("/api/manager/tasks/:id", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as { status?: unknown };
    const status = text(b.status, 10);
    if (!["open", "done"].includes(status)) return json({ success: false, error: "STATUS_INVALID" }, 400);
    const r = await pool.query(
      `UPDATE public.mgr_tasks SET status = $1, done_at = CASE WHEN $1 = 'done' THEN now() END,
              done_by = CASE WHEN $1 = 'done' THEN $2 END, updated_at = now()
        WHERE id = $3 AND assignee_role = $4 AND (assignee_user_id IS NULL OR assignee_user_id = $2)
        RETURNING *`,
      [status, m.userId, c.req.param("id"), m.role],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, task: r.rows[0] });
  });

  app.get("/api/manager/tasks/:id/comments", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const r = await pool.query(
      `SELECT k.* FROM public.mgr_task_comments k JOIN public.mgr_tasks t ON t.id = k.task_id
        WHERE k.task_id = $1 AND t.assignee_role = $2 ORDER BY k.created_at`,
      [c.req.param("id"), m.role],
    );
    return json({ success: true, comments: r.rows });
  });

  app.post("/api/manager/tasks/:id/comments", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as { body?: unknown };
    const body = text(b.body, 2000);
    if (!body) return json({ success: false, error: "BODY_REQUIRED" }, 400);
    const r = await pool.query(
      `INSERT INTO public.mgr_task_comments (task_id, author_id, author_name, body)
       SELECT t.id, $2, $3, $4 FROM public.mgr_tasks t WHERE t.id = $1 AND t.assignee_role = $5
       RETURNING *`,
      [c.req.param("id"), m.userId, m.name, body, m.role],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, comment: r.rows[0] }, 201);
  });

  // ---------- reports ----------
  app.get("/api/manager/reports", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const r = await pool.query(
      `SELECT * FROM public.mgr_reports
        WHERE from_user_id = $1 OR ($2 = 'manager' AND to_role = 'manager')
        ORDER BY created_at DESC LIMIT 100`,
      [m.userId, m.role],
    );
    return json({ success: true, reports: r.rows });
  });

  app.post("/api/manager/reports", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = text(b.title, 200);
    const kind = text(b.kind, 60);
    if (!title || !kind) return json({ success: false, error: "TITLE_KIND_REQUIRED" }, 400);
    // Supervisor → manager or owner; manager → owner only.
    const to = text(b.toRole, 10);
    const toRole = m.role === "manager" ? "owner" : to === "owner" ? "owner" : "manager";
    const body = b.body && typeof b.body === "object" ? b.body : {};
    if (JSON.stringify(body).length > 100_000) return json({ success: false, error: "TOO_LARGE" }, 413);
    const r = await pool.query(
      `INSERT INTO public.mgr_reports (kind, title, body, from_user_id, from_name, from_role, to_role)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7) RETURNING *`,
      [kind, title, JSON.stringify(body), m.userId, m.name, m.role, toRole],
    );
    return json({ success: true, report: r.rows[0] }, 201);
  });

  app.patch("/api/manager/reports/:id", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    const b = (await c.req.json().catch(() => ({}))) as { status?: unknown; note?: unknown };
    const status = text(b.status, 20);
    if (!["read", "needs_revision", "acknowledged"].includes(status)) return json({ success: false, error: "STATUS_INVALID" }, 400);
    const r = await pool.query(
      `UPDATE public.mgr_reports SET status = $1, review_note = NULLIF($2,''), reviewed_at = now(), reviewed_by = $3
        WHERE id = $4 AND to_role = 'manager' RETURNING *`,
      [status, text(b.note, 1000), m.userId, c.req.param("id")],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, report: r.rows[0] });
  });

  // ---------- playbook ----------
  app.get("/api/manager/playbook", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    const r = await pool.query(
      `SELECT slug, position, title, body, updated_at FROM public.mgr_playbook_chapters
        WHERE $1 = ANY (roles) ORDER BY position`,
      [m.role],
    );
    return json({ success: true, chapters: r.rows });
  });

  // ---------- owner / admin side ----------
  app.get("/api/admin-manager/memberships", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const r = await pool.query(`SELECT * FROM public.mgr_memberships ORDER BY (status = 'pending') DESC, requested_at DESC LIMIT 200`);
    return json({ success: true, memberships: r.rows });
  });

  app.post("/api/admin-manager/memberships/:userId/decision", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const b = (await c.req.json().catch(() => ({}))) as { decision?: unknown; role?: unknown };
    const decision = text(b.decision, 10);
    if (!["approve", "reject", "revoke"].includes(decision)) return json({ success: false, error: "DECISION_INVALID" }, 400);
    const role = text(b.role, 20);
    if (decision === "approve" && !ROLES.includes(role as Role)) return json({ success: false, error: "ROLE_REQUIRED" }, 400);
    // One manager and one supervisor at a time: approving replaces nothing silently.
    if (decision === "approve") {
      const taken = await pool.query(
        `SELECT 1 FROM public.mgr_memberships WHERE status = 'approved' AND role = $1 AND user_id <> $2`,
        [role, c.req.param("userId")],
      );
      if (taken.rows[0]) return json({ success: false, error: "ROLE_TAKEN" }, 409);
    }
    const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revoked";
    const r = await pool.query(
      `UPDATE public.mgr_memberships SET status = $1, role = CASE WHEN $1 = 'approved' THEN $2 ELSE role END,
              decided_at = now(), decided_by = $3, updated_at = now()
        WHERE user_id = $4 RETURNING *`,
      [status, role || null, o.userId, c.req.param("userId")],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, membership: r.rows[0] });
  });

  app.post("/api/admin-manager/tasks", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = text(b.title, 200);
    const role = text(b.assigneeRole, 20) as Role;
    if (!title || !ROLES.includes(role)) return json({ success: false, error: "TITLE_ROLE_REQUIRED" }, 400);
    const kind = KINDS.includes(text(b.kind, 20)) ? text(b.kind, 20) : "general";
    const priority = PRIORITIES.includes(text(b.priority, 10)) ? text(b.priority, 10) : "normal";
    const due = typeof b.dueAt === "string" && !Number.isNaN(Date.parse(b.dueAt)) ? b.dueAt : null;
    const r = await pool.query(
      `INSERT INTO public.mgr_tasks (title, detail, source, created_by, assignee_role, priority, kind, due_at, attachments)
       VALUES ($1, NULLIF($2,''), 'owner', $3, $4, $5, $6, $7, $8::jsonb) RETURNING *`,
      [title, text(b.detail, 2000), o.userId, role, priority, kind, due, JSON.stringify(cleanAttachments(b.attachments))],
    );
    return json({ success: true, task: r.rows[0] }, 201);
  });

  app.get("/api/admin-manager/reports", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const r = await pool.query(`SELECT * FROM public.mgr_reports WHERE to_role = 'owner' ORDER BY created_at DESC LIMIT 100`);
    return json({ success: true, reports: r.rows });
  });

  app.patch("/api/admin-manager/reports/:id", async (c) => {
    const o = await owner(c);
    if ("res" in o) return o.res;
    const b = (await c.req.json().catch(() => ({}))) as { status?: unknown; note?: unknown };
    const status = text(b.status, 20);
    if (!["read", "needs_revision", "acknowledged"].includes(status)) return json({ success: false, error: "STATUS_INVALID" }, 400);
    const r = await pool.query(
      `UPDATE public.mgr_reports SET status = $1, review_note = NULLIF($2,''), reviewed_at = now(), reviewed_by = $3
        WHERE id = $4 AND to_role = 'owner' RETURNING *`,
      [status, text(b.note, 1000), o.userId, c.req.param("id")],
    );
    if (!r.rows[0]) return json({ success: false, error: "NOT_FOUND" }, 404);
    return json({ success: true, report: r.rows[0] });
  });
}
