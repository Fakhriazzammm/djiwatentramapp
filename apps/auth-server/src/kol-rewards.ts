import type { Hono } from "hono";
import type { Pool } from "pg";
import type { auth as defaultAuth } from "./auth.js";
import { createGuards, json, text } from "./manager-guards.js";
import { checkPin, pinResponse } from "./pay-account.js";

/**
 * Reward KOL berbasis view. Anggaran Bisnis dicadangkan per KOL, dibayar ke saldo Djiwa Pay setelah view
 * terverifikasi pada H+N. Semua uang bergerak lewat fungsi SQL pos.kol_* (idempoten, berkunci); modul ini hanya
 * memvalidasi input, memanggil fungsi tersebut, dan membentuk respons untuk Admin, Manager, dan portal KOL.
 */
type Auth = typeof defaultAuth;

export type RewardRules = { ratePer1000: number; minViews: number; maxPerContent: number | null; maxPerKol: number | null; settleDays: number; platforms: string[] };

const MAYAR_PROXY_URL = process.env.MAYAR_PROXY_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const MAYAR_DEFAULT_MOBILE = process.env.MAYAR_DEFAULT_MOBILE || "";
/** Perkiraan biaya QRIS Mayar (persen dari nominal). Biaya ditanggung Bisnis, bukan dipotong dari anggaran. */
export const BUDGET_FEE_PERCENT = Number(process.env.KOL_BUDGET_FEE_PERCENT ?? "0.7");
const REWARD_PLATFORMS = ["TikTok", "Instagram", "YouTube", "Threads"];
const DEPOSIT_METHODS = ["mayar", "djiwapay", "manual"] as const;

/** Setiap view dihitung: floor(view x tarif per 1.000 / 1.000), lalu dibatasi maksimal per konten dan per KOL. */
export function rewardAmount(views: number, rules: Pick<RewardRules, "ratePer1000" | "minViews" | "maxPerContent" | "maxPerKol">) {
  const v = Math.max(0, Math.floor(Number(views) || 0));
  const computed = v < (rules.minViews || 0) ? 0 : Math.floor((v * rules.ratePer1000) / 1000);
  const cap = Math.min(rules.maxPerKol ?? Number.MAX_SAFE_INTEGER, rules.maxPerContent ?? Number.MAX_SAFE_INTEGER);
  return { computed, amount: Math.min(computed, cap), capped: computed > cap };
}

export const estimateBudgetFee = (nominal: number, percent = BUDGET_FEE_PERCENT) => Math.ceil((nominal * Math.max(0, percent)) / 100);

/** ID video TikTok memuat waktu tayang (detik di 32 bit teratas). Link pendek (vm.tiktok.com) tidak bisa dibaca. */
export function parseTikTokVideo(url: string): { videoId: string; postedAt: Date } | null {
  const id = /\/video\/(\d{15,22})/.exec(url)?.[1];
  if (!id) return null;
  const seconds = Number(BigInt(id) >> 32n);
  const postedAt = new Date(seconds * 1000);
  return Number.isNaN(postedAt.getTime()) ? null : { videoId: id, postedAt };
}

export type ReviewState = "paid" | "needs_date" | "waiting" | "due" | "ready";
export function reviewState(row: { payout_id?: unknown; settle_due_at?: string | Date | null; last_views?: number | null }, now = new Date()): ReviewState {
  if (row.payout_id) return "paid";
  if (!row.settle_due_at) return "needs_date";
  if (new Date(row.settle_due_at).getTime() > now.getTime()) return "waiting";
  return row.last_views === null || row.last_views === undefined ? "due" : "ready";
}
export const daysUntil = (value: string | Date | null | undefined, now = new Date()) =>
  value ? Math.ceil((new Date(value).getTime() - now.getTime()) / 86_400_000) : null;

