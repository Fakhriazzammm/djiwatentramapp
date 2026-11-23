/** Import of old Gmail mail. The scan walks back through the mailbox in time windows, stages what it can read, and waits for the user to
 *  look at a preview. Only the commit turns staged mail into entries, and a whole import can be undone. */
import { accessToken, googleReason, type Fetch, type GoogleCfg } from "./google.js";
import { RULES_VERSION } from "./mail/extract.js";
import { ISSUERS } from "./mail/issuers.js";
import { senderQuery } from "./gmail.js";
import { processForUser, type PipelineDeps, type RawMail } from "./mail/pipeline.js";
import type { MailCtx } from "./mail/smtp.js";
import type { Q, Tx } from "./sync.js";

// Only a preview produced by the current rules can enter a bulk commit.
const CURRENT_SURE = `coalesce((parsed->>'sure')::boolean,false) and coalesce(parsed->>'rulesVersion','0')='${RULES_VERSION}'`;
const DAY = 86400_000, EVERYTHING_SINCE = Date.UTC(2010, 0, 1);
const TICK_BUDGET_MS = 8000, PAGE = 50, TRANSFER_MS = 15 * 60_000;
export type ImportDeps = { db: Tx; cfg: GoogleCfg; pipeline: PipelineDeps; toMail: (raw: Buffer, ctx: MailCtx) => Promise<RawMail>; f?: Fetch; now?: () => Date; budgetMs?: number; test?: boolean };

export type ImportOpts = { /** Start where the last finished import stopped, so only new old-mail is read. */ sinceLast?: boolean; /** Only these banks, e-wallets and billers (issuer ids). */ issuers?: string[] };
export async function createImport(db: Tx, userId: string, days: number, now = new Date(), opts: ImportOpts = {}) {
  const period = [0, 30, 90, 180, 365].includes(days) ? days : 90;
  const only = (opts.issuers ?? []).filter((i) => ISSUERS.some((x) => x.id === i)).slice(0, 20);
  return db.tx(async (q) => {
    await dropImports(q, userId, "scanning");
    const last = opts.sinceLast ? (await q.query("select until from finance.gmail_import where user_id=$1 and status='done' order by created_at desc limit 1", [userId])).rows[0]?.until : null;
    const since = last ? new Date(new Date(last).getTime() - DAY) : period ? new Date(now.getTime() - period * DAY) : new Date(EVERYTHING_SINCE);   // a day of overlap: a mail seen twice is recorded once
    const r = await q.query("insert into finance.gmail_import(user_id,status,period_days,since,until,window_end,issuers,mode) values($1,'scanning',$2,$3,$4,$4,$5,$6) returning id", [userId, last ? 0 : period, since.toISOString(), now.toISOString(), only.length ? only : null, last ? "since-last" : "period"]);
    return r.rows[0].id as string;
  });
}
/** Throws away an unfinished import (scan or preview) and everything staged for it. */
async function dropImports(q: Q, userId: string, ...statuses: string[]) {
  const old = (await q.query("select id from finance.gmail_import where user_id=$1 and status = any($2::text[])", [userId, statuses])).rows.map((r) => r.id as string);
  for (const id of old) {
    await q.query("delete from finance.inbound_messages where user_id=$1 and import_id=$2 and status in ('staged','ignored')", [userId, id]);
    await q.query("delete from finance.gmail_import_seen where import_id=$1", [id]);
    await q.query("update finance.gmail_import set status='cancelled', finished_at=now() where id=$1", [id]);
  }
}
export const cancelImport = (db: Tx, userId: string) => db.tx((q) => dropImports(q, userId, "scanning", "ready"));

/* ---------------- scanning ---------------- */

const windowSize = (end: number, until: number) => (until - end > 365 * DAY ? 90 : 30) * DAY;

