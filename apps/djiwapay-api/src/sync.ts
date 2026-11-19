export type Q = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export type Tx = Q & { tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T> };

const str = (v: unknown, max = 200) => String(v ?? "").slice(0, max);
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const iso = (v: unknown) => { const t = Date.parse(String(v)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const arr = (v: unknown, max = 5000): any[] => (Array.isArray(v) ? v.slice(0, max) : []);
const ids = (v: unknown) => arr(v).filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80) as string[];

export type SyncBody = { upserts?: Record<string, unknown>; deletes?: Record<string, unknown>; profile?: { onboarded?: unknown; overrides?: unknown; pockets?: unknown } };

const sanitize = {
  accounts: (a: any) => a && a.id && a.name ? { id: str(a.id, 80), name: str(a.name, 60), type: ["cash", "bank", "ewallet", "card", "other"].includes(a.type) ? a.type : "other", opening: money(a.opening), archived: Boolean(a.archived) } : null,
  categories: (c: any) => c && c.id && c.name ? { id: str(c.id, 80), name: str(c.name, 60), icon: str(c.icon || "tag", 20), tone: str(c.tone || "slate", 20), income: Boolean(c.income), custom: Boolean(c.custom) } : null,
  entries: (e: any) => e && e.id && ["out", "in", "tf"].includes(e.kind) && money(e.amount) > 0 && iso(e.at) ? { id: str(e.id, 80), kind: e.kind, amount: money(e.amount), category_id: str(e.categoryId, 80), account_id: str(e.accountId, 80), to_account_id: e.toAccountId ? str(e.toAccountId, 80) : null, at: iso(e.at), note: str(e.note, 500), tags: arr(e.tags, 20).map((t) => str(t, 30)), source: ["manual", "voice", "pay", "receipt", "email", "sheet"].includes(e.source) ? e.source : "manual", receipt_id: e.receiptId ? str(e.receiptId, 80) : null, inbound_id: e.inboundId ? str(e.inboundId, 80) : null, created_at: iso(e.createdAt) ?? new Date().toISOString() } : null,
  budgets: (b: any) => b && b.categoryId && money(b.limit) > 0 ? { category_id: str(b.categoryId, 80), limit_amount: money(b.limit), rollover: Boolean(b.rollover) } : null,
  goals: (g: any) => g && g.id && g.name ? { id: str(g.id, 80), name: str(g.name, 80), target: money(g.target), deposits: arr(g.deposits, 2000).map((d) => ({ at: iso(d?.at) ?? new Date().toISOString(), amount: money(d?.amount) })), due: /^\d{4}-\d{2}-\d{2}$/.test(String(g.due ?? "")) ? String(g.due) : null, created_at: iso(g.createdAt) ?? new Date().toISOString() } : null,
  bills: (b: any) => b && b.id && b.name && money(b.amount) > 0 && Number(b.day) >= 1 && Number(b.day) <= 31 ? { id: str(b.id, 80), name: str(b.name, 60), amount: money(b.amount), day: Math.round(Number(b.day)), icon: str(b.icon || "receipt", 20), tone: str(b.tone || "amber", 20), paid: arr(b.paid, 120).map((m) => str(m, 7)) } : null,
  assets: (a: any) => a && a.id && a.name && money(a.value) >= 0 ? { id: str(a.id, 80), name: str(a.name, 60), kind: ["gold", "fund", "stock", "crypto", "property", "vehicle", "electronics", "other"].includes(a.kind) ? a.kind : "other", value: money(a.value), sub: a.sub ? str(a.sub, 20) : null, weight: Number(a.weight) > 0 ? Math.round(Number(a.weight) * 1000) / 1000 : null, purity: Number(a.purity) > 0 && Number(a.purity) <= 1 ? Math.round(Number(a.purity) * 10000) / 10000 : null, bought_on: /^\d{4}-\d{2}-\d{2}$/.test(String(a.boughtOn ?? "")) ? String(a.boughtOn) : null, cost: money(a.cost) > 0 ? money(a.cost) : null, shop: a.shop ? str(a.shop, 60) : null, note: a.note ? str(a.note, 300) : null, sticker_id: a.stickerId ? str(a.stickerId, 80) : null, auto: Boolean(a.auto), est: Boolean(a.est), rate: Number.isFinite(Number(a.rate)) && a.rate !== null && a.rate !== "" && Math.abs(Number(a.rate)) <= 100 ? Math.round(Number(a.rate) * 100) / 100 : null } : null,
  debts: (d: any) => d && d.id && d.person ? { id: str(d.id, 80), person: str(d.person, 80), direction: d.direction === "i_owe" ? "i_owe" : "owed_to_me", amount: money(d.amount), note: str(d.note, 300), due: d.due ? str(d.due, 40) : null, settled: Boolean(d.settled), payments: arr(d.payments, 500).map((p) => ({ at: iso(p?.at) ?? new Date().toISOString(), amount: money(p?.amount) })).filter((p) => p.amount > 0), created_at: iso(d.createdAt) ?? new Date().toISOString() } : null,
  loans: (l: any) => l && l.id && l.name && money(l.principal) > 0 && Number(l.months) >= 1 ? {
    id: str(l.id, 80), name: str(l.name, 60), kind: ["kpr", "kendaraan", "multiguna", "lainnya"].includes(l.kind) ? l.kind : "lainnya", lender: str(l.lender, 60), model: ["anuitas", "flat", "syariah"].includes(l.model) ? l.model : "anuitas",
    principal: money(l.principal), months: Math.max(1, Math.min(600, Math.round(Number(l.months)))), start_date: /^\d{4}-\d{2}-\d{2}$/.test(String(l.startDate ?? "")) ? String(l.startDate) : null, due_day: Math.max(1, Math.min(31, Math.round(Number(l.dueDay) || 1))),
    fixed_rate: Math.max(0, Math.min(60, Math.round((Number(l.fixedRate) || 0) * 1000) / 1000)), fixed_months: Math.max(0, Math.min(600, Math.round(Number(l.fixedMonths) || 0))), float_rate: Math.max(0, Math.min(60, Math.round((Number(l.floatRate) || 0) * 1000) / 1000)),
    balance: Math.max(0, money(l.balance)), paid: Math.max(0, Math.min(600, Math.round(Number(l.paid) || 0))), installment: money(l.installment) > 0 ? money(l.installment) : null,
    payments: arr(l.payments, 1200).map((p) => ({ at: iso(p?.at) ?? new Date().toISOString(), amount: money(p?.amount), interest: money(p?.interest), principal: money(p?.principal), ...(p?.extra ? { extra: true } : {}) })).filter((p) => p.amount > 0),
    bill_id: l.billId ? str(l.billId, 80) : null, note: str(l.note, 300), created_at: iso(l.createdAt) ?? new Date().toISOString() } : null,
} as const;

const SQL: Record<keyof typeof sanitize, { cols: string; def: string; key: string; update: string }> = {
  accounts: { cols: "id,name,type,opening,archived", def: "id text,name text,type text,opening numeric,archived boolean", key: "id", update: "name=excluded.name,type=excluded.type,opening=excluded.opening,archived=excluded.archived" },
  categories: { cols: "id,name,icon,tone,income,custom", def: "id text,name text,icon text,tone text,income boolean,custom boolean", key: "id", update: "name=excluded.name,icon=excluded.icon,tone=excluded.tone,income=excluded.income,custom=excluded.custom" },
  entries: { cols: "id,kind,amount,category_id,account_id,to_account_id,at,note,tags,source,receipt_id,inbound_id,created_at", def: "id text,kind text,amount numeric,category_id text,account_id text,to_account_id text,at timestamptz,note text,tags text[],source text,receipt_id text,inbound_id text,created_at timestamptz", key: "id", update: "kind=excluded.kind,amount=excluded.amount,category_id=excluded.category_id,account_id=excluded.account_id,to_account_id=excluded.to_account_id,at=excluded.at,note=excluded.note,tags=excluded.tags,source=excluded.source,receipt_id=excluded.receipt_id,inbound_id=coalesce(excluded.inbound_id,finance.entries.inbound_id)" },
  budgets: { cols: "category_id,limit_amount,rollover", def: "category_id text,limit_amount numeric,rollover boolean", key: "category_id", update: "limit_amount=excluded.limit_amount,rollover=excluded.rollover" },
  goals: { cols: "id,name,target,deposits,due,created_at", def: "id text,name text,target numeric,deposits jsonb,due text,created_at timestamptz", key: "id", update: "name=excluded.name,target=excluded.target,deposits=excluded.deposits,due=excluded.due" },
  bills: { cols: "id,name,amount,day,icon,tone,paid", def: "id text,name text,amount numeric,day smallint,icon text,tone text,paid jsonb", key: "id", update: "name=excluded.name,amount=excluded.amount,day=excluded.day,icon=excluded.icon,tone=excluded.tone,paid=excluded.paid" },
  assets: { cols: "id,name,kind,value,sub,weight,purity,bought_on,cost,shop,note,sticker_id,auto,est,rate", def: "id text,name text,kind text,value numeric,sub text,weight numeric,purity numeric,bought_on text,cost numeric,shop text,note text,sticker_id text,auto boolean,est boolean,rate numeric", key: "id", update: "name=excluded.name,kind=excluded.kind,value=excluded.value,sub=excluded.sub,weight=excluded.weight,purity=excluded.purity,bought_on=excluded.bought_on,cost=excluded.cost,shop=excluded.shop,note=excluded.note,sticker_id=excluded.sticker_id,auto=excluded.auto,est=excluded.est,rate=excluded.rate" },
  debts: { cols: "id,person,direction,amount,note,due,settled,payments,created_at", def: "id text,person text,direction text,amount numeric,note text,due text,settled boolean,payments jsonb,created_at timestamptz", key: "id", update: "person=excluded.person,direction=excluded.direction,amount=excluded.amount,note=excluded.note,due=excluded.due,settled=excluded.settled,payments=excluded.payments" },
  loans: { cols: "id,name,kind,lender,model,principal,months,start_date,due_day,fixed_rate,fixed_months,float_rate,balance,paid,installment,payments,bill_id,note,created_at", def: "id text,name text,kind text,lender text,model text,principal numeric,months integer,start_date text,due_day smallint,fixed_rate numeric,fixed_months integer,float_rate numeric,balance numeric,paid integer,installment numeric,payments jsonb,bill_id text,note text,created_at timestamptz", key: "id", update: "name=excluded.name,kind=excluded.kind,lender=excluded.lender,model=excluded.model,principal=excluded.principal,months=excluded.months,start_date=excluded.start_date,due_day=excluded.due_day,fixed_rate=excluded.fixed_rate,fixed_months=excluded.fixed_months,float_rate=excluded.float_rate,balance=excluded.balance,paid=excluded.paid,installment=excluded.installment,payments=excluded.payments,bill_id=excluded.bill_id,note=excluded.note" },
};
const TABLES = Object.keys(SQL) as (keyof typeof SQL)[];

/** Applies one client diff atomically and returns the new profile version. */
export async function applySync(db: Tx, userId: string, body: SyncBody): Promise<{ version: number }> {
  return db.tx(async (q) => {
    await q.query("insert into finance.profiles(user_id) values($1) on conflict do nothing", [userId]);
    for (const t of TABLES) {
      const s = SQL[t];
      const rows = arr(body.upserts?.[t]).map(sanitize[t] as (x: any) => any).filter(Boolean);
      if (t === "entries" && rows.some((r: any) => r.receipt_id)) {
        // Itemized receipts are confirmed only through the receipt endpoint; an old cached client must not
        // create a second (or unreviewed) expense for a receipt via the generic diff.
        const blocked = await q.query("select 1 from jsonb_to_recordset($2::jsonb) as x(id text,receipt_id text) where coalesce(x.receipt_id,'')<>'' and exists(select 1 from finance.receipts r where r.user_id=$1 and r.id=x.receipt_id) and not exists(select 1 from finance.entries e where e.user_id=$1 and e.id=x.id) limit 1", [userId, JSON.stringify(rows)]);
        if (blocked.rows.length) throw new Error("RECEIPT_CONFIRMATION_REQUIRED");
      }
      if (rows.length) await q.query(`insert into finance.${t}(user_id,${s.cols}) select $1,${s.cols} from jsonb_to_recordset($2::jsonb) as x(${s.def}) on conflict(user_id,${s.key}) do update set ${s.update}${t === "entries" ? " where not exists(select 1 from finance.receipts r where r.user_id=finance.entries.user_id and r.id=finance.entries.receipt_id and r.confirmed_at is not null)" : ""}`, [userId, JSON.stringify(rows)]);
      const del = ids(body.deletes?.[t]);
      if (del.length) await q.query(`delete from finance.${t} where user_id=$1 and ${s.key} = any($2::text[])`, [userId, del]);
    }
    const p = body.profile ?? {};
    const overrides = p.overrides && typeof p.overrides === "object" && !Array.isArray(p.overrides) ? JSON.stringify(p.overrides).slice(0, 200_000) : null;
    const pockets = Array.isArray(p.pockets) ? JSON.stringify(p.pockets.slice(0, 12).map((x: any) => ({ id: str(x?.id, 40), name: str(x?.name, 40), percent: Math.max(0, Math.min(100, money(x?.percent))), categoryIds: arr(x?.categoryIds, 20).map((c) => str(c, 40)), tone: str(x?.tone || "slate", 20), icon: str(x?.icon || "tag", 20) }))) : null;
    const r = await q.query("update finance.profiles set version=version+1, updated_at=now(), onboarded=coalesce($2,onboarded), overrides=coalesce($3::jsonb,overrides), pockets=coalesce($4::jsonb,pockets) where user_id=$1 returning version", [userId, typeof p.onboarded === "boolean" ? p.onboarded : null, overrides, pockets]);
    await q.query("update finance.google_sheet_exports set dirty=true, next_sync_at=least(next_sync_at, now()+interval '8 seconds') where user_id=$1", [userId]);
    return { version: Number(r.rows[0].version) };
  });
}

const n = (v: unknown) => Number(v);
export async function loadState(db: Q, userId: string) {
  const [pr, ac, ca, en, bu, go, de, re, bi, as, ln] = await Promise.all([
    db.query("select version,onboarded,overrides,pockets from finance.profiles where user_id=$1", [userId]),
    db.query("select id,name,type,opening,archived from finance.accounts where user_id=$1 order by id", [userId]),
    db.query("select id,name,icon,tone,income,custom from finance.categories where user_id=$1 order by id", [userId]),
    db.query("select id,kind,amount,category_id,account_id,to_account_id,at,note,tags,source,receipt_id,inbound_id,created_at from finance.entries where user_id=$1 order by at desc", [userId]),
    db.query("select category_id,limit_amount,rollover from finance.budgets where user_id=$1", [userId]),
    db.query("select id,name,target,deposits,due,created_at from finance.goals where user_id=$1 order by created_at", [userId]),
    db.query("select id,person,direction,amount,note,due,settled,payments,created_at from finance.debts where user_id=$1 order by created_at", [userId]),
    db.query("select id,merchant,purchased_at,total,confidence,items,status from finance.receipts where user_id=$1 order by created_at desc limit 500", [userId]),
    db.query("select id,name,amount,day,icon,tone,paid from finance.bills where user_id=$1 order by day,id", [userId]),
    db.query("select id,name,kind,value,sub,weight,purity,bought_on,cost,shop,note,sticker_id,auto,est,rate from finance.assets where user_id=$1 order by id", [userId]),
    db.query("select id,name,kind,lender,model,principal,months,start_date,due_day,fixed_rate,fixed_months,float_rate,balance,paid,installment,payments,bill_id,note,created_at from finance.loans where user_id=$1 order by created_at,id", [userId]),
  ]);
  const p = pr.rows[0];
  return {
    exists: Boolean(p), version: p ? n(p.version) : 0,
    state: {
      v: 1 as const, onboarded: Boolean(p?.onboarded), overrides: p?.overrides ?? {}, pockets: p?.pockets ?? [],
      bills: bi.rows.map((r) => ({ id: r.id, name: r.name, amount: n(r.amount), day: Number(r.day), icon: r.icon, tone: r.tone, paid: r.paid })),
      assets: as.rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, value: n(r.value), ...(r.sub ? { sub: r.sub } : {}), ...(r.weight !== null ? { weight: n(r.weight) } : {}), ...(r.purity !== null ? { purity: n(r.purity) } : {}), ...(r.bought_on ? { boughtOn: r.bought_on } : {}), ...(r.cost !== null ? { cost: n(r.cost) } : {}), ...(r.shop ? { shop: r.shop } : {}), ...(r.note ? { note: r.note } : {}), ...(r.sticker_id ? { stickerId: r.sticker_id } : {}), ...(r.auto ? { auto: true } : {}), ...(r.est ? { est: true } : {}), ...(r.rate !== null && r.rate !== undefined ? { rate: n(r.rate) } : {}) })),
      loans: ln.rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, lender: r.lender, model: r.model, principal: n(r.principal), months: Number(r.months), ...(r.start_date ? { startDate: r.start_date } : {}), dueDay: Number(r.due_day), fixedRate: n(r.fixed_rate), fixedMonths: Number(r.fixed_months), floatRate: n(r.float_rate), balance: n(r.balance), paid: Number(r.paid), installment: r.installment === null ? null : n(r.installment), payments: Array.isArray(r.payments) ? r.payments : [], ...(r.bill_id ? { billId: r.bill_id } : {}), note: r.note, createdAt: new Date(r.created_at).toISOString() })),
      accounts: ac.rows.map((r) => ({ id: r.id, name: r.name, type: r.type, opening: n(r.opening), ...(r.archived ? { archived: true } : {}) })),
      categories: ca.rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon, tone: r.tone, income: r.income, ...(r.custom ? { custom: true } : {}) })),
      entries: en.rows.map((r) => ({ id: r.id, kind: r.kind, amount: n(r.amount), categoryId: r.category_id, accountId: r.account_id, ...(r.to_account_id ? { toAccountId: r.to_account_id } : {}), at: new Date(r.at).toISOString(), note: r.note, tags: r.tags, source: r.source, ...(r.receipt_id ? { receiptId: r.receipt_id } : {}), ...(r.inbound_id ? { inboundId: r.inbound_id } : {}), createdAt: new Date(r.created_at).toISOString() })),
      budgets: bu.rows.map((r) => ({ categoryId: r.category_id, limit: n(r.limit_amount), rollover: r.rollover })),
      goals: go.rows.map((r) => ({ id: r.id, name: r.name, target: n(r.target), deposits: r.deposits, ...(r.due ? { due: r.due } : {}), createdAt: new Date(r.created_at).toISOString() })),
      debts: de.rows.map((r) => ({ id: r.id, person: r.person, direction: r.direction, amount: n(r.amount), note: r.note, ...(r.due ? { due: r.due } : {}), settled: r.settled, payments: Array.isArray(r.payments) ? r.payments : [], createdAt: new Date(r.created_at).toISOString() })),
    },
    receipts: re.rows.map((r) => ({ id: r.id, merchant: r.merchant, purchasedAt: r.purchased_at ? new Date(r.purchased_at).toISOString() : null, total: n(r.total), confidence: r.confidence, items: r.items, status: r.status })),
  };
}
