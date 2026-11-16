/** Two-way sync between Djiwa Pay and the user's own Google Drive: the finance workbook (Sheets) and the receipt folder (Drive).
 *  Everything here runs in the background worker; the HTTP API only raises flags (`dirty`, `next_*_at`). */
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { accessToken, type Fetch, type GoogleCfg } from "./google.js";
import { SHEET_DELETE_GUARD, hashOf, planSync, rowOf, type Cell, type EntryRow, type Names, type Plan, type SheetRow } from "./sheets/model.js";
import { CATATAN_ROWS, GROW_BY, SHEET, TEMPLATE_VERSION, catatanRows, contentData, createBody, styleRequests, type Static } from "./sheets/template.js";
import type { Q, Tx } from "./sync.js";

const SYNC_EVERY_MS = 2 * 60_000, DRIVE_EVERY_MS = 3 * 60_000, DRIVE_REMOVAL_GUARD = 5;
export type SyncDeps = { db: Tx; cfg: GoogleCfg; f?: Fetch; dir: string; now?: () => Date; newId?: () => string; test?: boolean };

/* ---------------- shared helpers ---------------- */

const DEFAULT_CATS: [string, string, boolean][] = [["makan", "Makan & minum", false], ["transport", "Transportasi", false], ["belanja", "Belanja", false], ["tagihan", "Tagihan & utilitas", false], ["hiburan", "Hiburan", false], ["kesehatan", "Kesehatan", false], ["pendidikan", "Pendidikan", false], ["rumah", "Rumah", false], ["lainnya", "Lainnya", false], ["gaji", "Gaji", true], ["bonus", "Bonus & lainnya", true]];

export async function loadNames(db: Q, userId: string) {
  const cats = new Map<string, { name: string; income: boolean }>(DEFAULT_CATS.map(([id, name, income]) => [id, { name, income }]));
  for (const r of (await db.query("select id,name,income from finance.categories where user_id=$1 order by id", [userId])).rows) cats.set(r.id, { name: r.name, income: Boolean(r.income) });
  const accounts = new Map<string, string>([["tunai", "Tunai"]]);
  for (const r of (await db.query("select id,name from finance.accounts where user_id=$1 order by id", [userId])).rows) accounts.set(r.id, r.name);
  const seen = new Map<string, number>();
  const accName: Record<string, string> = {};
  for (const [id, name] of accounts) { const k = name.trim().toLowerCase(); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); accName[id] = n === 1 ? name : `${name} (${id.slice(0, 6)})`; }
  const catName: Record<string, string> = { transfer: "Transfer" };
  for (const [id, c] of cats) catName[id] = c.name;
  const expense = [...cats].filter(([id, c]) => !c.income && id !== "transfer").map(([, c]) => c.name), income = [...cats].filter(([, c]) => c.income).map(([, c]) => c.name);
  return { names: { catName, accName } as Names, expense, income, accountNames: Object.values(accName) };
}

const loadEntries = async (db: Q, userId: string): Promise<EntryRow[]> =>
  (await db.query("select e.*, exists(select 1 from finance.receipts r where r.user_id=e.user_id and r.id=e.receipt_id and r.confirmed_at is not null) as receipt_locked from finance.entries e where user_id=$1 order by at desc limit 20000", [userId])).rows.map((r) => ({ id: r.id, kind: r.kind, amount: Number(r.amount), categoryId: r.category_id, accountId: r.account_id, toAccountId: r.to_account_id, at: new Date(r.at).toISOString(), note: r.note ?? "", source: r.source, receiptLocked: Boolean(r.receipt_locked) }));

const bump = async (q: Q, userId: string) => { await q.query("insert into finance.profiles(user_id) values($1) on conflict do nothing", [userId]); await q.query("update finance.profiles set version=version+1, updated_at=now() where user_id=$1", [userId]); };
const monthSerial = (y: number, m: number) => Date.UTC(y, m, 1) / 86400000 + 25569;
const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000);

/* ---------------- Sheets ---------------- */

