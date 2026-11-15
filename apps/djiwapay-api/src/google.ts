/** One Google connection per Djiwa Pay user, shared by Calendar, Drive and Sheets.
 *  Tokens are AES-256-GCM encrypted in Postgres; the browser only ever gets the account e-mail and which features are on. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Q } from "./sync.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const SCOPES = {
  email: "https://www.googleapis.com/auth/userinfo.email",
  calendar: "https://www.googleapis.com/auth/calendar.events",
  /** Only files this app creates (Sheets created through the Sheets API are covered too). Non-sensitive. */
  drive: "https://www.googleapis.com/auth/drive.file",
} as const;
export type Feature = "calendar" | "drive";
export const FEATURES: Feature[] = ["calendar", "drive"];

export type GoogleCfg = { clientId: string; clientSecret: string; redirectUri: string; key: Buffer };
export type Fetch = typeof fetch;

/** null when the deployment has no Google credentials yet; the UI then shows the feature as "coming soon". */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleCfg | null {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_TOKEN_KEY: k } = env;
  if (!clientId || !clientSecret || !k) return null;
  const key = Buffer.from(k, "base64");
  if (key.length !== 32) return null;
  return { clientId, clientSecret, key, redirectUri: env.GOOGLE_REDIRECT_URI || "https://djiwapay.web.id/api/finance/google/callback" };
}

export const encrypt = (key: Buffer, value: string) => {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
};
export const decrypt = (key: Buffer, value: string) => {
  const [iv, tag, enc] = value.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const featuresFromScopes = (scopes: readonly string[]) => ({ calendar: scopes.includes(SCOPES.calendar), drive: scopes.includes(SCOPES.drive) });

export function scopesFor(features: readonly Feature[]) {
  return [...new Set([SCOPES.email, ...features.map((f) => SCOPES[f])])];
}

/* ---------------- connect / disconnect ---------------- */

export async function startConnect(db: Q, cfg: GoogleCfg, userId: string, features: readonly Feature[]) {
  const state = randomBytes(32).toString("base64url");
  await db.query(`insert into finance.google_connections(user_id,state_hash,state_expires_at) values($1,$2,now()+interval '10 minutes')
    on conflict(user_id) do update set state_hash=excluded.state_hash, state_expires_at=excluded.state_expires_at, updated_at=now()`, [userId, hash(state)]);
  const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: scopesFor(features).join(" "), state });
  return `${AUTH_URL}?${params}`;
}

export async function finishConnect(db: Q, cfg: GoogleCfg, code: string, state: string, f: Fetch = fetch) {
  const pending = (await db.query("select user_id from finance.google_connections where state_hash=$1 and state_expires_at > now()", [hash(state)])).rows[0];
  if (!pending) throw new Error("STATE_EXPIRED");
  const res = await f(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }) });
  if (!res.ok) throw new Error("GOOGLE_REJECTED");
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  const existing = (await db.query("select refresh_enc from finance.google_connections where user_id=$1", [pending.user_id])).rows[0]?.refresh_enc as string | null;
  if (!t.refresh_token && !existing) throw new Error("NO_REFRESH_TOKEN");
  const scopes = String(t.scope ?? "").split(/\s+/).filter(Boolean);
  let email: string | null = null;
  try { const info = await f(USERINFO_URL, { headers: { authorization: `Bearer ${t.access_token}` } }); if (info.ok) email = ((await info.json()) as { email?: string }).email ?? null; } catch { /* the e-mail is only a label */ }
  await db.query(`update finance.google_connections set access_enc=$2, refresh_enc=$3, expires_at=now()+($4 * interval '1 second'), granted_scopes=$5, email=coalesce($6,email),
    state_hash=null, state_expires_at=null, connected_at=coalesce(connected_at,now()), updated_at=now() where user_id=$1`,
    [pending.user_id, encrypt(cfg.key, t.access_token), t.refresh_token ? encrypt(cfg.key, t.refresh_token) : existing, t.expires_in ?? 3600, scopes, email]);
  return { userId: pending.user_id as string, features: featuresFromScopes(scopes) };
}

