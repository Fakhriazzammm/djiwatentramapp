import type { Context, Hono } from "hono";
import type { Pool } from "pg";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json } from "./manager-guards.js";
import { brandTransaction } from "./kol-brand-funding.js";

const summary = `
  select c.id, c.title, c.status, b.name as brand, coalesce(m.status,'pending') as brand_status,
    c.end_date::text as deadline, bc.quota, bc.reward_per_kol,
    t.funded, t.available, t.reserved, t.paid, t.refunded,
    applications.total as applicants, applications.accepted,
    reports.submitted, reports.awaiting, reports.paid_reports, reports.overdue,
    coalesce(o.review_sla_hours,48) as review_sla_hours
  from pos.kol_brand_campaigns bc
  join pos.kol_campaigns c on c.id=bc.campaign_id
  join pos.kol_businesses b on b.id=c.business_id
  left join pos.kol_brand_memberships m on m.business_id=b.id
  left join pos.kol_brand_operations o on o.campaign_id=c.id
  cross join lateral pos.kol_budget_totals(c.id) t
  cross join lateral (
    select count(*) as total, count(*) filter (where status='approved') as accepted
    from pos.kol_campaign_applications where campaign_id=c.id
  ) applications
  cross join lateral (
    select count(*) filter (where d.status='submitted') as submitted,
      count(*) filter (where d.status='awaiting') as awaiting,
      count(*) filter (where d.status='paid') as paid_reports,
      count(*) filter (where d.status='submitted' and d.updated_at <= now() - make_interval(hours=>coalesce(o.review_sla_hours,48))) as overdue
    from pos.kol_campaign_assignments a join pos.kol_brand_deliveries d on d.assignment_id=a.id
    where a.campaign_id=c.id
  ) reports`;

async function dashboard(pool: Pool, days: number, search: string) {
  const [snapshot, trend, businesses, directory] = await Promise.all([
    pool.query(
      `with campaigns as materialized (${summary})
      select (select coalesce(jsonb_agg(to_jsonb(page) order by page.overdue desc, page.submitted desc, page.id desc), '[]'::jsonb) from (
        select * from campaigns where strpos(lower(title || ' ' || brand),lower($1::text)) > 0 order by overdue desc, submitted desc, id desc limit 200
      ) page) as campaigns, (select jsonb_build_object(
        'campaigns',count(*),'published',count(*) filter (where status='published'),
        'funded',coalesce(sum(funded),0),'available',coalesce(sum(available),0),
        'reserved',coalesce(sum(reserved),0),'paid',coalesce(sum(paid),0),'refunded',coalesce(sum(refunded),0),
        'submitted',coalesce(sum(submitted),0),'overdue',coalesce(sum(overdue),0)
      ) from campaigns) as totals`,
      [search],
    ),
    pool.query(
      `with bounds as (
      select (now() at time zone 'Asia/Jakarta')::date as today
    ), days as (
      select today - i as day from bounds cross join generate_series(0,$1::int-1) i
    ), rewards as (
      select (p.created_at at time zone 'Asia/Jakarta')::date as day, sum(p.amount) as amount, count(*) as payouts
      from pos.kol_reward_payouts p join pos.kol_brand_campaigns c on c.campaign_id=p.campaign_id
      where p.created_at >= ((select min(day) from days)::timestamp at time zone 'Asia/Jakarta')
      group by 1
    )
    select days.day::text, coalesce(amount,0) as amount, coalesce(payouts,0) as payouts
    from days left join rewards using(day) order by days.day`,
      [days],
    ),
    pool.query(`select m.status,count(*)::int as total from pos.kol_brand_memberships m group by m.status`),
    pool.query(
      `select b.id,b.name,m.status,m.created_at
      from pos.kol_brand_memberships m join pos.kol_businesses b on b.id=m.business_id
      where strpos(lower(b.name),lower($1::text)) > 0
      order by (m.status='pending') desc, m.created_at desc, b.id desc limit 200`,
      [search],
    ),
  ]);
  return { ...snapshot.rows[0], trend: trend.rows, businesses: businesses.rows, directory: directory.rows };
}

