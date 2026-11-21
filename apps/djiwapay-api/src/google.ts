/** One Google connection per Djiwa Pay user, shared by Calendar, Drive and Sheets.
 *  Tokens are AES-256-GCM encrypted in Postgres; the browser only ever gets the account e-mail and which features are on. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
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
  /** Restricted scope. Only used to fetch mail from the listed bank / e-wallet senders. */
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
} as const;
export type Feature = "calendar" | "drive" | "gmail";
export const FEATURES: Feature[] = ["calendar", "drive", "gmail"];

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
export const featuresFromScopes = (scopes: readonly string[]) => ({ calendar: scopes.includes(SCOPES.calendar), drive: scopes.includes(SCOPES.drive), gmail: scopes.includes(SCOPES.gmail) });

/** Switches (off_features keys) that a fresh Google grant for these features turns back on. */
const offKeys = (requested: readonly Feature[]) => requested.flatMap((f) => (f === "calendar" ? ["calendar"] : f === "drive" ? ["sheets", "receipts"] : []));
export function scopesFor(features: readonly Feature[]) {
  return [...new Set([SCOPES.email, ...features.map((f) => SCOPES[f])])];
}

/* ---------------- connect / disconnect ---------------- */

export async function startConnect(db: Q, cfg: GoogleCfg, userId: string, features: readonly Feature[], requested = features) {
  const state = `${randomBytes(32).toString("base64url")}.${requested.join(",")}`;
  await db.query(`insert into finance.google_connections(user_id,state_hash,state_expires_at) values($1,$2,now()+interval '10 minutes')
    on conflict(user_id) do update set state_hash=excluded.state_hash, state_expires_at=excluded.state_expires_at, updated_at=now()`, [userId, hash(state)]);
  const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: scopesFor(features).join(" "), state });
  return `${AUTH_URL}?${params}`;
}

export async function finishConnect(db: Q, cfg: GoogleCfg, code: string, state: string, f: Fetch = fetch) {
  const stateHash = hash(state);
  const pending = (await db.query("select user_id,refresh_enc,email from finance.google_connections where state_hash=$1 and state_expires_at > now()", [stateHash])).rows[0];
  if (!pending) throw new Error("STATE_EXPIRED");
  const res = await f(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }) });
  if (!res.ok) throw new Error("GOOGLE_REJECTED");
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  const existing = pending.refresh_enc as string | null;
  if (!t.refresh_token && !existing) throw new Error("NO_REFRESH_TOKEN");
  const scopes = String(t.scope ?? "").split(/\s+/).filter(Boolean);
  const features = featuresFromScopes(scopes);
  if (!FEATURES.some((feature) => features[feature])) throw new Error("NO_FEATURE_GRANTED");
  const [, requestedRaw] = state.split(".");
  // Legacy callbacks issued before deployment have only the random nonce.
  const requested = requestedRaw === undefined ? FEATURES.filter((feature) => features[feature])
    : FEATURES.filter((feature) => requestedRaw.split(",").includes(feature));
  let email: string | null = null;
  try { const info = await f(USERINFO_URL, { headers: { authorization: `Bearer ${t.access_token}` } }); if (info.ok) email = ((await info.json()) as { email?: string }).email ?? null; } catch { /* the e-mail is only a label */ }
  if (pending.email && email && pending.email.toLowerCase() !== email.toLowerCase()) throw new Error("ACCOUNT_MISMATCH");
  const saved = await db.query(`update finance.google_connections set access_enc=$2, refresh_enc=$3, expires_at=now()+($4 * interval '1 second'), granted_scopes=$5, email=coalesce($6,email),
    off_features=(select coalesce(array_agg(x),'{}') from unnest(off_features) x where not (x = any($8::text[]))),
    state_hash=null, state_expires_at=null, connected_at=coalesce(connected_at,now()), updated_at=now() where user_id=$1 and state_hash=$7 returning user_id`,
    [pending.user_id, encrypt(cfg.key, t.access_token), t.refresh_token ? encrypt(cfg.key, t.refresh_token) : existing, t.expires_in ?? 3600, scopes, email, stateHash, offKeys(requested)]);
  if (!saved.rows.length) throw new Error("STATE_EXPIRED");
  return { userId: pending.user_id as string, features, requested, partial: requested.some((feature) => !features[feature]) };
}

