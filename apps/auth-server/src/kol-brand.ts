import type { Context, Hono } from "hono";
import type { Pool, PoolClient } from "pg";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text } from "./manager-guards.js";
import { brandPost, httpsUrl, objectOf, parseBrandCampaign } from "./kol-brand-contract.js";
import {
  allowBrandWrites,
  assertBrandMember,
  brandFeePercent,
  brandCheckoutAvailable,
  brandTransaction,
  BrandFlowError,
  createBrandTopup,
  lockBrandCampaign,
  reconcileBrandTopup,
  resolveMissingInvoice,
} from "./kol-brand-funding.js";

type Queryable = Pool | PoolClient;
type Actor = { actor: string; userId: string; business?: number };
const base = "/api/kol/brand";
const admin = "/api/admin-manager/kol-brand";

const bodyOf = async (c: Context) => objectOf(await c.req.json().catch(() => null));
const reply = (data: unknown, status = 200) => json({ success: true, data }, status);
const numeric = (value: unknown) =>
  typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
const rupiahAmount = (value: unknown) =>
  Number.isSafeInteger(numeric(value)) && numeric(value) >= 1000 && numeric(value) <= 100000000;
const errors404 = new Set([
  "BRAND_NOT_FOUND",
  "APPLICATION_NOT_FOUND",
  "DELIVERY_NOT_FOUND",
  "BRAND_INVOICE_NOT_FOUND",
]);

function param(c: Context, name: string) {
  const value = Number(c.req.param(name));
  if (!Number.isSafeInteger(value) || value <= 0) throw new BrandFlowError("INVALID_ID", 400);
  return value;
}

export const handleBrandError = (error: unknown) => {
  if (error instanceof BrandFlowError) return json({ success: false, error: error.message }, error.status);
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === "P0001")
    return json({ success: false, error: message }, errors404.has(message || "") ? 404 : 409);
  if (code === "23505") return json({ success: false, error: "BRAND_DUPLICATE" }, 409);
  console.error("KOL Brand request failed", { code, name: (error as Error)?.name });
  return json({ success: false, error: "BRAND_REQUEST_FAILED" }, 500);
};

const campaignList = `select c.id,c.slug,c.title,c.status,c.business_id,b.name as brand,
  c.application_deadline::text,c.end_date::text,bc.quota,bc.reward_per_kol,
  t.funded,t.available,t.reserved,t.paid,t.refunded,
  (select count(*) from pos.kol_campaign_applications a where a.campaign_id = c.id and a.status = 'pending') as pending,
  (select count(*) from pos.kol_brand_deliveries d join pos.kol_campaign_assignments a on a.id = d.assignment_id
    where a.campaign_id = c.id and d.status = 'submitted') as in_review
  from pos.kol_campaigns c join pos.kol_brand_campaigns bc on bc.campaign_id = c.id
  join pos.kol_businesses b on b.id = c.business_id
  cross join lateral pos.kol_budget_totals(c.id) t`;

