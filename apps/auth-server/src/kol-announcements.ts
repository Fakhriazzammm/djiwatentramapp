import type { Hono } from "hono";
import type { Pool } from "pg";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text } from "./manager-guards.js";

/**
 * Pengumuman ke KOL. Admin (token Yumi) dan Manager (sesi Google + peran manager) memakai fungsi yang sama;
 * KOL membaca lewat portal. Penerima dihitung di SQL (pos.kol_announcement_audience), jadi tidak ada salinan per KOL.
 */
type Auth = typeof defaultAuth;
export const ANNOUNCEMENT_KINDS = ["info", "penting", "kampanye"] as const;
export const ANNOUNCEMENT_AUDIENCES = ["all", "campaign", "selected"] as const;
type Kind = (typeof ANNOUNCEMENT_KINDS)[number];
type Audience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export type AnnouncementInput = { title: string; body: string; kind: Kind; audience: Audience; campaignId: number | null; kolIds: string[]; pinned: boolean; requireAck: boolean };

export function parseAnnouncement(raw: Record<string, unknown>): { ok: true; value: AnnouncementInput } | { ok: false; error: string } {
  const title = text(raw.title, 80), body = text(raw.body, 1000);
  const kind = ANNOUNCEMENT_KINDS.find((k) => k === raw.kind), audience = ANNOUNCEMENT_AUDIENCES.find((a) => a === raw.audience);
  if (title.length < 3 || body.length < 5 || !kind || !audience) return { ok: false, error: "INVALID_ANNOUNCEMENT" };
  const campaignId = raw.campaignId === null || raw.campaignId === undefined ? null : Number(raw.campaignId);
  const kolIds = Array.isArray(raw.kolIds) ? [...new Set(raw.kolIds.map((v) => text(v, 120)).filter(Boolean))].slice(0, 500) : [];
  if (audience === "campaign" && !(Number.isSafeInteger(campaignId) && (campaignId as number) > 0)) return { ok: false, error: "CAMPAIGN_REQUIRED" };
  if (audience === "selected" && kolIds.length === 0) return { ok: false, error: "RECIPIENTS_REQUIRED" };
  return { ok: true, value: { title, body, kind, audience, campaignId: audience === "campaign" ? campaignId : null, kolIds: audience === "selected" ? kolIds : [], pinned: raw.pinned === true, requireAck: raw.requireAck === true } };
}

const listSql = `
  select a.id, a.title, a.body, a.kind, a.audience, a.campaign_id, c.title as campaign_title, a.pinned, a.require_ack, a.created_by, a.created_at,
         (select count(*)::int from pos.kol_announcement_audience(a)) as audience_count,
         (select count(*)::int from pos.kol_announcement_reads r where r.announcement_id = a.id and pos.kol_announcement_visible(a, r.kol_id)) as read_count,
         (select count(*)::int from pos.kol_announcement_reads r where r.announcement_id = a.id and r.acked_at is not null and pos.kol_announcement_visible(a, r.kol_id)) as ack_count
    from pos.kol_announcements a left join pos.kol_campaigns c on c.id = a.campaign_id
   where a.status = 'sent' and ($1::bigint is null or a.id = $1)
   order by a.created_at desc limit 100`;

const shape = (r: any) => ({
  id: Number(r.id), title: r.title, body: r.body, kind: r.kind, audience: r.audience, campaignId: r.campaign_id ? Number(r.campaign_id) : null,
  campaignTitle: r.campaign_title ?? null, pinned: r.pinned, requireAck: r.require_ack, createdBy: r.created_by, createdAt: r.created_at,
  audienceCount: Number(r.audience_count), readCount: Number(r.read_count), ackCount: Number(r.ack_count),
});