export function parseRules(body: Record<string, unknown>): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const int = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const enabled = body.rewardsEnabled === true;
  const rate = int(body.ratePer1000), minViews = int(body.minViews) ?? 0, perKol = int(body.maxPerKol), perContent = int(body.maxPerContent), days = int(body.settleDays) ?? 7;
  const platforms = Array.isArray(body.platforms) ? body.platforms.map(String).filter((p) => REWARD_PLATFORMS.includes(p)) : ["TikTok"];
  const bad = (v: number | null, min: number) => v !== null && (!Number.isSafeInteger(v) || v < min);
  if (bad(rate, 1) || bad(minViews, 0) || bad(perKol, 1) || bad(perContent, 1) || bad(days, 1) || (days !== null && days > 60)) return { ok: false, error: "INVALID_REWARD_RULES" };
  if (enabled && (rate === null || perKol === null || !platforms.length)) return { ok: false, error: "INVALID_REWARD_RULES" };
  return { ok: true, value: { enabled, rate, minViews, perKol, perContent, days, platforms: [...new Set(platforms)] } };
}

const SQL_ERRORS: Record<string, number> = {
  CAMPAIGN_NOT_FOUND: 404, SUBMISSION_NOT_FOUND: 404, DEPOSIT_NOT_FOUND: 404, CAMPAIGN_FULL: 409, REWARD_BUDGET_INSUFFICIENT: 409,
  INVALID_AMOUNT: 400, INVALID_METHOD: 400, INVALID_VIEWS: 400, INVALID_SOURCE: 400, BUSINESS_REQUIRED: 409, BUSINESS_WALLET_MISSING: 409,
  INSUFFICIENT_BALANCE: 409, WALLET_BLOCKED: 409, REWARD_NOT_ENABLED: 409, PLATFORM_NOT_REWARDED: 409, CONTENT_REJECTED: 409,
  POSTED_AT_MISSING: 409, SETTLE_NOT_DUE: 409, RESERVE_INSUFFICIENT: 409, KOL_NOT_LINKED: 409, CAMPAIGN_NOT_CLOSED: 409,
  RESERVE_STILL_HELD: 409, DEPOSIT_NOT_PENDING: 409,
};
export const sqlError = (error: any) => (error?.code === "P0001" && SQL_ERRORS[error.message] ? { code: String(error.message), status: SQL_ERRORS[error.message] } : null);

const reviewSelect = `
  s.id, s.deliverable_type, s.required_platform, s.content_url, s.status, s.insight_screenshot_url, s.video_id,
  s.posted_at, s.settle_due_at, s.created_at,
  c.id as campaign_id, c.title as campaign_title, c.slug as campaign_slug, k.source_id as kol_id, k.name as kol_name, k.username as kol_username,
  ap.id as application_id, ap.reward_rules_snapshot as rules,
  po.id as payout_id, po.amount as payout_amount, po.views as payout_views, po.computed_amount as payout_computed,
  po.released as payout_released, po.rate_per_1000 as payout_rate, po.created_at as paid_at,
  v.views as last_views, v.source as last_source, v.evidence_url as last_evidence, v.created_at as last_at,
  (select coalesce(sum(l.reserved_delta), 0)::bigint from pos.kol_budget_ledger l where l.ref_type = 'application' and l.ref_id = ap.id::text) as reserved
  from pos.kol_content_submissions s
  join pos.kol_campaign_assignments a on a.id = s.campaign_assignment_id
  join pos.kol_campaigns c on c.id = a.campaign_id
  join pos.kol_creators k on k.source_id = a.kol_id
  join pos.kol_campaign_applications ap on ap.campaign_id = a.campaign_id and ap.kol_id = a.kol_id and ap.reward_rules_snapshot is not null
  left join pos.kol_reward_payouts po on po.submission_id = s.id
  left join lateral (select views, source, evidence_url, created_at from pos.kol_view_snapshots where submission_id = s.id order by id desc limit 1) v on true
 where coalesce(s.required_platform, s.deliverable_type) in (select jsonb_array_elements_text(ap.reward_rules_snapshot -> 'platforms'))`;