async function campaign(pool: Pool, id: number) {
  const [settings, reports, platforms] = await Promise.all([
    pool.query(
      `select c.campaign_id, c.tasks, coalesce(o.internal_note,'') as internal_note,
      coalesce(o.review_sla_hours,48) as review_sla_hours, o.updated_at
      from pos.kol_brand_campaigns c left join pos.kol_brand_operations o using(campaign_id)
      where c.campaign_id=$1`,
      [id],
    ),
    pool.query(
      `select d.id, d.label, d.platform, d.status, d.amount, d.updated_at,
      k.username as creator, s.content_url,
      (d.dispute_note is not null and d.dispute_resolution is null) as escalated,
      (d.status='submitted' and d.updated_at <= now() - make_interval(hours=>coalesce(o.review_sla_hours,48))) as overdue
      from pos.kol_brand_deliveries d join pos.kol_campaign_assignments a on a.id=d.assignment_id
      join pos.kol_creators k on k.source_id=a.kol_id
      left join pos.kol_brand_operations o on o.campaign_id=a.campaign_id
      left join pos.kol_content_submissions s on s.brand_delivery_id=d.id
      where a.campaign_id=$1
      order by (d.status='submitted') desc, d.updated_at asc, d.id limit 1000`,
      [id],
    ),
    pool.query(
      `select d.platform, count(*) as assigned, count(*) filter (where d.status='submitted') as submitted,
      count(*) filter (where d.status='paid') as completed,
      coalesce(sum(d.amount) filter (where d.status='paid'),0) as paid
      from pos.kol_brand_deliveries d join pos.kol_campaign_assignments a on a.id=d.assignment_id
      where a.campaign_id=$1 group by d.platform order by d.platform`,
      [id],
    ),
  ]);
  if (!settings.rows[0]) return null;
  return { settings: settings.rows[0], reports: reports.rows, platforms: platforms.rows };
}

const bad = (error: string, status = 400) => json({ success: false, error }, status);
const ok = (data: unknown) => json({ success: true, data });

export function parseBrandOperations(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { reviewSlaHours, internalNote } = value as Record<string, unknown>;
  if (
    typeof reviewSlaHours !== "number" ||
    !Number.isInteger(reviewSlaHours) ||
    reviewSlaHours < 1 ||
    reviewSlaHours > 720 ||
    typeof internalNote !== "string" ||
    internalNote.trim().length > 1000
  )
    return null;
  return { reviewSlaHours, internalNote: internalNote.trim() };
}

export function registerKolBrandOperations(app: Hono, auth: typeof defaultAuth, pool: Pool) {
  const { owner, member } = createGuards(auth, pool);
  for (const [prefix, guard] of [
    ["/api/admin-manager/kol-brand", owner],
    ["/api/manager/kol-brand", member],
  ] as const) {
    const staff =
      (action: (c: Context, actor: string, canConfigure: boolean) => Promise<Response>) =>
      async (c: Context) => {
        try {
          const access = await guard(c);
          if ("res" in access && access.res) return access.res;
          if (!access.userId) return bad("UNAUTHORIZED", 401);
          return await action(c, access.userId, !("role" in access) || access.role === "manager");
        } catch (error) {
          console.error("Brand operations request failed", { code: (error as { code?: string })?.code });
          return bad("BRAND_OPERATIONS_UNAVAILABLE", 500);
        }
      };
    app.get(
      `${prefix}/dashboard`,
      staff(async (c, _actor, canConfigure) => {
        const days = Number(c.req.query("days") || 30);
        if (![7, 30, 90].includes(days)) return bad("INVALID_BRAND_PERIOD");
        const search = (c.req.query("q") || "").trim().slice(0, 120);
        return ok({ ...(await dashboard(pool, days, search)), canConfigure });
      }),
    );
    app.get(
      `${prefix}/operations/:id`,
      staff(async (c) => {
        const id = Number(c.req.param("id"));
        if (!Number.isSafeInteger(id) || id < 1) return bad("INVALID_ID");
        const data = await campaign(pool, id);
        return data ? ok(data) : bad("BRAND_CAMPAIGN_NOT_FOUND", 404);
      }),
    );
    app.post(
      `${prefix}/operations/:id`,
      staff(async (c, actor, canConfigure) => {
        if (!canConfigure) return bad("FORBIDDEN", 403);
        if (c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
          return bad("INVALID_BRAND_SETTINGS");
        const id = Number(c.req.param("id"));
        const settings = parseBrandOperations(await c.req.json().catch(() => null));
        if (!Number.isSafeInteger(id) || id < 1 || !settings) return bad("INVALID_BRAND_SETTINGS");
        const saved = await brandTransaction(pool, async (client) => {
          const { rows } = await client.query(
            `insert into pos.kol_brand_operations(campaign_id,review_sla_hours,internal_note,updated_by)
          select campaign_id,$2,$3,$4 from pos.kol_brand_campaigns where campaign_id=$1
          on conflict(campaign_id) do update set review_sla_hours=excluded.review_sla_hours,
            internal_note=excluded.internal_note,updated_by=excluded.updated_by,updated_at=now()
          returning review_sla_hours,internal_note,updated_at`,
            [id, settings.reviewSlaHours, settings.internalNote, actor],
          );
          if (rows[0])
            await client.query(
              `insert into pos.kol_brand_events(campaign_id,entity_id,action,actor,detail)
          values ($1,$1::bigint::text,'operations_updated',$2,jsonb_build_object('reviewSlaHours',$3::int,'note',$4::text))`,
              [id, actor, settings.reviewSlaHours, settings.internalNote],
            );
          return rows[0];
        });
        return saved ? ok(saved) : bad("BRAND_CAMPAIGN_NOT_FOUND", 404);
      }),
    );
  }
}