export function registerKolAnnouncementRoutes(app: Hono, auth: Auth, pool: Pool) {
  const { member, owner } = createGuards(auth, pool);
  const asManager = async (c: any) => { const m = await member(c); if ("res" in m) return m; return m.role === "manager" ? { actor: `manager:${m.userId}` } : { res: json({ success: false, error: "FORBIDDEN" }, 403) }; };
  const asAdmin = async (c: any) => { const o = await owner(c); return "res" in o ? o : { actor: `admin:${o.userId}` }; };

  const mount = (prefix: string, guard: (c: any) => Promise<{ actor: string } | { res: Response }>) => {
    app.get(prefix, async (c) => {
      const g = await guard(c); if ("res" in g) return g.res;
      const [rows, campaigns, creators] = await Promise.all([
        pool.query(listSql, [null]),
        pool.query(`select id, title from pos.kol_campaigns where status in ('published','draft') order by created_at desc limit 100`),
        pool.query(`select source_id, name, username from pos.kol_creators where status <> 'Rejected' order by name limit 500`),
      ]);
      return json({ success: true, data: { announcements: rows.rows.map(shape), campaigns: campaigns.rows, creators: creators.rows } });
    });
    app.post(prefix, async (c) => {
      const g = await guard(c); if ("res" in g) return g.res;
      const parsed = parseAnnouncement((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
      if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);
      const v = parsed.value;
      try {
        const ins = await pool.query(
          `insert into pos.kol_announcements(title, body, kind, audience, campaign_id, target_kol_ids, pinned, require_ack, created_by)
           values ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9) returning id`,
          [v.title, v.body, v.kind, v.audience, v.campaignId, v.kolIds, v.pinned, v.requireAck, g.actor]);
        const row = (await pool.query(listSql, [ins.rows[0].id])).rows[0];
        return json({ success: true, data: shape(row) }, 201);
      } catch (error: any) {
        if (error?.code === "23503" || error?.code === "23514") return json({ success: false, error: "INVALID_ANNOUNCEMENT" }, 400);
        throw error;
      }
    });
    app.post(`${prefix}/:id/archive`, async (c) => {
      const g = await guard(c); if ("res" in g) return g.res;
      const id = Number(c.req.param("id"));
      if (!Number.isSafeInteger(id) || id < 1) return json({ success: false, error: "INVALID_ID" }, 400);
      const r = await pool.query(`update pos.kol_announcements set status = 'archived' where id = $1 and status = 'sent' returning id`, [id]);
      return r.rows[0] ? json({ success: true, data: { id } }) : json({ success: false, error: "NOT_FOUND" }, 404);
    });
  };
  mount("/api/admin-manager/kol-announcements", asAdmin);
  mount("/api/manager/kol-announcements", asManager);
}

/** Portal KOL: pengumuman yang ditujukan ke KOL, status baca, dan konfirmasi "sudah baca". */
export function registerKolAnnouncementPortalRoutes(app: Hono<any>, context: (c: any) => Promise<any>, pool: Pool) {
  app.get("/api/kol/portal/announcements", async (c) => {
    const current = await context(c);
    if (current.error) return current.error;
    const r = await pool.query(
      `select a.id, a.title, a.body, a.kind, a.pinned, a.require_ack, a.created_at, r.read_at, r.acked_at
         from pos.kol_announcements a left join pos.kol_announcement_reads r on r.announcement_id = a.id and r.kol_id = $1
        where a.status = 'sent' and pos.kol_announcement_visible(a, $1) order by a.created_at desc limit 50`, [current.kol.source_id]);
    return json({ success: true, data: r.rows.map((x: any) => ({ id: Number(x.id), title: x.title, body: x.body, kind: x.kind, pinned: x.pinned, requireAck: x.require_ack, createdAt: x.created_at, readAt: x.read_at, ackedAt: x.acked_at })) });
  });

  app.post("/api/kol/portal/announcements/read", async (c) => {
    const current = await context(c);
    if (current.error) return current.error;
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = body.all === true ? null : [Number(body.id)].filter((n) => Number.isSafeInteger(n) && n > 0);
    if (ids !== null && !ids.length) return json({ success: false, error: "INVALID_ID" }, 400);
    await pool.query(
      `insert into pos.kol_announcement_reads(announcement_id, kol_id)
       select a.id, $1 from pos.kol_announcements a
        where a.status = 'sent' and pos.kol_announcement_visible(a, $1) and ($2::bigint[] is null or a.id = any($2::bigint[]))
       on conflict (announcement_id, kol_id) do nothing`, [current.kol.source_id, ids]);
    return json({ success: true });
  });

  app.post("/api/kol/portal/announcements/:id/ack", async (c) => {
    const current = await context(c);
    if (current.error) return current.error;
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id < 1) return json({ success: false, error: "INVALID_ID" }, 400);
    const r = await pool.query(
      `insert into pos.kol_announcement_reads(announcement_id, kol_id, acked_at)
       select a.id, $2, now() from pos.kol_announcements a where a.id = $1 and a.status = 'sent' and pos.kol_announcement_visible(a, $2)
       on conflict (announcement_id, kol_id) do update set acked_at = coalesce(pos.kol_announcement_reads.acked_at, now())
       returning acked_at`, [id, current.kol.source_id]);
    return r.rows[0] ? json({ success: true, data: { ackedAt: r.rows[0].acked_at } }) : json({ success: false, error: "NOT_FOUND" }, 404);
  });
}