function shapeReview(row: any, now = new Date()) {
  const rules = row.rules as RewardRules;
  const views = row.payout_views ?? row.last_views ?? null;
  const est = views === null ? null : rewardAmount(Number(views), rules);
  return {
    id: Number(row.id), campaignId: Number(row.campaign_id), campaignTitle: row.campaign_title, campaignSlug: row.campaign_slug,
    kolId: row.kol_id, kolName: row.kol_name, kolUsername: row.kol_username, platform: row.required_platform || row.deliverable_type,
    contentUrl: row.content_url, contentStatus: row.status, screenshotUrl: row.insight_screenshot_url, videoId: row.video_id,
    postedAt: row.posted_at, dueAt: row.settle_due_at, daysLeft: daysUntil(row.settle_due_at, now), createdAt: row.created_at,
    state: reviewState(row, now), views, viewsSource: row.last_source, viewsEvidence: row.last_evidence, viewsAt: row.last_at,
    estimate: est?.amount ?? null, computed: est?.computed ?? null, capped: est?.capped ?? false, rules, reserved: Number(row.reserved),
    payout: row.payout_id ? { id: Number(row.payout_id), amount: Number(row.payout_amount), views: Number(row.payout_views), computed: Number(row.payout_computed), released: Number(row.payout_released), rate: Number(row.payout_rate), paidAt: row.paid_at } : null,
  };
}

async function campaignSummaries(pool: Pool) {
  const r = await pool.query(`
    select c.id, c.slug, c.title, c.status, c.rewards_enabled, c.reward_per_1000, c.reward_min_views, c.reward_max_per_content,
           c.reward_max_per_kol, c.reward_settle_days, c.reward_platforms, c.business_id, b.name as business_name,
           t.funded, t.available, t.reserved, t.paid, t.refunded, pos.kol_reward_public(c.id) as reward,
           (select count(*)::int from pos.kol_campaign_applications ap where ap.campaign_id = c.id and ap.status = 'pending') as pending_applications
      from pos.kol_campaigns c
      left join pos.kol_businesses b on b.id = c.business_id
      cross join lateral pos.kol_budget_totals(c.id) t
     order by c.created_at desc limit 200`);
  return r.rows.map((x: any) => ({
    id: Number(x.id), slug: x.slug, title: x.title, status: x.status, rewardsEnabled: x.rewards_enabled, businessId: x.business_id ? Number(x.business_id) : null,
    businessName: x.business_name, ratePer1000: x.reward_per_1000, minViews: x.reward_min_views, maxPerContent: x.reward_max_per_content,
    maxPerKol: x.reward_max_per_kol, settleDays: x.reward_settle_days, platforms: x.reward_platforms, pendingApplications: x.pending_applications,
    funded: Number(x.funded), available: Number(x.available), reserved: Number(x.reserved), paid: Number(x.paid), refunded: Number(x.refunded),
    slotsLeft: x.reward?.slotsLeft ?? null, slotsTotal: x.reward?.slotsTotal ?? null,
  }));
}

async function reviewRows(pool: Pool, where = "", params: unknown[] = []) {
  const r = await pool.query(`select ${reviewSelect} ${where} order by (po.id is not null), s.settle_due_at nulls first, s.id desc limit 300`, params);
  return r.rows.map((x: any) => shapeReview(x));
}

/** Bagian baca saja yang dipakai Admin dan Manager. */
async function overview(pool: Pool) {
  const [campaigns, reviews] = await Promise.all([campaignSummaries(pool), reviewRows(pool)]);
  const active = campaigns.filter((c: any) => c.rewardsEnabled);
  const sum = (key: string) => active.reduce((n: number, c: any) => n + c[key], 0);
  const todayDue = reviews.filter((r: any) => r.state === "due" || r.state === "ready").length;
  const alerts: Array<{ kind: string; title: string; body: string }> = [];
  for (const c of active) if (c.maxPerKol && c.available < c.maxPerKol) alerts.push({ kind: "budget", title: "Anggaran hampir habis", body: `${c.title}: tersedia Rp${c.available.toLocaleString("id-ID")}, di bawah batas per KOL Rp${c.maxPerKol.toLocaleString("id-ID")}.` });
  for (const r of reviews.filter((x: any) => x.state === "needs_date")) alerts.push({ kind: "date", title: "Tanggal tayang belum terbaca", body: `${r.kolName} · ${r.campaignTitle}. Isi tanggal tayang agar tenggat H+N terhitung.` });
  for (const r of reviews.filter((x: any) => x.state === "due")) alerts.push({ kind: "views", title: "Jatuh tempo, view belum diisi", body: `${r.kolName} · ${r.campaignTitle}.` });
  const totals = { funded: sum("funded"), available: sum("available"), reserved: sum("reserved"), paid: sum("paid"), refunded: sum("refunded") };
  const need = reviews.filter((r: any) => r.state !== "paid").reduce((n: number, r: any) => n + (r.estimate ?? 0), 0);
  return { campaigns, reviews, totals, dueCount: todayDue, waitingCount: reviews.filter((r: any) => r.state === "waiting").length, attentionCount: alerts.length, estimatedNeed: need, alerts };
}