export async function disconnect(db: Q, cfg: GoogleCfg | null, userId: string, f: Fetch = fetch) {
  const row = (await db.query("select refresh_enc from finance.google_connections where user_id=$1", [userId])).rows[0];
  if (row?.refresh_enc && cfg) { try { await f(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(cfg.key, row.refresh_enc) }) }); } catch { /* revoking is best effort */ } }
  for (const t of ["google_connections", "google_calendar_events", "google_drive_files", "google_sheet_exports"]) await db.query(`delete from finance.${t} where user_id=$1`, [userId]);
}

export async function status(db: Q, cfg: GoogleCfg | null, userId: string) {
  const c = (await db.query("select email,granted_scopes,connected_at,refresh_enc from finance.google_connections where user_id=$1", [userId])).rows[0];
  const connected = Boolean(c?.refresh_enc);
  const features = connected ? featuresFromScopes(c.granted_scopes ?? []) : { calendar: false, drive: false };
  const [ev, dr, sh] = connected ? await Promise.all([
    db.query("select count(*)::int n from finance.google_calendar_events where user_id=$1", [userId]),
    db.query("select status,count(*)::int n from finance.google_drive_files where user_id=$1 group by status", [userId]),
    db.query("select spreadsheet_url,status,last_synced_at,last_error from finance.google_sheet_exports where user_id=$1", [userId]),
  ]) : [null, null, null];
  const drive = Object.fromEntries((dr?.rows ?? []).map((r) => [r.status, Number(r.n)]));
  return {
    configured: Boolean(cfg), connected, email: connected ? c.email ?? null : null, features,
    calendar: { events: Number(ev?.rows[0]?.n ?? 0) },
    drive: { uploaded: drive.uploaded ?? 0, failed: drive.failed ?? 0 },
    sheet: sh?.rows[0] ? { url: sh.rows[0].spreadsheet_url as string | null, status: sh.rows[0].status as string, lastSyncedAt: sh.rows[0].last_synced_at ? new Date(sh.rows[0].last_synced_at).toISOString() : null, error: sh.rows[0].last_error as string | null } : null,
  };
}

/** A fresh access token, refreshing when needed. A revoked grant clears the tokens so the UI can ask to reconnect. */
export async function accessToken(db: Q, cfg: GoogleCfg, userId: string, f: Fetch = fetch): Promise<string | null> {
  const c = (await db.query("select access_enc,refresh_enc,expires_at from finance.google_connections where user_id=$1", [userId])).rows[0];
  if (!c?.refresh_enc) return null;
  if (c.access_enc && c.expires_at && new Date(c.expires_at).getTime() - Date.now() > 60_000) return decrypt(cfg.key, c.access_enc);
  const res = await f(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: decrypt(cfg.key, c.refresh_enc), grant_type: "refresh_token" }) });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) await db.query("update finance.google_connections set access_enc=null, refresh_enc=null, expires_at=null, updated_at=now() where user_id=$1", [userId]);
    return null;
  }
  const t = (await res.json()) as { access_token: string; expires_in?: number };
  await db.query("update finance.google_connections set access_enc=$2, expires_at=now()+($3 * interval '1 second'), updated_at=now() where user_id=$1", [userId, encrypt(cfg.key, t.access_token), t.expires_in ?? 3600]);
  return t.access_token;
}