const sheets = (f: Fetch, token: string, path: string, init: RequestInit = {}) => f(`https://sheets.googleapis.com/v4/spreadsheets${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
const drive = (f: Fetch, token: string, path: string, init: RequestInit = {}) => f(`https://www.googleapis.com/drive/v3${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
class GoogleError extends Error { constructor(public status: number, what: string) { super(`${what}_${status}`); } }
const must = async (res: Response, what: string) => { if (!res.ok) throw new GoogleError(res.status, what); return res; };

async function staticData(db: Q, userId: string, n: Awaited<ReturnType<typeof loadNames>>, now: Date): Promise<Static> {
  const w = wib(now), ym = `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, "0")}`;
  const months = Array.from({ length: 24 }, (_, i) => monthSerial(w.getUTCFullYear(), w.getUTCMonth() - 18 + i));
  const [bu, bi, go, de, as] = await Promise.all([
    db.query("select category_id,limit_amount from finance.budgets where user_id=$1 order by category_id", [userId]),
    db.query("select name,amount,day,paid from finance.bills where user_id=$1 order by day,name", [userId]),
    db.query("select name,target,deposits from finance.goals where user_id=$1 order by created_at", [userId]),
    db.query("select person,direction,amount,due,settled,note from finance.debts where user_id=$1 order by created_at", [userId]),
    db.query("select name,kind,value from finance.assets where user_id=$1 order by name", [userId]),
  ]);
  const ASSET: Record<string, string> = { gold: "Emas", fund: "Reksa dana", stock: "Saham", crypto: "Kripto", property: "Properti", vehicle: "Kendaraan", other: "Lainnya" };
  const dueSerial = (s: unknown) => { const t = Date.parse(String(s ?? "")); return Number.isNaN(t) ? String(s ?? "") : Math.floor((t + 7 * 3600_000) / 86400_000) + 25569; };
  return {
    catNames: { expense: n.expense, income: n.income, all: [...n.expense, ...n.income, "Transfer"] }, accountNames: n.accountNames, months, monthNow: monthSerial(w.getUTCFullYear(), w.getUTCMonth()),
    budgets: bu.rows.map((r) => [n.names.catName[r.category_id] ?? r.category_id, Number(r.limit_amount)]),
    bills: bi.rows.map((r) => { const paid = (r.paid as string[]).slice().sort(); return [r.name, Number(r.amount), Number(r.day), paid.includes(ym) ? "Lunas" : "Belum", paid.length ? paid[paid.length - 1] : "-"]; }),
    goals: go.rows.map((r) => { const dep = (r.deposits as { at: string; amount: number }[]) ?? []; const last = dep.map((d) => d.at).sort().pop(); return [r.name, Number(r.target), dep.reduce((s, d) => s + Number(d.amount || 0), 0), last ? new Date(last).toISOString().slice(0, 10) : "-"]; }),
    debts: de.rows.map((r) => [r.person, r.direction === "i_owe" ? "Hutang" : "Piutang", Number(r.amount), r.due ? dueSerial(r.due) : "", r.settled ? "Lunas" : "Belum lunas", r.note ?? ""]),
    assets: as.rows.map((r) => [r.name, ASSET[r.kind] ?? r.kind, Number(r.value)]),
    now: new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(now) + " WIB",
  };
}

const writeValues = async (f: Fetch, token: string, id: string, data: { range: string; values: Cell[][] }[], mode: "RAW" | "USER_ENTERED") => {
  if (!data.length) return;
  for (let i = 0; i < data.length; i += 40) await must(await sheets(f, token, `/${id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: mode, data: data.slice(i, i + 40) }) }), "SHEETS_WRITE");
};

/** Creates the workbook (formatted, with formulas and charts) and fills Catatan from the app. Returns its id and url. */
export async function buildWorkbook(d: SyncDeps, userId: string, token: string) {
  const f = d.f ?? fetch, now = (d.now ?? (() => new Date()))();
  const [n, entries] = [await loadNames(d.db, userId), await loadEntries(d.db, userId)];
  const rows = Math.max(CATATAN_ROWS + 1, entries.length + 1000);
  const made = await must(await sheets(f, token, "", { method: "POST", body: JSON.stringify(createBody("Djiwa Pay · Keuangan", rows)) }), "SHEETS_CREATE");
  const { spreadsheetId: id, spreadsheetUrl: url } = (await made.json()) as { spreadsheetId: string; spreadsheetUrl: string };
  try {
    await must(await sheets(f, token, `/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: styleRequests(rows) }) }), "SHEETS_STYLE");
    await writeValues(f, token, id, contentData(await staticData(d.db, userId, n, now), true), "USER_ENTERED");
    const table: Cell[][] = entries.map((e) => rowOf(e, n.names));
    const chunks: { range: string; values: Cell[][] }[] = [];
    for (let i = 0; i < table.length; i += 1000) chunks.push({ range: `Catatan!A${2 + i}:J${1 + i + Math.min(1000, table.length - i)}`, values: table.slice(i, i + 1000) });
    await writeValues(f, token, id, chunks, "RAW");
  } catch (e) { await drive(f, token, `/files/${id}`, { method: "PATCH", body: JSON.stringify({ trashed: true }) }).catch(() => {}); throw e; }
  await d.db.tx(async (q) => {
    await q.query("delete from finance.sheet_rows where user_id=$1", [userId]);
    if (entries.length) await q.query("insert into finance.sheet_rows(user_id,entry_id,hash) select $1,x.id,x.h from jsonb_to_recordset($2::jsonb) as x(id text,h text)", [userId, JSON.stringify(entries.map((e) => ({ id: e.id, h: hashOf(e) })))]);
  });
  return { id, url, rows, count: entries.length };
}