async function campaignDetail(db: Queryable, id: number, business?: number) {
  const {
    rows: [campaign],
  } = await db.query(
    `select overview.*, c.description as brief, c.terms, bc.tasks,
    pos.kol_brand_public(c.id)->>'slotsLeft' as slots_left,
    (now() at time zone 'Asia/Jakarta')::date > c.end_date as deadline_passed
    from (${campaignList} where c.id = $1 and ($2::bigint is null or c.business_id = $2)) overview
    join pos.kol_campaigns c on c.id = overview.id join pos.kol_brand_campaigns bc on bc.campaign_id = c.id`,
    [id, business ?? null],
  );
  if (!campaign) throw new BrandFlowError("BRAND_CAMPAIGN_NOT_FOUND", 404);
  const [applications, deliveries, deposits, ledger, audit, integrity] = await Promise.all([
    db.query(
      `select a.id,a.status,a.applied_at,a.reviewed_at,a.review_note,k.username,coalesce(p.display_name,k.name) as name
      from pos.kol_campaign_applications a join pos.kol_creators k on k.source_id = a.kol_id
      left join pos.kol_profiles p on p.kol_id = k.source_id where a.campaign_id = $1
      order by (a.status = 'pending') desc, a.applied_at limit 200`,
      [id],
    ),
    db.query(
      `select d.id,d.label,d.platform,d.amount,d.status,d.note,k.username,coalesce(p.display_name,k.name) as name,
      s.content_url,s.insight_screenshot_url,s.updated_at::text as proof_revision,po.wallet_ledger_key,po.created_at as paid_at,
      (d.dispute_note is not null and d.dispute_resolution is null) as with_admin,
      case when $2::boolean then d.dispute_note end as dispute_note, d.dispute_resolution
      from pos.kol_brand_deliveries d join pos.kol_campaign_assignments a on a.id = d.assignment_id
      join pos.kol_creators k on k.source_id = a.kol_id left join pos.kol_profiles p on p.kol_id = k.source_id
      left join pos.kol_content_submissions s on s.brand_delivery_id = d.id
      left join pos.kol_reward_payouts po on po.submission_id = s.id
      where a.campaign_id = $1 order by with_admin desc, (d.status = 'submitted') desc, d.id`,
      [id, !business],
    ),
    db.query(
      `select d.id,d.nominal,d.fee,d.total,d.invoice_id,d.invoice_url,d.created_at,d.paid_at,
      t.state,t.issue,t.provider_transaction_id,
      (select coalesce(sum(r.amount),0) from pos.kol_brand_refunds r where r.deposit_id = d.id) as refunded
      from pos.kol_budget_deposits d join pos.kol_brand_topups t on t.deposit_id = d.id
      where d.campaign_id = $1 order by d.created_at desc limit 100`,
      [id],
    ),
    db.query(
      `select id,kind,available_delta,reserved_delta,paid_delta,refunded_delta,ref_type,ref_id,note,created_at
      from pos.kol_budget_ledger where campaign_id = $1 order by id desc limit 100`,
      [id],
    ),
    business
      ? Promise.resolve({ rows: [] })
      : db.query(
          `select id,entity_id,action,actor,detail,created_at
      from pos.kol_brand_events where campaign_id = $1 order by id desc limit 100`,
          [id],
        ),
    db.query("select pos.kol_reward_integrity($1) as report", [id]),
  ]);
  return {
    campaign,
    applications: applications.rows,
    deliveries: deliveries.rows,
    deposits: deposits.rows,
    ledger: ledger.rows,
    events: audit.rows,
    integrity: integrity.rows[0].report,
    feePercent: brandFeePercent,
    paymentsEnabled: brandCheckoutAvailable(),
  };
}