export function registerKolRewardRoutes(app: Hono, auth: Auth, pool: Pool) {
  const { member, owner } = createGuards(auth, pool);
  const fail = (error: any, fallback = "REWARD_FAILED") => {
    const known = sqlError(error);
    if (known) return json({ success: false, error: known.code }, known.status);
    if (error?.code === "23505") return json({ success: false, error: "DUPLICATE" }, 409);
    console.error("kol-rewards", error);
    return json({ success: false, error: fallback }, 500);
  };
  const guard = async (c: any) => { const o = await owner(c); return "res" in o ? o : o; };
  const actorOf = (o: { userId: string }) => `admin:${o.userId}`;
  const id = (c: any, name = "id") => { const n = Number(c.req.param(name)); return Number.isSafeInteger(n) && n > 0 ? n : null; };

  /* ---------- Manager: ringkasan baca saja ---------- */
  app.get("/api/manager/kol-rewards", async (c) => {
    const m = await member(c);
    if ("res" in m) return m.res;
    if (m.role !== "manager") return json({ success: false, error: "FORBIDDEN" }, 403);
    return json({ success: true, data: await overview(pool) });
  });

  /* ---------- Admin ---------- */
  app.get("/api/admin-manager/kol-rewards", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const businesses = await pool.query(`select b.id, b.name, b.status, b.owner_customer_id, cu.name as owner_name, cu.email as owner_email,
        coalesce(w.available_balance, 0)::bigint as owner_balance
        from pos.kol_businesses b left join pos.customers cu on cu.source_id = b.owner_customer_id
        left join pos.customer_wallets w on w.customer_id = b.owner_customer_id order by b.id`);
    return json({ success: true, data: { ...(await overview(pool)), businesses: businesses.rows, feePercent: BUDGET_FEE_PERCENT } });
  });

  app.get("/api/admin-manager/kol-rewards/campaigns/:id", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const cid = id(c); if (!cid) return json({ success: false, error: "INVALID_ID" }, 400);
    const [summary, deposits, ledger, integrity, reviews] = await Promise.all([
      campaignSummaries(pool),
      pool.query(`select id, method, nominal, fee, total, status, invoice_url, note, created_by, created_at, paid_at from pos.kol_budget_deposits where campaign_id = $1 order by created_at desc limit 50`, [cid]),
      pool.query(`select id, kind, available_delta, reserved_delta, paid_delta, refunded_delta, ref_type, ref_id, note, actor, created_at from pos.kol_budget_ledger where campaign_id = $1 order by id desc limit 200`, [cid]),
      pool.query(`select pos.kol_reward_integrity($1) as report`, [cid]),
      reviewRows(pool, "and c.id = $1", [cid]),
    ]);
    const campaign = summary.find((x: any) => x.id === cid);
    if (!campaign) return json({ success: false, error: "CAMPAIGN_NOT_FOUND" }, 404);
    return json({ success: true, data: { campaign, deposits: deposits.rows, ledger: ledger.rows, integrity: integrity.rows[0]?.report, reviews, feePercent: BUDGET_FEE_PERCENT } });
  });

  app.post("/api/admin-manager/kol-rewards/campaigns/:id/rules", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const cid = id(c); if (!cid) return json({ success: false, error: "INVALID_ID" }, 400);
    const parsed = parseRules((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, 400);
    const v = parsed.value as any;
    try {
      const r = await pool.query(
        `update pos.kol_campaigns set rewards_enabled = $2, reward_per_1000 = $3, reward_min_views = $4, reward_max_per_kol = $5, reward_max_per_content = $6,
                reward_settle_days = $7, reward_platforms = $8::text[], business_id = coalesce(business_id, (select min(id) from pos.kol_businesses where status = 'active')),
                updated_at = now() where id = $1 returning id`,
        [cid, v.enabled, v.rate, v.minViews, v.perKol, v.perContent, v.days, v.platforms]);
      if (!r.rows[0]) return json({ success: false, error: "CAMPAIGN_NOT_FOUND" }, 404);
      return json({ success: true, data: (await campaignSummaries(pool)).find((x: any) => x.id === cid) });
    } catch (error: any) {
      if (error?.code === "23514") return json({ success: false, error: "INVALID_REWARD_RULES" }, 400);
      return fail(error);
    }
  });

  app.post("/api/admin-manager/kol-rewards/businesses/:id/owner", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const bid = id(c); if (!bid) return json({ success: false, error: "INVALID_ID" }, 400);
    const email = text(((await c.req.json().catch(() => ({}))) as any).email, 200).toLowerCase();
    const customer = email ? (await pool.query(`select source_id, name, email from pos.customers where lower(btrim(email)) = $1 and coalesce(is_active, true) limit 1`, [email])).rows[0] : null;
    if (!customer) return json({ success: false, error: "CUSTOMER_NOT_FOUND" }, 404);
    await pool.query(`update pos.kol_businesses set owner_customer_id = $2 where id = $1`, [bid, customer.source_id]);
    return json({ success: true, data: { ownerCustomerId: customer.source_id, ownerName: customer.name, ownerEmail: customer.email } });
  });

  async function createMayarInvoice(deposit: any, payer: { name: string; email: string; phone: string }, campaignTitle: string) {
    if (!MAYAR_PROXY_URL) throw new Error("MAYAR_NOT_CONFIGURED");
    const response = await fetch(MAYAR_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}) },
      body: JSON.stringify({
        action: "create-invoice", name: payer.name, email: payer.email, mobile: payer.phone || MAYAR_DEFAULT_MOBILE,
        description: `Anggaran kampanye KOL: ${campaignTitle}`, expiredAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        items: [{ quantity: 1, rate: Number(deposit.total), description: `Anggaran KOL Rp${Number(deposit.nominal).toLocaleString("id-ID")} + biaya Rp${Number(deposit.fee).toLocaleString("id-ID")}` }],
        extraData: { kolBudgetDepositId: deposit.id },
      }),
    });
    const payload = await response.json().catch(() => ({})) as any;
    const data = payload?.data || {};
    const link = data.link || data.paymentUrl || data.url;
    if (!response.ok || !payload.success || !data.id || !link) throw new Error("INVOICE_FAILED");
    return { invoiceId: String(data.id), link: String(link) };
  }

  app.post("/api/admin-manager/kol-rewards/campaigns/:id/deposits", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const cid = id(c); if (!cid) return json({ success: false, error: "INVALID_ID" }, 400);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const method = text(b.method, 20) as (typeof DEPOSIT_METHODS)[number];
    const nominal = Number(b.nominal);
    const key = text(b.key, 80);
    if (!DEPOSIT_METHODS.includes(method) || !Number.isSafeInteger(nominal) || nominal < 1000 || !key) return json({ success: false, error: "INVALID_DEPOSIT" }, 400);
    const note = text(b.note, 300);
    const camp = (await pool.query(`select c.title, b.owner_customer_id, cu.name as owner_name, cu.email as owner_email, cu.phone as owner_phone
        from pos.kol_campaigns c left join pos.kol_businesses b on b.id = c.business_id left join pos.customers cu on cu.source_id = b.owner_customer_id where c.id = $1`, [cid])).rows[0];
    if (!camp) return json({ success: false, error: "CAMPAIGN_NOT_FOUND" }, 404);
    if (method === "manual" && !note) return json({ success: false, error: "NOTE_REQUIRED" }, 400);
    if (method === "djiwapay") {
      if (!camp.owner_customer_id) return json({ success: false, error: "BUSINESS_WALLET_MISSING" }, 409);
      const verdict = await checkPin(pool, camp.owner_customer_id, b.pin);
      if (!verdict.ok) return pinResponse(json as never, verdict);
    }
    if (method === "mayar" && !camp.owner_email) return json({ success: false, error: "PAYER_EMAIL_REQUIRED" }, 409);
    try {
      const fee = method === "mayar" ? estimateBudgetFee(nominal) : 0;
      let row = (await pool.query(`select * from pos.kol_budget_deposit_create($1,$2,$3,$4,$5,$6,$7)`, [cid, method, nominal, fee, note, actorOf(o), key])).rows[0];
      if (method === "mayar" && row.status === "pending" && !row.invoice_url) {
        try {
          const invoice = await createMayarInvoice(row, { name: camp.owner_name || "Djiwa Tentram", email: camp.owner_email, phone: camp.owner_phone || "" }, camp.title);
          row = (await pool.query(`update pos.kol_budget_deposits set invoice_id = $2, invoice_url = $3 where id = $1 returning *`, [row.id, invoice.invoiceId, invoice.link])).rows[0];
        } catch (error) {
          await pool.query(`update pos.kol_budget_deposits set status = 'cancelled' where id = $1 and status = 'pending'`, [row.id]);
          console.error("kol-rewards invoice", error);
          return json({ success: false, error: "INVOICE_FAILED" }, 502);
        }
      }
      return json({ success: true, data: row }, 201);
    } catch (error) { return fail(error); }
  });

  app.post("/api/admin-manager/kol-rewards/deposits/:depositId/check", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const depositId = text(c.req.param("depositId"), 80);
    const d = (await pool.query(`select * from pos.kol_budget_deposits where id = $1`, [depositId])).rows[0];
    if (!d) return json({ success: false, error: "DEPOSIT_NOT_FOUND" }, 404);
    if (d.status !== "pending" || d.method !== "mayar" || !d.invoice_id) return json({ success: true, data: d });
    if (!MAYAR_PROXY_URL) return json({ success: false, error: "MAYAR_NOT_CONFIGURED" }, 503);
    const response = await fetch(MAYAR_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}) },
      body: JSON.stringify({ action: "get-invoice-detail", invoiceId: d.invoice_id }),
    });
    const payload = await response.json().catch(() => ({})) as any;
    const status = String(payload?.data?.status || "").toLowerCase();
    if (!response.ok || !payload.success) return json({ success: true, data: d, note: "STATUS_UNAVAILABLE" });
    if (["paid", "success", "completed", "settled"].includes(status)) {
      const row = (await pool.query(`select * from pos.kol_budget_deposit_settle($1,$2)`, [d.id, `mayar:${d.invoice_id}`])).rows[0];
      return json({ success: true, data: row });
    }
    if (["expired", "closed", "cancelled", "canceled", "void"].includes(status)) {
      const row = (await pool.query(`update pos.kol_budget_deposits set status = 'expired' where id = $1 and status = 'pending' returning *`, [d.id])).rows[0];
      return json({ success: true, data: row ?? d });
    }
    return json({ success: true, data: d });
  });

  app.get("/api/admin-manager/kol-rewards/reviews/:id", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const sid = id(c); if (!sid) return json({ success: false, error: "INVALID_ID" }, 400);
    const [rows, snaps] = await Promise.all([
      reviewRows(pool, "and s.id = $1", [sid]),
      pool.query(`select id, views, source, evidence_url, note, created_by, created_at from pos.kol_view_snapshots where submission_id = $1 order by id desc limit 20`, [sid]),
    ]);
    if (!rows[0]) return json({ success: false, error: "SUBMISSION_NOT_FOUND" }, 404);
    return json({ success: true, data: { review: rows[0], snapshots: snaps.rows } });
  });

  const viewInput = (b: Record<string, unknown>) => {
    const views = Number(b.views);
    const source = text(b.source, 20) || "manual";
    if (!Number.isSafeInteger(views) || views < 0 || views > 2_000_000_000 || !["manual", "screenshot"].includes(source)) return null;
    return { views, source, evidence: text(b.evidence, 2048), note: text(b.note, 500) };
  };

  app.post("/api/admin-manager/kol-rewards/reviews/:id/views", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const sid = id(c); const v = viewInput((await c.req.json().catch(() => ({}))) as any);
    if (!sid || !v) return json({ success: false, error: "INVALID_VIEWS" }, 400);
    try { return json({ success: true, data: (await pool.query(`select * from pos.kol_view_record($1,$2,$3,$4,$5,$6)`, [sid, v.views, v.source, v.evidence, v.note, actorOf(o)])).rows[0] }, 201); }
    catch (error) { return fail(error); }
  });

  app.post("/api/admin-manager/kol-rewards/reviews/:id/settle", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const sid = id(c); const v = viewInput((await c.req.json().catch(() => ({}))) as any);
    if (!sid || !v) return json({ success: false, error: "INVALID_VIEWS" }, 400);
    try { return json({ success: true, data: (await pool.query(`select pos.kol_reward_settle($1,$2,$3,$4,$5,$6) as result`, [sid, v.views, v.source, v.evidence, v.note, actorOf(o)])).rows[0].result }); }
    catch (error) { return fail(error); }
  });

  app.post("/api/admin-manager/kol-rewards/reviews/:id/reject", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const sid = id(c); const note = text(((await c.req.json().catch(() => ({}))) as any).note, 500);
    if (!sid || !note) return json({ success: false, error: "NOTE_REQUIRED" }, 400);
    try {
      const r = await pool.query(`select * from pos.kol_review_campaign_proof($1,'rejected',$2,$3)`, [sid, actorOf(o), note]);
      return r.rows[0]?.id ? json({ success: true, data: r.rows[0] }) : json({ success: false, error: "SUBMISSION_NOT_FOUND" }, 404);
    } catch (error) { return fail(error); }
  });

  app.post("/api/admin-manager/kol-rewards/reviews/:id/posted-at", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const sid = id(c); const date = text(((await c.req.json().catch(() => ({}))) as any).date, 10);
    if (!sid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ success: false, error: "INVALID_DATE" }, 400);
    const r = await pool.query(`update pos.kol_content_submissions set published_at = $2::date where id = $1 and video_id is null returning id, posted_at, settle_due_at`, [sid, date]);
    return r.rows[0] ? json({ success: true, data: r.rows[0] }) : json({ success: false, error: "DATE_FROM_VIDEO_ID" }, 409);
  });

  app.post("/api/admin-manager/kol-rewards/campaigns/:id/refund", async (c) => {
    const o = await guard(c); if ("res" in o) return o.res;
    const cid = id(c); if (!cid) return json({ success: false, error: "INVALID_ID" }, 400);
    try { return json({ success: true, data: (await pool.query(`select pos.kol_budget_refund($1,$2) as result`, [cid, actorOf(o)])).rows[0].result }); }
    catch (error) { return fail(error); }
  });
}