export type SheetOutcome = { ok: boolean; action: "built" | "synced" | "idle" | "held" | "missing" | "failed"; stats?: Plan["stats"]; error?: string };

export async function syncSheet(d: SyncDeps, userId: string, opts: { force?: boolean } = {}): Promise<SheetOutcome> {
  const f = d.f ?? fetch, now = (d.now ?? (() => new Date()))(), newId = d.newId ?? (() => `sh-${randomBytes(8).toString("hex")}`);
  const ex = (await d.db.query("select * from finance.google_sheet_exports where user_id=$1", [userId])).rows[0];
  if (!ex) return { ok: false, action: "idle", error: "NO_EXPORT" };
  const schedule = (ms: number) => d.db.query("update finance.google_sheet_exports set next_sync_at=now()+($2 * interval '1 millisecond') where user_id=$1", [userId, ms]);
  const fail = async (code: string): Promise<SheetOutcome> => { await d.db.query("update finance.google_sheet_exports set status=case when status='missing' then status else 'failed' end, last_error=$2, next_sync_at=now()+interval '5 minutes' where user_id=$1", [userId, code]); return { ok: false, action: "failed", error: code }; };
  if (ex.status === "missing" && !opts.force) { await schedule(60 * 60_000); return { ok: false, action: "missing" }; }
  const token = await accessToken(d.db, d.cfg, userId, f);
  if (!token) return fail("NOT_CONNECTED");

  let existing = false;   // a 404 only means "the user deleted it" once the workbook is known to exist
  try {
    // 1. A workbook that does not exist yet, or an older design, is (re)built from the app's data.
    if (!ex.spreadsheet_id || ex.template_version < TEMPLATE_VERSION || (opts.force && ex.status === "missing")) {
      const b = await buildWorkbook(d, userId, token);
      await d.db.query("update finance.google_sheet_exports set spreadsheet_id=$2, spreadsheet_url=$3, template_version=$4, grid_rows=$5, status='synced', last_synced_at=now(), last_error=null, hold=null, dirty=false, next_sync_at=now()+interval '2 minutes', sheet_modified=null, last_stats=$6::jsonb where user_id=$1", [userId, b.id, b.url, TEMPLATE_VERSION, b.rows, JSON.stringify({ toSheet: b.count })]);
      const meta0 = await drive(f, token, `/files/${b.id}?fields=modifiedTime`).then((r) => (r.ok ? r.json() : null)) as { modifiedTime?: string } | null;
      if (meta0?.modifiedTime) await d.db.query("update finance.google_sheet_exports set sheet_modified=$2 where user_id=$1", [userId, meta0.modifiedTime]);
      return { ok: true, action: "built" };
    }
    const id = ex.spreadsheet_id as string;
    existing = true;

    // 2. Cheap check first: has anything changed in the file, or in the app, since the last pass?
    const meta = await drive(f, token, `/files/${id}?fields=modifiedTime,trashed`);
    if (meta.status === 404) throw new GoogleError(404, "SHEET");
    const m = (await must(meta, "DRIVE_META").then((r) => r.json())) as { modifiedTime: string; trashed?: boolean };
    if (m.trashed) throw new GoogleError(404, "SHEET");
    if (!ex.dirty && !opts.force && m.modifiedTime === ex.sheet_modified) { await schedule(SYNC_EVERY_MS); return { ok: true, action: "idle" }; }

    // 3. Read the sheet, compare with the app, decide.
    const read = await must(await sheets(f, token, `/${id}/values/${encodeURIComponent("Catatan!A2:J")}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`), "SHEETS_READ");
    const values = ((await read.json()) as { values?: unknown[][] }).values ?? [];
    const rows: SheetRow[] = values.map((cells, i) => ({ row: i + 2, cells }));
    const [n, entries, mapRows] = [await loadNames(d.db, userId), await loadEntries(d.db, userId), (await d.db.query("select entry_id,hash from finance.sheet_rows where user_id=$1", [userId])).rows];
    const mapping = new Map<string, string>(mapRows.map((r) => [r.entry_id as string, r.hash as string]));
    const plan = planSync({ entries, mapping, rows, names: n.names, newId });

    // A sheet that suddenly looks empty or loses many rows is more likely a mistake than an intention: ask first.
    const bulk = plan.toApp.deletes.length > SHEET_DELETE_GUARD || (entries.length >= 8 && plan.toApp.deletes.length > entries.length / 2);
    let hold: string | null = null;
    if (bulk && !ex.confirm_deletes) {
      hold = `Spreadsheet akan menghapus ${plan.toApp.deletes.length} catatan sekaligus. Konfirmasi di aplikasi untuk melanjutkan.`;
      for (const id2 of plan.toApp.deletes) plan.mapping.set(id2, mapping.get(id2) ?? "");
      plan.toApp.deletes = [];
    }

    // 4. Sheet first (rows, statuses, new rows, row deletions), then the database. A failure in between leaves the next pass able to repair it.
    const last = rows.length ? rows[rows.length - 1].row : 1;
    const needed = last + plan.toSheet.appends.length + 1;
    let gridRows = Number(ex.grid_rows);
    if (needed > gridRows) {
      const add = Math.max(GROW_BY, needed - gridRows);
      await must(await sheets(f, token, `/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ appendDimension: { sheetId: SHEET.catatan, dimension: "ROWS", length: add } }, ...catatanRows(gridRows, gridRows + add)] }) }), "SHEETS_GROW");
      gridRows += add;
    }
    const data: { range: string; values: Cell[][] }[] = [];
    for (const r of plan.toSheet.rewrites) data.push({ range: `Catatan!A${r.row}:J${r.row}`, values: [r.values] });
    for (const s of plan.toSheet.statuses) data.push({ range: `Catatan!J${s.row}`, values: [[s.value]] });
    if (plan.toSheet.appends.length) data.push({ range: `Catatan!A${last + 1}:J${last + plan.toSheet.appends.length}`, values: plan.toSheet.appends });
    await writeValues(f, token, id, data, "RAW");
    if (plan.toSheet.deletes.length) {
      const del = [...new Set(plan.toSheet.deletes)].sort((a, b) => b - a).map((row) => ({ deleteDimension: { range: { sheetId: SHEET.catatan, dimension: "ROWS", startIndex: row - 1, endIndex: row } } }));
      await must(await sheets(f, token, `/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: del }) }), "SHEETS_DELETE");
    }
    if (ex.dirty || opts.force) {          // the other sheets and the pick-lists follow the app
      const clears = ["Anggaran!B5:G60", "Tagihan!B5:F60", "Tujuan!B5:G60", "Hutang!B5:G60", "Aset!B5:D60", "Referensi!C2:F41", "Referensi!H2:H25"];
      await must(await sheets(f, token, `/${id}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges: clears }) }), "SHEETS_CLEAR");
      await writeValues(f, token, id, contentData(await staticData(d.db, userId, n, now), false), "USER_ENTERED");
    }

    await d.db.tx(async (q) => {
      const up = plan.toApp.upserts;
      if (up.length) await q.query(`insert into finance.entries(user_id,id,kind,amount,category_id,account_id,to_account_id,at,note,tags,source)
        select $1,x.id,x.kind,x.amount,x.category_id,x.account_id,x.to_account_id,x.at,x.note,'{}',x.source from jsonb_to_recordset($2::jsonb) as x(id text,kind text,amount numeric,category_id text,account_id text,to_account_id text,at timestamptz,note text,source text)
        on conflict(user_id,id) do update set kind=excluded.kind,amount=excluded.amount,category_id=excluded.category_id,account_id=excluded.account_id,to_account_id=excluded.to_account_id,at=excluded.at,note=excluded.note`,
        [userId, JSON.stringify(up.map((e) => ({ id: e.id, kind: e.kind, amount: e.amount, category_id: e.categoryId, account_id: e.accountId, to_account_id: e.toAccountId ?? null, at: e.at, note: e.note, source: e.source })))]);
      if (plan.toApp.deletes.length) await q.query("delete from finance.entries where user_id=$1 and id = any($2::text[])", [userId, plan.toApp.deletes]);
      // accounts a typed row used must exist for the app to show it (they come from Referensi, so they already do)
      await q.query("delete from finance.sheet_rows where user_id=$1", [userId]);
      const map = [...plan.mapping].filter(([, h]) => h).map(([id2, h]) => ({ id: id2, h }));
      if (map.length) await q.query("insert into finance.sheet_rows(user_id,entry_id,hash) select $1,x.id,x.h from jsonb_to_recordset($2::jsonb) as x(id text,h text)", [userId, JSON.stringify(map)]);
      if (up.length || plan.toApp.deletes.length) await bump(q, userId);
    });

    const after = await drive(f, token, `/files/${id}?fields=modifiedTime`).then((r) => (r.ok ? r.json() : null)) as { modifiedTime?: string } | null;
    await d.db.query("update finance.google_sheet_exports set status=$2, last_synced_at=now(), last_error=null, hold=$3, confirm_deletes=false, dirty=false, grid_rows=$4, sheet_modified=$5, last_stats=$6::jsonb, next_sync_at=now()+($7 * interval '1 millisecond') where user_id=$1",
      [userId, hold ? "held" : "synced", hold, gridRows, after?.modifiedTime ?? m.modifiedTime, JSON.stringify(plan.stats), hold ? 60_000 : SYNC_EVERY_MS]);
    return { ok: true, action: hold ? "held" : "synced", stats: plan.stats };
  } catch (e) {
    if (existing && e instanceof GoogleError && e.status === 404) {
      await d.db.query("update finance.google_sheet_exports set status='missing', last_error='Spreadsheet dihapus di Google Drive. Ketuk Ekspor untuk membuat ulang.', next_sync_at=now()+interval '1 hour' where user_id=$1", [userId]);
      return { ok: false, action: "missing", error: "SHEET_MISSING" };
    }
    return fail(e instanceof Error ? e.message.slice(0, 120) : "SYNC_FAILED");
  }
}

/** The app side: flag the workbook as needing a pass. Cheap, safe to call from any request. */
export const markSheetDirty = (db: Q, userId: string) => db.query("update finance.google_sheet_exports set dirty=true, next_sync_at=least(next_sync_at, now()+interval '8 seconds') where user_id=$1", [userId]);
export const requestSheet = (db: Q, userId: string, rebuild = false) => db.query(`insert into finance.google_sheet_exports(user_id,status,dirty,next_sync_at) values($1,'pending',true,now())
  on conflict(user_id) do update set dirty=true, next_sync_at=now(), status=case when $2 and finance.google_sheet_exports.status in ('missing','failed') then 'pending' else finance.google_sheet_exports.status end`, [userId, rebuild]);
export const confirmSheetDeletes = (db: Q, userId: string) => db.query("update finance.google_sheet_exports set confirm_deletes=true, dirty=true, next_sync_at=now() where user_id=$1 and status='held'", [userId]);

/* ---------------- Drive: receipt photos ---------------- */

async function ensureFolder(f: Fetch, token: string, name: string, parent?: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false and appProperties has { key='djiwapay' and value='1' }${parent ? ` and '${parent}' in parents` : ""}`;
  const found = await drive(f, token, `/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
  if (found.ok) { const fid = ((await found.json()) as { files?: { id: string }[] }).files?.[0]?.id; if (fid) return fid; }
  const made = await must(await drive(f, token, "/files?fields=id", { method: "POST", body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", appProperties: { djiwapay: "1" }, ...(parent ? { parents: [parent] } : {}) }) }), "DRIVE_FOLDER");
  return ((await made.json()) as { id: string }).id;
}

const stamp = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const clean = (s: string) => s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
/** The name a receipt photo should carry, from what the app knows: "2026-11-15 Kopi Kenangan.jpg". */
export const receiptName = (date: string, label: string, ext: string) => `${stamp(date)} ${clean(label) || "Struk"}.${ext}`;
export const labelFromName = (name: string) => clean(name.replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/^\d{4}-\d{2}-\d{2}\s+/, ""));

export type DriveOutcome = { ok: boolean; uploaded: number; renamedInDrive: number; renamedInApp: number; removedInDrive: number; trashed: number; held?: string; error?: string };

export async function syncDrive(d: SyncDeps, userId: string): Promise<DriveOutcome> {
  const f = d.f ?? fetch;
  const out: DriveOutcome = { ok: true, uploaded: 0, renamedInDrive: 0, renamedInApp: 0, removedInDrive: 0, trashed: 0 };
  const st = (await d.db.query("select confirm_removals from finance.google_drive_state where user_id=$1", [userId])).rows[0];
  const finish = (error: string | null, hold: string | null) => d.db.query("insert into finance.google_drive_state(user_id,next_check_at,hold,last_checked_at,last_error,confirm_removals) values($1,now()+($2 * interval '1 millisecond'),$3,now(),$4,false) on conflict(user_id) do update set next_check_at=excluded.next_check_at, hold=excluded.hold, last_checked_at=now(), last_error=excluded.last_error, confirm_removals=false", [userId, hold ? 60_000 : DRIVE_EVERY_MS, hold, error]);
  const token = await accessToken(d.db, d.cfg, userId, f);
  if (!token) { await finish("NOT_CONNECTED", null); return { ...out, ok: false, error: "NOT_CONNECTED" }; }
  try {
    const folder = await ensureFolder(f, token, "Struk", await ensureFolder(f, token, "Djiwa Pay"));

    // A. Deleted in the app → trash in Drive (recoverable from Drive's bin for 30 days).
    for (const r of (await d.db.query("select receipt_id,file_id from finance.google_drive_files where user_id=$1 and status='pending_trash'", [userId])).rows) {
      if (r.file_id) { const res = await drive(f, token, `/files/${r.file_id}`, { method: "PATCH", body: JSON.stringify({ trashed: true }) }); if (!res.ok && res.status !== 404) continue; }
      await d.db.query("delete from finance.google_drive_files where user_id=$1 and receipt_id=$2", [userId, r.receipt_id]); out.trashed++;
    }

    // B. New receipt photos → upload.
    const todo = (await d.db.query(`select r.id,r.merchant,r.purchased_at,r.created_at,r.image_path,
        (select e.note from finance.entries e where e.user_id=r.user_id and e.receipt_id=r.id order by e.at limit 1) as note
      from finance.receipts r left join finance.google_drive_files g on g.user_id=r.user_id and g.receipt_id=r.id
      where r.user_id=$1 and r.image_path is not null and (g.receipt_id is null or (g.status in ('failed','pending') and g.attempts<5)) order by r.created_at limit 15`, [userId])).rows;
    for (const r of todo) {
      try {
        const bytes = await readFile(join(d.dir, r.image_path as string));
        const ext = String(r.image_path).split(".").pop() || "jpg", mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        const name = receiptName(r.purchased_at ?? r.created_at, r.note || r.merchant || "", ext);
        const boundary = `b${randomBytes(8).toString("hex")}`;
        const meta = JSON.stringify({ name, parents: [folder], appProperties: { djiwapay: "1", receiptId: r.id } });
        const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
        const res = await must(await f("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` }, body }), "DRIVE_UPLOAD");
        const file = (await res.json()) as { id: string; name?: string };
        await d.db.query("insert into finance.google_drive_files(user_id,receipt_id,file_id,folder_id,status,attempts,name) values($1,$2,$3,$4,'uploaded',1,$5) on conflict(user_id,receipt_id) do update set file_id=excluded.file_id, folder_id=excluded.folder_id, status='uploaded', last_error=null, attempts=finance.google_drive_files.attempts+1, name=excluded.name, updated_at=now()", [userId, r.id, file.id, folder, file.name ?? name]);
        out.uploaded++;
      } catch (e) {
        out.ok = false;
        await d.db.query("insert into finance.google_drive_files(user_id,receipt_id,status,attempts,last_error) values($1,$2,'failed',1,$3) on conflict(user_id,receipt_id) do update set status='failed', attempts=finance.google_drive_files.attempts+1, last_error=excluded.last_error, updated_at=now()", [userId, r.id, (e instanceof Error ? e.message : "error").slice(0, 120)]);
      }
    }

    // C. Reconcile what is already there: names both ways, and files the user removed in Drive.
    const mapped = (await d.db.query(`select g.receipt_id,g.file_id,g.name,r.purchased_at,r.created_at,r.merchant,r.image_path,
        (select e.id from finance.entries e where e.user_id=g.user_id and e.receipt_id=g.receipt_id order by e.at limit 1) as entry_id,
        (select e.note from finance.entries e where e.user_id=g.user_id and e.receipt_id=g.receipt_id order by e.at limit 1) as note
      from finance.google_drive_files g left join finance.receipts r on r.user_id=g.user_id and r.id=g.receipt_id
      where g.user_id=$1 and g.status='uploaded' and g.file_id is not null`, [userId])).rows;
    const alive = new Map<string, string>();
    let pageToken: string | undefined;
    do {
      const q = `appProperties has { key='djiwapay' and value='1' } and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
      const res = await must(await drive(f, token, `/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=200&spaces=drive${pageToken ? `&pageToken=${pageToken}` : ""}`), "DRIVE_LIST");
      const j = (await res.json()) as { files?: { id: string; name: string }[]; nextPageToken?: string };
      for (const x of j.files ?? []) alive.set(x.id, x.name);
      pageToken = j.nextPageToken;
    } while (pageToken);

    const gone: typeof mapped = [];
    for (const r of mapped) {
      if (!alive.has(r.file_id)) {                          // absent from the list is only a suspicion: ask Drive about this very file
        const res = await drive(f, token, `/files/${r.file_id}?fields=trashed`);
        if (res.status === 404 || (res.ok && ((await res.json()) as { trashed?: boolean }).trashed)) gone.push(r);
        continue;
      }
      const driveName = alive.get(r.file_id)!, ext = String(r.image_path ?? driveName).split(".").pop() || "jpg";
      const wanted = receiptName(r.purchased_at ?? r.created_at, r.note || r.merchant || "", ext);
      const appChanged = wanted !== r.name, driveChanged = driveName !== r.name;
      if (appChanged) {                                      // the app wins when both changed
        const res = await drive(f, token, `/files/${r.file_id}`, { method: "PATCH", body: JSON.stringify({ name: wanted }) });
        if (res.ok) { await d.db.query("update finance.google_drive_files set name=$3 where user_id=$1 and receipt_id=$2", [userId, r.receipt_id, wanted]); out.renamedInDrive++; }
      } else if (driveChanged) {                             // renamed in Drive → the label becomes the entry's note
        const label = labelFromName(driveName);
        if (label && r.entry_id) await d.db.tx(async (q) => { await q.query("update finance.entries set note=$3 where user_id=$1 and id=$2", [userId, r.entry_id, label.slice(0, 200)]); await bump(q, userId); });
        await d.db.query("update finance.google_drive_files set name=$3 where user_id=$1 and receipt_id=$2", [userId, r.receipt_id, driveName]); out.renamedInApp++;
      }
    }

    // Files the user deleted in Drive disappear from the app too. A big batch is held for confirmation (a deleted folder is not a decision).
    let hold: string | null = null;
    if (gone.length > DRIVE_REMOVAL_GUARD && !st?.confirm_removals) hold = `${gone.length} foto struk terhapus di Google Drive. Konfirmasi di aplikasi untuk menghapusnya juga di sini.`;
    else for (const r of gone) {
      await d.db.tx(async (q) => {
        await q.query("update finance.entries set receipt_id=null where user_id=$1 and receipt_id=$2", [userId, r.receipt_id]);
        await q.query("delete from finance.receipts where user_id=$1 and id=$2", [userId, r.receipt_id]);
        await q.query("delete from finance.google_drive_files where user_id=$1 and receipt_id=$2", [userId, r.receipt_id]);
        await bump(q, userId);
      });
      if (r.image_path) await unlink(join(d.dir, r.image_path as string)).catch(() => {});
      out.removedInDrive++;
    }
    if (hold) out.held = hold;
    await finish(null, hold);
    return out;
  } catch (e) {
    const code = e instanceof Error ? e.message.slice(0, 120) : "DRIVE_FAILED";
    await finish(code, null);
    return { ...out, ok: false, error: code };
  }
}

export const touchDrive = (db: Q, userId: string) => db.query("insert into finance.google_drive_state(user_id,next_check_at) values($1,now()) on conflict(user_id) do update set next_check_at=now()", [userId]);
export const confirmDriveRemovals = (db: Q, userId: string) => db.query("update finance.google_drive_state set confirm_removals=true, next_check_at=now() where user_id=$1", [userId]);

/* ---------------- scheduler ---------------- */

/** One tick: the few users whose turn has come. Sheets need the Drive scope; so does the receipt folder. */
export async function runGoogleDue(d: SyncDeps, limit = 4) {
  const out: Record<string, unknown> = {};
  const due = async (sql: string) => (await d.db.query(sql, [limit])).rows.map((r) => r.user_id as string);
  const sheetUsers = await due(`select e.user_id from finance.google_sheet_exports e join finance.google_connections c on c.user_id=e.user_id
    where c.refresh_enc is not null and e.status<>'missing' and (e.dirty or e.next_sync_at<=now()) ${d.test ? "" : "and e.user_id not like 'itest-%'"} order by e.next_sync_at limit $1`);
  for (const u of sheetUsers) { try { out[`sheet:${u}`] = await syncSheet(d, u); } catch (e) { console.error("sheet sync", e instanceof Error ? e.message : e); } }
  const driveUsers = await due(`select s.user_id from finance.google_drive_state s join finance.google_connections c on c.user_id=s.user_id
    where c.refresh_enc is not null and s.next_check_at<=now() ${d.test ? "" : "and s.user_id not like 'itest-%'"} order by s.next_check_at limit $1`);
  for (const u of driveUsers) { try { out[`drive:${u}`] = await syncDrive(d, u); } catch (e) { console.error("drive sync", e instanceof Error ? e.message : e); } }
  return out;
}