const api = async (f: Fetch, token: string, url: string, init: RequestInit = {}) => {
  const res = await f(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
  return res;
};

/* ---------------- Calendar: recurring bills ---------------- */

type Bill = { id: string; name: string; amount: number; day: number };
export const nextDate = (day: number, now: Date) => {
  const wib = new Date(now.getTime() + 7 * 3600_000);
  let y = wib.getUTCFullYear(), m = wib.getUTCMonth();
  const clamp = (yy: number, mm: number) => Math.min(day, new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate());
  if (clamp(y, m) < wib.getUTCDate()) { m += 1; if (m > 11) { m = 0; y += 1; } }
  return new Date(Date.UTC(y, m, clamp(y, m))).toISOString().slice(0, 10);
};
export function billEvent(b: Bill, now = new Date()) {
  const start = nextDate(b.day, now), end = new Date(Date.parse(start) + 86400_000).toISOString().slice(0, 10);
  const rrule = b.day > 28 ? "RRULE:FREQ=MONTHLY;BYMONTHDAY=29,30,31;BYSETPOS=-1" : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${b.day}`;
  return {
    summary: `Tagihan ${b.name}`, description: `Rp ${Math.round(b.amount).toLocaleString("id-ID")} · dari Djiwa Pay`,
    start: { date: start }, end: { date: end }, recurrence: [rrule],
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 900 }] },   // 09:00 the day before
    extendedProperties: { private: { djiwapay: "1", billId: b.id } },
  };
}

export async function syncCalendar(db: Q, cfg: GoogleCfg, userId: string, f: Fetch = fetch, now = new Date()) {
  const token = await accessToken(db, cfg, userId, f);
  if (!token) return { ok: false as const, error: "NOT_CONNECTED" };
  const bills = (await db.query("select id,name,amount,day from finance.bills where user_id=$1", [userId])).rows.map((r) => ({ id: r.id as string, name: r.name as string, amount: Number(r.amount), day: Number(r.day) }));
  const mapped = (await db.query("select bill_id,calendar_id,event_id from finance.google_calendar_events where user_id=$1", [userId])).rows as { bill_id: string; calendar_id: string; event_id: string }[];
  const byBill = new Map(mapped.map((m) => [m.bill_id, m]));
  let created = 0, updated = 0, removed = 0, failed = 0;
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  for (const b of bills) {
    const body = JSON.stringify(billEvent(b, now)), m = byBill.get(b.id);
    if (m) {
      const r = await api(f, token, `${base}/${encodeURIComponent(m.event_id)}`, { method: "PUT", body });
      if (r.ok) updated++;
      else if (r.status === 404 || r.status === 410) { byBill.delete(b.id); await db.query("delete from finance.google_calendar_events where user_id=$1 and bill_id=$2", [userId, b.id]); }   // deleted by the user in Google: recreate below
      else failed++;
      if (r.ok) continue;
      if (r.status !== 404 && r.status !== 410) continue;
    }
    const r = await api(f, token, base, { method: "POST", body });
    if (!r.ok) { failed++; continue; }
    const ev = (await r.json()) as { id: string };
    await db.query("insert into finance.google_calendar_events(user_id,bill_id,event_id) values($1,$2,$3) on conflict(user_id,bill_id) do update set event_id=excluded.event_id, updated_at=now()", [userId, b.id, ev.id]);
    created++;
  }
  const live = new Set(bills.map((b) => b.id));
  for (const m of mapped) if (!live.has(m.bill_id)) {
    const r = await api(f, token, `${base}/${encodeURIComponent(m.event_id)}`, { method: "DELETE" });
    if (r.ok || r.status === 404 || r.status === 410) { await db.query("delete from finance.google_calendar_events where user_id=$1 and bill_id=$2", [userId, m.bill_id]); removed++; } else failed++;
  }
  return { ok: failed === 0, created, updated, removed, failed };
}

/* ---------------- Drive: receipt photos ---------------- */

async function ensureFolder(f: Fetch, token: string, name: string, parent?: string): Promise<string> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parent ? ` and '${parent}' in parents` : ""}`;
  const found = await api(f, token, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
  if (found.ok) { const id = ((await found.json()) as { files?: { id: string }[] }).files?.[0]?.id; if (id) return id; }
  const made = await api(f, token, "https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }) });
  if (!made.ok) throw new Error(`DRIVE_FOLDER_${made.status}`);
  return ((await made.json()) as { id: string }).id;
}

export async function syncDrive(db: Q, cfg: GoogleCfg, userId: string, dir: string, f: Fetch = fetch, limit = 15) {
  const token = await accessToken(db, cfg, userId, f);
  if (!token) return { ok: false as const, error: "NOT_CONNECTED" };
  const todo = (await db.query(`select r.id,r.merchant,r.purchased_at,r.created_at,r.image_path from finance.receipts r
    left join finance.google_drive_files d on d.user_id=r.user_id and d.receipt_id=r.id
    where r.user_id=$1 and r.image_path is not null and (d.receipt_id is null or (d.status<>'uploaded' and d.attempts<5)) order by r.created_at limit $2`, [userId, limit])).rows;
  if (!todo.length) return { ok: true as const, uploaded: 0, failed: 0 };
  let folder: string;
  try { folder = await ensureFolder(f, token, "Struk", await ensureFolder(f, token, "Djiwa Pay")); } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "DRIVE_FAILED" }; }
  let uploaded = 0, failed = 0;
  for (const r of todo) {
    try {
      const bytes = await readFile(join(dir, r.image_path as string));
      const ext = String(r.image_path).split(".").pop() || "jpg", mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const day = new Date(r.purchased_at ?? r.created_at).toISOString().slice(0, 10);
      const name = `${day} ${String(r.merchant || "Struk").replace(/[\\/:*?"<>|]/g, " ").trim().slice(0, 40)}.${ext}`;
      const boundary = `b${randomBytes(8).toString("hex")}`;
      const meta = JSON.stringify({ name, parents: [folder], appProperties: { djiwapay: "1", receiptId: r.id } });
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
      const res = await f("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` }, body });
      if (!res.ok) throw new Error(`DRIVE_${res.status}`);
      const file = (await res.json()) as { id: string };
      await db.query("insert into finance.google_drive_files(user_id,receipt_id,file_id,folder_id,status,attempts) values($1,$2,$3,$4,'uploaded',1) on conflict(user_id,receipt_id) do update set file_id=excluded.file_id, folder_id=excluded.folder_id, status='uploaded', last_error=null, attempts=finance.google_drive_files.attempts+1, updated_at=now()", [userId, r.id, file.id, folder]);
      uploaded++;
    } catch (e) {
      failed++;
      await db.query("insert into finance.google_drive_files(user_id,receipt_id,status,attempts,last_error) values($1,$2,'failed',1,$3) on conflict(user_id,receipt_id) do update set status='failed', attempts=finance.google_drive_files.attempts+1, last_error=excluded.last_error, updated_at=now()", [userId, r.id, (e instanceof Error ? e.message : "error").slice(0, 120)]);
    }
  }
  return { ok: failed === 0, uploaded, failed };
}

/* ---------------- Sheets: monthly export ---------------- */

type Row = { at: string | Date; kind: string; amount: number | string; category_id: string; account_id: string; note: string; source: string };
const KIND: Record<string, string> = { out: "Pengeluaran", in: "Pemasukan", tf: "Transfer" };
const SOURCE: Record<string, string> = { manual: "Manual", voice: "Suara", pay: "Djiwa Pay", receipt: "Scan struk", email: "Email" };
const WIB = (d: string | Date) => new Date(new Date(d).getTime() + 7 * 3600_000).toISOString();

export function sheetRows(entries: Row[], names: { cat: Record<string, string>; acc: Record<string, string> }) {
  const catatan: (string | number)[][] = [["Tanggal", "Jam", "Jenis", "Kategori", "Dompet", "Jumlah", "Catatan", "Sumber"]];
  const month = new Map<string, { in: number; out: number }>();
  for (const e of entries) {
    const w = WIB(e.at), amount = Number(e.amount);
    catatan.push([w.slice(0, 10), w.slice(11, 16), KIND[e.kind] ?? e.kind, names.cat[e.category_id] ?? e.category_id, names.acc[e.account_id] ?? e.account_id, amount, e.note, SOURCE[e.source] ?? e.source]);
    const m = month.get(w.slice(0, 7)) ?? { in: 0, out: 0 };
    if (e.kind === "in") m.in += amount; else if (e.kind === "out") m.out += amount;
    month.set(w.slice(0, 7), m);
  }
  const ringkasan: (string | number)[][] = [["Bulan", "Pemasukan", "Pengeluaran", "Selisih"], ...[...month].sort(([a], [b]) => (a < b ? 1 : -1)).map(([k, v]) => [k, v.in, v.out, v.in - v.out])];
  return { catatan, ringkasan };
}

export type ExportResult = { ok: true; url: string; rows: number } | { ok: false; error: string };
export async function exportSheet(db: Q, cfg: GoogleCfg, userId: string, f: Fetch = fetch): Promise<ExportResult> {
  const token = await accessToken(db, cfg, userId, f);
  if (!token) return { ok: false, error: "NOT_CONNECTED" };
  const [en, ca, ac, ex] = await Promise.all([
    db.query("select at,kind,amount,category_id,account_id,note,source from finance.entries where user_id=$1 order by at desc limit 20000", [userId]),
    db.query("select id,name from finance.categories where user_id=$1", [userId]),
    db.query("select id,name from finance.accounts where user_id=$1", [userId]),
    db.query("select spreadsheet_id,spreadsheet_url from finance.google_sheet_exports where user_id=$1", [userId]),
  ]);
  const cat: Record<string, string> = { makan: "Makan & minum", transport: "Transportasi", belanja: "Belanja", tagihan: "Tagihan & utilitas", hiburan: "Hiburan", kesehatan: "Kesehatan", pendidikan: "Pendidikan", rumah: "Rumah", transfer: "Transfer", lainnya: "Lainnya", gaji: "Gaji", bonus: "Bonus & lainnya", tunai: "Tunai" };
  for (const r of ca.rows) cat[r.id] = r.name;
  const acc: Record<string, string> = { tunai: "Tunai" };
  for (const r of ac.rows) acc[r.id] = r.name;
  const { catatan, ringkasan } = sheetRows(en.rows as Row[], { cat, acc });
  let id = ex.rows[0]?.spreadsheet_id as string | undefined, url = ex.rows[0]?.spreadsheet_url as string | undefined;
  const fail = async (error: string): Promise<ExportResult> => { await db.query("insert into finance.google_sheet_exports(user_id,spreadsheet_id,spreadsheet_url,status,last_error) values($1,$2,$3,'failed',$4) on conflict(user_id) do update set status='failed', last_error=excluded.last_error, updated_at=now()", [userId, id ?? null, url ?? null, error]); return { ok: false, error }; };
  if (!id) {
    const r = await api(f, token, "https://sheets.googleapis.com/v4/spreadsheets", { method: "POST", body: JSON.stringify({ properties: { title: "Djiwa Pay · Catatan keuangan", locale: "id_ID", timeZone: "Asia/Jakarta" }, sheets: [{ properties: { title: "Catatan", gridProperties: { frozenRowCount: 1 } } }, { properties: { title: "Ringkasan", gridProperties: { frozenRowCount: 1 } } }] }) });
    if (!r.ok) return fail(`SHEETS_${r.status}`);
    const j = (await r.json()) as { spreadsheetId: string; spreadsheetUrl: string };
    id = j.spreadsheetId; url = j.spreadsheetUrl;
  } else {
    const c = await api(f, token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges: ["Catatan", "Ringkasan"] }) });
    if (c.status === 404) { await db.query("delete from finance.google_sheet_exports where user_id=$1", [userId]); return exportSheet(db, cfg, userId, f); }   // the user deleted the file: make a fresh one
    if (!c.ok) return fail(`SHEETS_${c.status}`);
  }
  const w = await api(f, token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: [{ range: "Catatan!A1", values: catatan }, { range: "Ringkasan!A1", values: ringkasan }] }) });
  if (!w.ok) return fail(`SHEETS_${w.status}`);
  await db.query("insert into finance.google_sheet_exports(user_id,spreadsheet_id,spreadsheet_url,status,last_synced_at,last_error) values($1,$2,$3,'synced',now(),null) on conflict(user_id) do update set spreadsheet_id=excluded.spreadsheet_id, spreadsheet_url=excluded.spreadsheet_url, status='synced', last_synced_at=now(), last_error=null, updated_at=now()", [userId, id, url]);
  return { ok: true, url: url!, rows: catatan.length - 1 };
}