export function registerKolBrandRoutes(app: Hono, auth: typeof defaultAuth, pool: Pool) {
  const { owner } = createGuards(auth, pool);
  const wrap = (fn: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      return await fn(c);
    } catch (error) {
      return handleBrandError(error);
    }
  };
  const session = async (c: Context) => {
    if (c.req.method !== "GET") {
      const origin = c.req.header("origin");
      if (origin && !["https://kol.djiwatentram.web.id", "http://localhost:3010"].includes(origin))
        throw new BrandFlowError("FORBIDDEN", 403);
    }
    const signed = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!signed?.user?.id) throw new BrandFlowError("UNAUTHORIZED", 401);
    return signed.user;
  };
  const asBrand = (fn: (c: Context, actor: Actor & { business: number }) => Promise<Response>) =>
    wrap(async (c) => {
      const user = await session(c);
      const business = param(c, "business");
      await assertBrandMember(pool, business, user.id);
      return fn(c, { actor: `brand:${user.id}`, userId: user.id, business });
    });
  const asAdmin = (fn: (c: Context, actor: Actor) => Promise<Response>) =>
    wrap(async (c) => {
      const user = await owner(c);
      return "res" in user ? user.res : fn(c, { actor: `admin:${user.userId}`, userId: user.userId });
    });

  app.get(
    `${base}/session`,
    wrap(async (c) => {
      const user = await session(c);
      const { rows } = await pool.query(
        `select b.id,b.name,m.status,m.review_note
      from pos.kol_brand_memberships m join pos.kol_businesses b on b.id = m.business_id
      where m.user_id = $1 order by m.created_at desc`,
        [user.id],
      );
      return reply(rows);
    }),
  );

  app.post(
    `${base}/register`,
    wrap(async (c) => {
      const user = await session(c);
      if (!user.email || !user.emailVerified) throw new BrandFlowError("BRAND_EMAIL_UNVERIFIED", 403);
      const input = await bodyOf(c);
      const name = text(input.name, 120);
      const phone = text(input.phone, 30).replace(/[\s-]/g, "");
      if (name.length < 2 || !/^\+?\d{8,16}$/.test(phone))
        throw new BrandFlowError("INVALID_BRAND_REGISTRATION", 400);

      const created = await brandTransaction(pool, async (db) => {
        await db.query('select id from public."user" where id = $1 for update', [user.id]);
        const existing = (
          await db.query(
            `select b.id,b.name,m.status from pos.kol_brand_memberships m join pos.kol_businesses b on b.id = m.business_id
        where m.user_id = $1 and m.status = 'pending'`,
            [user.id],
          )
        ).rows[0];
        if (existing) return existing;
        const {
          rows: [business],
        } = await db.query(
          "insert into pos.kol_businesses(name,status) values ($1,'inactive') returning id,name",
          [name],
        );
        await db.query(
          "insert into pos.kol_brand_memberships(business_id,user_id,contact_email,contact_phone) values ($1,$2,$3,$4)",
          [business.id, user.id, user.email, phone],
        );
        return { ...business, status: "pending" };
      });
      return reply(created, 201);
    }),
  );

  app.get(
    `${base}/:business/campaigns`,
    asBrand(async (_c, access) => {
      const { rows } = await pool.query(
        `${campaignList} where c.business_id = $1 order by c.created_at desc limit 100`,
        [access.business],
      );
      return reply(rows);
    }),
  );

  const saveCampaign = (editing: boolean) =>
    asBrand(async (c, access) => {
      const input = await bodyOf(c);
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", dateStyle: "short" }).format(
        new Date(),
      );
      const form = parseBrandCampaign(input, today);
      if (!form) throw new BrandFlowError("INVALID_BRAND_CAMPAIGN", 400);
      const rewardPerKol = form.tasks.reduce((sum, task) => sum + task.amount, 0);
      const id = editing ? param(c, "id") : null;
      const campaign = await brandTransaction(pool, async (db) => {
        await assertBrandMember(db, access.business, access.userId);
        await allowBrandWrites(db);
        if (id) {
          const locked = await lockBrandCampaign(db, id, access.business);
          if (locked.status !== "draft") throw new BrandFlowError("BRAND_DRAFT_REQUIRED");
        }
        const summary = form.tasks.map((task) => task.label).join(", ");
        const rows = id
          ? (
              await db.query(
                `update pos.kol_campaigns set title=$1,description=$2,terms=$3,application_deadline=$4,
        end_date=$5,deliverable_summary=$6,updated_at=now() where id=$7 returning id,slug`,
                [form.title, form.brief, [form.terms], form.applicationDeadline, form.deadline, summary, id],
              )
            ).rows
          : (
              await db.query(
                `insert into pos.kol_campaigns(slug,title,description,terms,application_deadline,end_date,
          deliverable_summary,business_id,created_by,application_mode)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') returning id,slug`,
                [
                  `brand-${crypto.randomUUID()}`,
                  form.title,
                  form.brief,
                  [form.terms],
                  form.applicationDeadline,
                  form.deadline,
                  summary,
                  access.business,
                  access.actor,
                ],
              )
            ).rows;
        await db.query(
          `insert into pos.kol_brand_campaigns(campaign_id,quota,reward_per_kol,tasks) values($1,$2,$3,$4)
        on conflict(campaign_id) do update set quota=excluded.quota,reward_per_kol=excluded.reward_per_kol,tasks=excluded.tasks`,
          [rows[0].id, form.quota, rewardPerKol, JSON.stringify(form.tasks)],
        );
        return rows[0];
      });
      return reply(campaign, editing ? 200 : 201);
    });

  app.post(`${base}/:business/campaigns`, saveCampaign(false));
  app.patch(`${base}/:business/campaigns/:id`, saveCampaign(true));
  app.get(
    `${base}/:business/campaigns/:id`,
    asBrand(async (c, a) => reply(await campaignDetail(pool, param(c, "id"), a.business))),
  );

  app.post(
    `${base}/:business/campaigns/:id/status`,
    asBrand(async (c, access) => {
      const input = await bodyOf(c);
      const next = input.status;
      if (next !== "published" && next !== "closed") throw new BrandFlowError("INVALID_CAMPAIGN_STATUS", 400);
      const id = param(c, "id");
      return reply(
        await brandTransaction(pool, async (db) => {
          await assertBrandMember(db, access.business, access.userId);
          const cp = await lockBrandCampaign(db, id, access.business);
          if (cp.status === next) return { status: next };
          if (next === "published") {
            if (cp.status !== "draft") throw new BrandFlowError("BRAND_DRAFT_REQUIRED");
            const {
              rows: [window],
            } = await db.query(
              `select application_deadline >= (now() at time zone 'Asia/Jakarta')::date as valid
          from pos.kol_campaigns where id=$1`,
              [id],
            );
            if (!window.valid) throw new BrandFlowError("CAMPAIGN_NOT_OPEN");
            const {
              rows: [budget],
            } = await db.query("select available from pos.kol_budget_totals($1)", [id]);
            if (Number(budget.available) < Number(cp.reward_per_kol))
              throw new BrandFlowError("BRAND_NO_FUNDED_SLOT");
          } else if (!["published", "draft"].includes(cp.status))
            throw new BrandFlowError("CAMPAIGN_NOT_OPEN");
          await allowBrandWrites(db);
          await db.query("update pos.kol_campaigns set status=$2,updated_at=now() where id=$1", [id, next]);
          await db.query(
            `insert into pos.kol_brand_events(campaign_id,entity_id,action,actor) values($1,$1::bigint::text,$2,$3)`,
            [id, next === "published" ? "campaign_published" : "campaign_closed", access.actor],
          );
          return { status: next };
        }),
      );
    }),
  );

  app.post(
    `${base}/:business/campaigns/:id/topups`,
    asBrand(async (c, a) => {
      const input = await bodyOf(c);
      if (
        !rupiahAmount(input.nominal) ||
        typeof input.key !== "string" ||
        !/^[a-zA-Z0-9-]{16,60}$/.test(input.key)
      ) {
        throw new BrandFlowError("INVALID_BRAND_TOPUP", 400);
      }
      return reply(
        await createBrandTopup(pool, a.business, param(c, "id"), a.userId, Number(input.nominal), input.key),
        201,
      );
    }),
  );
  app.post(
    `${base}/:business/campaigns/:id/topups/:deposit/check`,
    asBrand(async (c, a) =>
      reply(await reconcileBrandTopup(pool, param(c, "id"), c.req.param("deposit") || "", a.business)),
    ),
  );

  const reviewTarget = async (c: Context, access: Actor) => {
    const id = param(c, "id");
    if (access.business) {
      const target = await pool.query("select 1 from pos.kol_campaigns where id=$1 and business_id=$2", [
        id,
        access.business,
      ]);
      if (!target.rows.length) throw new BrandFlowError("BRAND_CAMPAIGN_NOT_FOUND", 404);
    }
    return id;
  };
  const reviewApplication = async (c: Context, access: Actor) => {
    const input = await bodyOf(c);
    if (typeof input.approve !== "boolean") throw new BrandFlowError("INVALID_REVIEW_ACTION", 400);
    const note = text(input.note, 1000);
    if (!input.approve && !note) throw new BrandFlowError("REVIEW_NOTE_REQUIRED", 400);
    const {
      rows: [row],
    } = await pool.query("select pos.kol_brand_review_application($1,$2,$3,$4,$5) as result", [
      await reviewTarget(c, access),
      param(c, "application"),
      input.approve,
      access.actor,
      note || null,
    ]);
    return reply(row.result);
  };
  const reviewDelivery = async (c: Context, access: Actor) => {
    const input = await bodyOf(c);
    const action = text(input.action, 20);
    if (!["approve", "revision", "reject", ...(access.business ? [] : ["expire"])].includes(action))
      throw new BrandFlowError("INVALID_REVIEW_ACTION", 400);
    const revision = text(input.revision, 63);
    if (action !== "expire" && !Number.isFinite(Date.parse(revision)))
      throw new BrandFlowError("DELIVERY_CHANGED", 400);
    const {
      rows: [row],
    } = await pool.query("select pos.kol_brand_review_delivery($1,$2,$3,$4,$5,$6) as result", [
      await reviewTarget(c, access),
      param(c, "delivery"),
      action,
      access.actor,
      text(input.note, 1000) || null,
      revision || null,
    ]);
    return reply(row.result);
  };
  app.post(`${base}/:business/campaigns/:id/applications/:application`, asBrand(reviewApplication));
  app.post(`${base}/:business/campaigns/:id/reports/:delivery`, asBrand(reviewDelivery));

  app.get(
    admin,
    asAdmin(async () => {
      const [businesses, campaigns] = await Promise.all([
        pool.query(`select b.id,b.name,m.contact_email,m.contact_phone,m.status,m.review_note,m.created_at
        from pos.kol_brand_memberships m join pos.kol_businesses b on b.id = m.business_id
        order by (m.status = 'pending') desc,m.created_at desc limit 200`),
        pool.query(`${campaignList} order by c.created_at desc limit 200`),
      ]);
      return reply({ businesses: businesses.rows, campaigns: campaigns.rows });
    }),
  );
  app.post(
    `${admin}/businesses/:business/review`,
    asAdmin(async (c, a) => {
      const business = param(c, "business");
      const input = await bodyOf(c);
      const note = text(input.note, 1000);
      if (typeof input.approve !== "boolean" || (!input.approve && !note))
        throw new BrandFlowError("INVALID_BRAND_REVIEW", 400);
      const status = input.approve ? "active" : "rejected";
      await brandTransaction(pool, async (db) => {
        await allowBrandWrites(db);
        const result = await db.query(
          `update pos.kol_brand_memberships set status=$2,reviewed_by=$3,review_note=$4,reviewed_at=now()
        where business_id=$1 and status='pending' returning business_id`,
          [business, status, a.actor, note || null],
        );
        if (!result.rows.length) throw new BrandFlowError("BRAND_REVIEW_UNAVAILABLE");
        await db.query("update pos.kol_businesses set status=$2 where id=$1", [
          business,
          input.approve ? "active" : "inactive",
        ]);
      });
      return reply({ status });
    }),
  );
  app.get(
    `${admin}/campaigns/:id`,
    asAdmin(async (c) => reply(await campaignDetail(pool, param(c, "id")))),
  );
  app.post(`${admin}/campaigns/:id/applications/:application`, asAdmin(reviewApplication));
  app.post(`${admin}/campaigns/:id/reports/:delivery`, asAdmin(reviewDelivery));
  app.post(
    `${admin}/campaigns/:id/topups/:deposit/check`,
    asAdmin(async (c) =>
      reply(await reconcileBrandTopup(pool, param(c, "id"), c.req.param("deposit") || "")),
    ),
  );
  app.post(
    `${admin}/campaigns/:id/topups/:deposit/recover`,
    asAdmin(async (c, a) => {
      const input = await bodyOf(c);
      const invoiceId = text(input.invoiceId, 120);
      const note = text(input.note, 1000);
      if (!note || (!invoiceId && input.noInvoice !== true))
        throw new BrandFlowError("REVIEW_NOTE_REQUIRED", 400);
      return reply(
        await resolveMissingInvoice(
          pool,
          param(c, "id"),
          c.req.param("deposit") || "",
          invoiceId ? { invoiceId } : { noInvoice: true },
          a.actor,
          note,
        ),
      );
    }),
  );
  app.post(
    `${admin}/campaigns/:id/refunds`,
    asAdmin(async (c, a) => {
      const input = await bodyOf(c);
      const reference = text(input.reference, 150);
      const deposit = text(input.deposit, 100);
      const amount = numeric(input.amount);
      if (
        !reference ||
        !deposit ||
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        input.confirmed !== true
      ) {
        throw new BrandFlowError("REFUND_AMOUNT_INVALID", 400);
      }
      const {
        rows: [row],
      } = await pool.query("select pos.kol_brand_record_refund($1,$2,$3,$4,$5) as id", [
        param(c, "id"),
        deposit,
        amount,
        reference,
        a.actor,
      ]);
      return reply(row);
    }),
  );
}

export async function submitBrandReport(
  pool: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  deliveryId: number,
  creator: { source_id: string; userId: string },
  input: Record<string, unknown>,
) {
  const {
    rows: [delivery],
  } = await pool.query(
    `select d.platform from pos.kol_brand_deliveries d
    join pos.kol_campaign_assignments a on a.id=d.assignment_id where d.id=$1 and a.kol_id=$2`,
    [deliveryId, creator.source_id],
  );
  if (!delivery) throw new BrandFlowError("DELIVERY_NOT_FOUND", 404);
  const post = brandPost(input.contentUrl, delivery.platform);
  const screenshot =
    input.screenshotUrl == null || input.screenshotUrl === "" ? null : httpsUrl(input.screenshotUrl);
  if (!post || (input.screenshotUrl && !screenshot)) throw new BrandFlowError("INVALID_BRAND_POST", 400);
  const {
    rows: [result],
  } = await pool.query("select pos.kol_brand_submit($1,$2,$3,$4,$5,$6) as result", [
    deliveryId,
    creator.source_id,
    creator.userId,
    post.url,
    post.key,
    screenshot?.href ?? null,
  ]);
  return result.result;
}