/** Portal KOL: penghasilan dan status konten. `context` mengembalikan KOL yang sedang masuk. */
export function registerKolRewardPortalRoutes(app: Hono<any>, context: (c: any) => Promise<any>, pool: Pool) {
  app.get("/api/kol/portal/rewards", async (c) => {
    const current = await context(c);
    if (current.error) return current.error;
    const items = (await reviewRows(pool, "and k.source_id = $1", [current.kol.source_id])).map(({ kolId, kolName, kolUsername, ...rest }: any) => rest);
    const paid = items.filter((i: any) => i.payout).reduce((n: number, i: any) => n + i.payout.amount, 0);
    const running = items.filter((i: any) => !i.payout).reduce((n: number, i: any) => n + (i.estimate ?? 0), 0);
    const maxLeft = (await pool.query(
      `select coalesce(sum(l.reserved_delta), 0)::bigint as held from pos.kol_budget_ledger l
        join pos.kol_campaign_applications ap on ap.id::text = l.ref_id and l.ref_type = 'application' where ap.kol_id = $1`, [current.kol.source_id])).rows[0];
    const wallet = (await pool.query(`select available_balance from pos.customer_wallets where customer_id = $1`, [current.userId])).rows[0];
    return json({ success: true, data: { totalPaid: paid, runningEstimate: running, maxRemaining: Number(maxLeft?.held ?? 0), walletBalance: wallet ? Number(wallet.available_balance) : 0, items } });
  });
}