async function gmail(f: Fetch, token: string, path: string) {
  return f(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${token}` } });
}

/** One time-boxed step of a scan. Returns when the budget is used or the import has moved on. */
export async function scanStep(d: ImportDeps, imp: Record<string, any>): Promise<void> {
  const f = d.f ?? fetch, userId = imp.user_id as string, started = Date.now();
  const fail = (error: string, backoffMs = 120_000) => d.db.query("update finance.gmail_import set error=$2, next_at=now()+($3 * interval '1 millisecond') where id=$1", [imp.id, error, backoffMs]);
  const token = await accessToken(d.db, d.cfg, userId, f);
  if (!token) { await d.db.query("update finance.gmail_import set status='failed', error='NOT_CONNECTED', finished_at=now() where id=$1", [imp.id]); return; }
  const conn = (await d.db.query("select email,granted_scopes from finance.google_connections where user_id=$1", [userId])).rows[0];
  if (!conn || !(conn.granted_scopes as string[]).includes("https://www.googleapis.com/auth/gmail.readonly")) { await d.db.query("update finance.gmail_import set status='failed', error='SCOPE_MISSING', finished_at=now() where id=$1", [imp.id]); return; }
  const trusted = Number((await d.db.query("select trusted_count from finance.inbound_sources where user_id=$1", [userId])).rows[0]?.trusted_count ?? 0);
  const since = new Date(imp.since).getTime(), until = new Date(imp.until).getTime();
  let end = new Date(imp.window_end).getTime(), pageToken: string | null = imp.page_token ?? null;

  const budget = d.budgetMs ?? TICK_BUDGET_MS;
  while (Date.now() - started < budget) {
    if (end <= since) { await d.db.query("update finance.gmail_import set status='ready', window_end=$2, page_token=null, error=null, finished_at=now() where id=$1", [imp.id, new Date(since).toISOString()]); return; }
    const start = Math.max(since, end - windowSize(end, until));
    const from = (imp.issuers as string[] | null)?.length ? `from:(${ISSUERS.filter((i) => (imp.issuers as string[]).includes(i.id)).flatMap((i) => i.domains).join(" OR ")})` : senderQuery();
    const q = `${from} after:${Math.floor(start / 1000)} before:${Math.floor(end / 1000)}`;
    const res = await gmail(f, token, `messages?${new URLSearchParams({ q, maxResults: String(PAGE), ...(pageToken ? { pageToken } : {}) })}`);
    if (res.status === 429 || res.status === 403) { await fail(`GMAIL_${res.status}:${await googleReason(res)}`, res.status === 403 ? 300_000 : 120_000); return; }
    if (res.status === 401) { await fail("NOT_CONNECTED"); return; }
    if (!res.ok) { await fail(`GMAIL_${res.status}`, 60_000); return; }
    const page = (await res.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    let scanned = 0, staged = 0;
    const ids = (page.messages ?? []).map((m) => m.id);
    const handled = new Set<string>(ids.length ? (await d.db.query("select gmail_id from finance.gmail_import_seen where import_id=$1 and gmail_id = any($2::text[])", [imp.id, ids])).rows.map((r) => r.gmail_id as string) : []);
    const todo = ids.filter((id) => !handled.has(id));
    for (const id of todo) {
      const raw = await gmail(f, token, `messages/${encodeURIComponent(id)}?format=raw`);
      if (raw.status === 429) { await fail("GMAIL_429"); return; }
      if (raw.ok) {
        const { raw: b64 } = (await raw.json()) as { raw?: string };
        if (b64) {
          try {
            const mail = await d.toMail(Buffer.from(b64, "base64url"), { ip: "", helo: "", sender: "", host: "gmail", recipients: [String(conn.email ?? "")], trustGoogleVerdict: true });
            const out = await processForUser(d.pipeline, userId, trusted, mail, { stage: { importId: imp.id } });
            if (out.status === "staged") staged++;
          } catch { /* one unreadable message must not stop the scan */ }
        }
      }
      await d.db.query("insert into finance.gmail_import_seen(import_id,gmail_id) values($1,$2) on conflict do nothing", [imp.id, id]); scanned++;
      if (Date.now() - started > budget) break;
    }
    const mid = todo.length > scanned && Date.now() - started > budget;    // out of time inside this page: resume it next tick
    if (!mid) { pageToken = page.nextPageToken ?? null; if (!pageToken) end = start; }   // the window only advances once its last page is fully handled
    await d.db.query("update finance.gmail_import set scanned=scanned+$2, staged=staged+$3, window_end=$4, page_token=$5, error=null where id=$1", [imp.id, scanned, staged, new Date(end).toISOString(), pageToken]);
    if (mid) return;
  }
}

/** One scheduler tick for imports. */
export async function runImports(d: ImportDeps) {
  // The production worker must never pick up the integration tests' users (they share the database): only a test run opts in.
  const due = (await d.db.query(`select * from finance.gmail_import where status='scanning' and next_at <= now() ${d.test ? "" : "and user_id not like 'itest-%'"} order by created_at limit 2`)).rows;
  for (const imp of due) { try { await scanStep(d, imp); } catch (e) { console.error("import scan", e instanceof Error ? e.message : e); await d.db.query("update finance.gmail_import set error=$2, next_at=now()+interval '2 minutes' where id=$1", [imp.id, "SCAN_ERROR"]); } }
  return due.length;
}

/* ---------------- state and preview ---------------- */

export async function importState(db: Q, userId: string) {
  const imp = (await db.query("select * from finance.gmail_import where user_id=$1 and status<>'cancelled' order by created_at desc limit 1", [userId])).rows[0];
  if (!imp) return null;
  const span = new Date(imp.until).getTime() - new Date(imp.since).getTime();
  const progress = imp.status === "scanning" ? Math.min(0.99, Math.max(0, (new Date(imp.until).getTime() - new Date(imp.window_end).getTime()) / (span || 1))) : 1;
  const out: Record<string, unknown> = { id: imp.id, status: imp.status, periodDays: imp.period_days, scanned: imp.scanned, staged: imp.staged, progress, error: imp.error ?? null, committed: imp.committed, movedToReview: imp.moved_to_review, scanningTo: imp.window_end ? new Date(imp.window_end).toISOString() : null, since: imp.since ? new Date(imp.since).toISOString() : null , issuers: imp.issuers ?? [], mode: imp.mode ?? "period", until: imp.until };
  const lastDone = (await db.query("select until, finished_at from finance.gmail_import where user_id=$1 and status='done' order by created_at desc limit 1", [userId])).rows[0];
  out.lastSyncedAt = lastDone ? new Date(lastDone.until).toISOString() : null;
  if (imp.status === "done") {
    // What became of the mail that went to the queue: it is judged now, not frozen at the moment of the import.
    const [live, unc] = await Promise.all([
      db.query("select status, count(*)::int n from finance.inbound_messages where user_id=$1 and import_id=$2 group by 1", [userId, imp.id]),
      db.query("select count(*)::int n from finance.entries where user_id=$1 and category_id='lainnya' and kind<>'tf' and inbound_id in (select id::text from finance.inbound_messages where import_id=$2 and status='approved')", [userId, imp.id]),
    ]);
    const by = Object.fromEntries(live.rows.map((r) => [r.status as string, Number(r.n)]));
    out.live = { pending: (by.review ?? 0) + (by.failed ?? 0), approved: by.approved ?? 0, rejected: by.rejected ?? 0, uncategorized: Number(unc.rows[0]?.n ?? 0) };
  }
  if (imp.status === "ready" || imp.status === "scanning") {
    const [tot, months, cats, chk] = await Promise.all([
      db.query(`select count(*)::int n, coalesce(sum(case when parsed->>'kind'='in' then (parsed->>'amount')::numeric end),0) inc, coalesce(sum(case when parsed->>'kind'='out' then (parsed->>'amount')::numeric end),0) outc
        from finance.inbound_messages where user_id=$1 and import_id=$2 and status='staged' and (${CURRENT_SURE})`, [userId, imp.id]),
      db.query(`select to_char((parsed->>'at')::timestamptz at time zone 'Asia/Jakarta','YYYY-MM') m, count(*)::int n, coalesce(sum(case when parsed->>'kind'='in' then (parsed->>'amount')::numeric end),0) inc, coalesce(sum(case when parsed->>'kind'='out' then (parsed->>'amount')::numeric end),0) outc
        from finance.inbound_messages where user_id=$1 and import_id=$2 and status='staged' and (${CURRENT_SURE}) group by 1 order by 1 desc`, [userId, imp.id]),
      db.query(`select parsed->>'categoryId' c, count(*)::int n, sum((parsed->>'amount')::numeric) total from finance.inbound_messages
        where user_id=$1 and import_id=$2 and status='staged' and (${CURRENT_SURE}) and parsed->>'kind'='out' group by 1 order by total desc limit 6`, [userId, imp.id]),
      db.query(`select coalesce(parsed->>'why','lainnya') why, count(*)::int n from finance.inbound_messages where user_id=$1 and import_id=$2 and status='staged' and not (${CURRENT_SURE}) group by 1 order by n desc`, [userId, imp.id]),
    ]);
    out.preview = {
      sure: { count: tot.rows[0].n, income: Number(tot.rows[0].inc), expense: Number(tot.rows[0].outc) },
      check: { count: chk.rows.reduce((s, r) => s + Number(r.n), 0), reasons: chk.rows.map((r) => ({ why: r.why as string, count: Number(r.n) })) },
      months: months.rows.map((r) => ({ month: r.m as string, count: r.n as number, income: Number(r.inc), expense: Number(r.outc) })),
      categories: cats.rows.map((r) => ({ categoryId: r.c as string, count: r.n as number, total: Number(r.total) })),
    };
  }
  return out;
}

export async function importCheckItems(db: Q, userId: string, importId: string) {
  const r = await db.query(`select id,channel,parsed,confidence from finance.inbound_messages where user_id=$1 and import_id=$2 and status='staged' and not (${CURRENT_SURE}) order by (parsed->>'at')::timestamptz desc limit 40`, [userId, importId]);
  return r.rows.map((m) => ({ id: m.id as string, channel: m.channel as string, confidence: Number(m.confidence), parsed: m.parsed as Record<string, any> }));
}

/* ---------------- commit and undo ---------------- */

const bump = async (q: Q, userId: string) => {
  await q.query("insert into finance.profiles(user_id) values($1) on conflict do nothing", [userId]);
  await q.query("update finance.profiles set version=version+1, updated_at=now() where user_id=$1", [userId]);
  await q.query("update finance.google_sheet_exports set dirty=true, next_sync_at=least(next_sync_at, now()+interval '8 seconds') where user_id=$1", [userId]);
};

/** Turns the preview's "sure" group into entries, pairs moves between the user's own accounts, and hands the rest to the review queue. */
type Categorize = NonNullable<PipelineDeps["categorize"]>;
export async function commitImport(db: Tx, userId: string, importId: string, opts: { categorize?: Categorize } = {}) {
  const done = await commitTx(db, userId, importId);
  if (done && opts.categorize) void fillCategories(db, userId, importId, opts.categorize).catch((e) => console.error("import categories", e instanceof Error ? e.message : e));
  return done;
}

/** Entries the import recorded without a known category get one: the person's own rules first, then the model, in small batches; unsure ones stay for "Rapikan". */
export async function fillCategories(db: Tx, userId: string, importId: string, categorize: Categorize, limit = 300) {
  const rows = (await db.query(`select id, note, amount, kind from finance.entries where user_id=$1 and category_id='lainnya' and kind in ('in','out') and inbound_id in (select id::text from finance.inbound_messages where import_id=$2 and status='approved') order by at desc limit $3`, [userId, importId, limit])).rows;
  let changed = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const part = rows.slice(i, i + 20), picks = await categorize(userId, part.map((r) => ({ key: r.id as string, text: String(r.note ?? ""), amount: Number(r.amount), kind: r.kind as "in" | "out" })));
    for (const r of part) {
      const p = picks.get(r.id as string); if (!p || !p.categoryId || p.categoryId === "lainnya") continue;
      await db.query("update finance.entries set category_id=$3, tags = case when $4 then array_append(tags,'kategori-ai') else tags end where user_id=$1 and id=$2 and category_id='lainnya'", [userId, r.id, p.categoryId, p.source === "ai"]); changed++;
    }
  }
  if (changed) await bump(db, userId);
  return changed;
}

async function commitTx(db: Tx, userId: string, importId: string) {
  return db.tx(async (q) => {
    const imp = (await q.query("select status from finance.gmail_import where id=$1 and user_id=$2 for update", [importId, userId])).rows[0];
    if (!imp || imp.status !== "ready") return null;
    // Deployment can change the parser while an import is scanning. Never trust the old
    // "sure" label: retain the extracted values for explicit review, without recording them.
    await q.query(`update finance.inbound_messages set parsed=jsonb_set(parsed,'{sure}','false'::jsonb)
      || jsonb_build_object('flags',coalesce(parsed->'flags','[]'::jsonb) || '["old-rules"]'::jsonb), reason='check'
      where user_id=$1 and import_id=$2 and status='staged'
      and coalesce(parsed->>'rulesVersion','0')<>$3`, [userId, importId, String(RULES_VERSION)]);
    await q.query(`insert into finance.accounts(user_id,id,name,type,opening)
      select distinct on (parsed->>'accountId') user_id, parsed->>'accountId', parsed->>'accountName', coalesce(parsed->>'accountType','other'), 0 from finance.inbound_messages
      where user_id=$1 and import_id=$2 and status='staged' and parsed->>'accountId' is not null on conflict do nothing`, [userId, importId]);
    await q.query(`insert into finance.entries(user_id,id,kind,amount,category_id,account_id,at,note,tags,source,inbound_id)
      select user_id, 'em-'||id::text, parsed->>'kind', (parsed->>'amount')::numeric, parsed->>'categoryId', parsed->>'accountId', (parsed->>'at')::timestamptz,
             left(coalesce(nullif(parsed->>'merchant',''), nullif(parsed->>'subject',''), ''), 200), '{}', 'email', id::text
      from finance.inbound_messages where user_id=$1 and import_id=$2 and status='staged' and (parsed->>'sure')::boolean on conflict do nothing`, [userId, importId]);
    await q.query("update finance.inbound_messages set status='approved', reason='imported', entry_id='em-'||id::text where user_id=$1 and import_id=$2 and status='staged' and (parsed->>'sure')::boolean", [userId, importId]);
    // A move between two of the user's own accounts arrives as two mails: keep one transfer.
    const rows = (await q.query("select id,kind,amount,account_id,at from finance.entries e where user_id=$1 and kind in ('in','out') and inbound_id in (select id::text from finance.inbound_messages where import_id=$2 and status='approved') order by at", [userId, importId])).rows;
    const used = new Set<string>(); let transfers = 0;
    for (const o of rows.filter((r) => r.kind === "out")) {
      if (used.has(o.id)) continue;
      const i = rows.find((r) => r.kind === "in" && !used.has(r.id) && Number(r.amount) === Number(o.amount) && r.account_id !== o.account_id && Math.abs(new Date(r.at).getTime() - new Date(o.at).getTime()) <= TRANSFER_MS);
      if (!i) continue;
      used.add(o.id); used.add(i.id); transfers++;
      await q.query("update finance.entries set kind='tf', to_account_id=$3, category_id='transfer', note='Transfer antar akun' where user_id=$1 and id=$2", [userId, o.id, i.account_id]);
      await q.query("delete from finance.entries where user_id=$1 and id=$2", [userId, i.id]);
      await q.query("update finance.inbound_messages set entry_id=$2, reason='imported-transfer' where user_id=$1 and entry_id=$3", [userId, o.id, i.id]);
    }
    const committed = Number((await q.query("select count(*)::int n from finance.inbound_messages where user_id=$1 and import_id=$2 and status='approved'", [userId, importId])).rows[0].n) - transfers;
    const moved = await q.query("update finance.inbound_messages set status='review', reason='import-check', parsed=parsed - 'sample' where user_id=$1 and import_id=$2 and status='staged' returning id", [userId, importId]);
    await q.query("delete from finance.inbound_messages where user_id=$1 and import_id=$2 and status='ignored'", [userId, importId]);
    await q.query("delete from finance.gmail_import_seen where import_id=$1", [importId]);
    await q.query("update finance.gmail_import set status='done', committed=$2, moved_to_review=$3, finished_at=now() where id=$1", [importId, committed, moved.rows.length]);
    await bump(q, userId);
    return { committed, movedToReview: moved.rows.length, transfers };
  });
}

/** Removes everything a finished import created. Edits made afterwards go with it. */
export async function undoImport(db: Tx, userId: string, importId: string) {
  return db.tx(async (q) => {
    const imp = (await q.query("select status from finance.gmail_import where id=$1 and user_id=$2 for update", [importId, userId])).rows[0];
    if (!imp || imp.status !== "done") return null;
    const del = await q.query("delete from finance.entries where user_id=$1 and (inbound_id in (select id::text from finance.inbound_messages where import_id=$2) or id in (select entry_id from finance.inbound_messages where import_id=$2 and entry_id is not null)) returning id", [userId, importId]);
    await q.query("update finance.inbound_messages set status='rejected', reason='import-undone', entry_id=null where user_id=$1 and import_id=$2 and status in ('approved','review')", [userId, importId]);
    await q.query("update finance.gmail_import set status='undone', finished_at=now() where id=$1", [importId]);
    await bump(q, userId);
    return { removed: del.rows.length };
  });
}