export async function disconnect(db: Q, cfg: GoogleCfg | null, userId: string, f: Fetch = fetch) {
  const row = (await db.query("select refresh_enc from finance.google_connections where user_id=$1", [userId])).rows[0];
  if (row?.refresh_enc && cfg) { try { await f(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(cfg.key, row.refresh_enc) }) }); } catch { /* revoking is best effort */ } }
  for (const t of ["google_connections", "google_calendar_events", "google_drive_files", "google_sheet_exports", "gmail_sync", "gmail_seen", "sheet_rows", "google_drive_state"]) await db.query(`delete from finance.${t} where user_id=$1`, [userId]);
}

export async function status(db: Q, cfg: GoogleCfg | null, userId: string) {
  const c = (await db.query("select email,granted_scopes,connected_at,refresh_enc,off_features from finance.google_connections where user_id=$1", [userId])).rows[0];
  const connected = Boolean(c?.refresh_enc);
  const features = connected ? featuresFromScopes(c.granted_scopes ?? []) : { calendar: false, drive: false, gmail: false };
  const off = new Set<string>((c?.off_features as string[] | null) ?? []);
  /** What is actually running: granted by Google and not switched off. */
  const active = { calendar: features.calendar && !off.has("calendar"), sheets: features.drive && !off.has("sheets"), receipts: features.drive && !off.has("receipts") };
  const gm = connected ? (await db.query("select enabled,last_polled_at,last_error,fetched_count from finance.gmail_sync where user_id=$1", [userId])).rows[0] : null;
  const [ev, dr, sh] = connected ? await Promise.all([
    db.query("select count(*)::int n from finance.google_calendar_events where user_id=$1", [userId]),
    db.query("select status,count(*)::int n from finance.google_drive_files where user_id=$1 group by status", [userId]),
    db.query("select spreadsheet_url,status,last_synced_at,last_error,hold,last_stats,dirty from finance.google_sheet_exports where user_id=$1", [userId]),
  ]) : [null, null, null];
  const drive = Object.fromEntries((dr?.rows ?? []).map((r) => [r.status, Number(r.n)]));
  const dh = connected ? (await db.query("select hold,last_error,last_checked_at from finance.google_drive_state where user_id=$1", [userId])).rows[0] : null;
  return {
    configured: Boolean(cfg), connected, email: connected ? c.email ?? null : null, features, active,
    gmail: gm ? { enabled: Boolean(gm.enabled), lastPolledAt: gm.last_polled_at ? new Date(gm.last_polled_at).toISOString() : null, error: (gm.last_error as string | null) ?? null, fetched: Number(gm.fetched_count) } : null,
    calendar: { events: Number(ev?.rows[0]?.n ?? 0) },
    drive: { uploaded: drive.uploaded ?? 0, failed: drive.failed ?? 0, hold: (dh?.hold as string | null) ?? null, lastCheckedAt: dh?.last_checked_at ? new Date(dh.last_checked_at).toISOString() : null },
    sheet: sh?.rows[0] ? { url: sh.rows[0].spreadsheet_url as string | null, status: sh.rows[0].status as string, lastSyncedAt: sh.rows[0].last_synced_at ? new Date(sh.rows[0].last_synced_at).toISOString() : null, error: sh.rows[0].last_error as string | null, hold: (sh.rows[0].hold as string | null) ?? null, pending: Boolean(sh.rows[0].dirty), stats: (sh.rows[0].last_stats ?? {}) as Record<string, number> } : null,
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

/** Why Google refused: the first "reason" in its error body (e.g. accessNotConfigured, rateLimitExceeded), never the message text. */
export async function googleReason(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: { status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
    return String(j.error?.errors?.[0]?.reason ?? j.error?.details?.[0]?.reason ?? j.error?.status ?? "").replace(/[^A-Za-z_]/g, "").slice(0, 40);
  } catch { return ""; }
}
