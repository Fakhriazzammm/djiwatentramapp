import type { Hono } from "hono";
import { cors } from "hono/cors";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * Masuk karyawan/internal dengan Google (Better Auth `staffAuth`) → sesi Yumi (`ys_…`).
 *
 * Alur:
 *  1. Browser: GET /api/auth/staff-google/start?to=<origin> → Google → callback Better Auth (pelanggan) → cookie sesi.
 *  2. POST /api/auth/staff-google/session  → jika akun Google sudah terhubung ke karyawan (atau emailnya
 *     sama persis dengan email karyawan aktif, Google terverifikasi) → terbitkan sesi Yumi. Jika belum → linked:false.
 *  3. POST /api/auth/staff-google/link     → hubungkan akun Google ke karyawan: bukti kepemilikan = PIN karyawan
 *     atau sesi Yumi yang sedang aktif (mis. dari halaman Profil).
 *
 * Penghubung disimpan di `yumi_users.better_auth_user_id` (kolom `auth_user_id` dipakai Supabase Auth, jangan diubah).
 */

/** Origin yang boleh dikembalikan setelah login Google dan boleh memanggil endpoint ini. */
export const STAFF_GOOGLE_ORIGINS = [
  "https://karyawan.djiwatentram.web.id",
  "https://admin.djiwatentram.web.id",
  "https://pos.djiwatentram.web.id",
  "https://manager.djiwatentram.web.id",
  "http://localhost:5173",
  "http://localhost:5174",
];
const BASE = "/api/auth/staff-google";

type SessionGetter = (headers: Headers) => Promise<{ user?: { id?: string; email?: string; name?: string; image?: string | null; emailVerified?: boolean } } | null>;

const PIN_MAX_FAILS = 5;
const PIN_LOCK_MIN = 15;
const SESSION_HOURS = 24;

type YumiRow = { source_id: string; name: string; slug: string | null; is_active: boolean; email: string | null; better_auth_user_id: string | null; auth_user_id: string | null };

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const newToken = () => `ys_${randomUUID().replace(/-/g, "")}_${randomUUID().replace(/-/g, "").slice(0, 18)}`;

export function registerStaffGoogleRoutes(app: Hono, deps: {
  pool: Pool;
  getSession: SessionGetter;
  /** Better Auth `auth.api.signInSocial` (instance pelanggan, redirect URI Google sudah terdaftar). */
  signInSocial: (opts: { body: { provider: "google"; callbackURL: string }; headers: Headers; asResponse: true }) => Promise<Response>;
  json: (body: unknown, status?: number) => Response;
}) {
  const { pool, getSession, signInSocial, json } = deps;

  app.use(`${BASE}/*`, cors({ origin: STAFF_GOOGLE_ORIGINS, allowHeaders: ["Content-Type"], allowMethods: ["POST", "GET", "OPTIONS"], credentials: true }));

  // Mulai login Google: navigasi tingkat atas dari app (tanpa fetch lintas-origin), lalu 302 ke Google.
  app.get(`${BASE}/start`, async (c) => {
    const to = String(c.req.query("to") ?? "");
    if (!STAFF_GOOGLE_ORIGINS.includes(to)) return c.text("origin tidak diizinkan", 400);
    const res = await signInSocial({ body: { provider: "google", callbackURL: `${BASE}/return?to=${encodeURIComponent(to)}` }, headers: c.req.raw.headers, asResponse: true });
    const data = await res.clone().json().catch(() => null) as { url?: string } | null;
    const headers = new Headers();
    for (const cookie of res.headers.getSetCookie?.() ?? []) headers.append("set-cookie", cookie);
    if (!data?.url) return c.text("gagal memulai login Google", 502);
    headers.set("location", data.url);
    headers.set("cache-control", "no-store");
    return new Response(null, { status: 302, headers });
  });

  // Setelah Google + Better Auth selesai (cookie sesi sudah terpasang), kembali ke app asal.
  app.get(`${BASE}/return`, (c) => {
    const to = String(c.req.query("to") ?? "");
    if (!STAFF_GOOGLE_ORIGINS.includes(to)) return c.text("origin tidak diizinkan", 400);
    return c.redirect(`${to}/auth/google`, 302);
  });

  async function issue(row: YumiRow) {
    const token = newToken();
    const expiresAt = Date.now() + SESSION_HOURS * 3600_000;
    await pool.query(`INSERT INTO public.yumi_sessions (token, user_source_id, expires_at) VALUES ($1, $2, $3)`, [token, row.source_id, new Date(expiresAt).toISOString()]);
    await pool.query(`UPDATE public.yumi_users SET last_login_at = now() WHERE source_id = $1`, [row.source_id]);
    return { token, expiresAt, user: { _id: row.source_id, name: row.name, slug: row.slug ?? undefined } };
  }

  async function findLinked(baId: string, email: string, verified: boolean): Promise<{ row?: YumiRow; autoLinked?: boolean; ambiguous?: boolean }> {
    // 1. Sudah terhubung (atau akun HRD lama yang auth_user_id-nya id Better Auth).
    const direct = await pool.query<YumiRow>(
      `SELECT source_id, name, slug, is_active, email, better_auth_user_id, auth_user_id FROM public.yumi_users
        WHERE better_auth_user_id = $1 OR auth_user_id = $1 LIMIT 2`, [baId]);
    if (direct.rows.length === 1) {
      const row = direct.rows[0];
      if (row.better_auth_user_id !== baId) await pool.query(`UPDATE public.yumi_users SET better_auth_user_id = $1 WHERE source_id = $2 AND better_auth_user_id IS NULL`, [baId, row.source_id]);
      return { row };
    }
    if (direct.rows.length > 1) return { ambiguous: true };
    // 2. Email Google terverifikasi sama dengan email karyawan aktif yang belum terhubung ke Google lain.
    if (!verified || !email) return {};
    const byEmail = await pool.query<YumiRow>(
      `SELECT source_id, name, slug, is_active, email, better_auth_user_id, auth_user_id FROM public.yumi_users
        WHERE is_active = true AND better_auth_user_id IS NULL AND lower(btrim(email)) = $1 LIMIT 2`, [email]);
    if (byEmail.rows.length === 1) {
      const row = byEmail.rows[0];
      const upd = await pool.query(`UPDATE public.yumi_users SET better_auth_user_id = $1 WHERE source_id = $2 AND better_auth_user_id IS NULL`, [baId, row.source_id]);
      if (upd.rowCount === 1) return { row: { ...row, better_auth_user_id: baId }, autoLinked: true };
    }
    return { ambiguous: byEmail.rows.length > 1 };
  }

  app.post(`${BASE}/session`, async (c) => {
    const session = await getSession(c.req.raw.headers);
    const user = session?.user;
    if (!user?.id) return json({ success: true, authenticated: false });
    const email = String(user.email ?? "").trim().toLowerCase();
    const found = await findLinked(user.id, email, user.emailVerified === true);
    const profile = { email, name: user.name ?? "", picture: user.image ?? null };
    if (found.row) {
      if (!found.row.is_active) return json({ success: false, error: "STAFF_INACTIVE", message: "Akun karyawan nonaktif. Hubungi supervisor." }, 403);
      return json({ success: true, authenticated: true, linked: true, autoLinked: !!found.autoLinked, ...(await issue(found.row)), profile });
    }
    return json({ success: true, authenticated: true, linked: false, ambiguous: !!found.ambiguous, profile });
  });

  // Status hubungan Google untuk karyawan yang sedang masuk (dipakai halaman Profil).
  app.post(`${BASE}/status`, async (c) => {
    const body = await c.req.json().catch(() => ({})) as { yumiToken?: string };
    const r = await pool.query<{ better_auth_user_id: string | null; email: string | null }>(
      `SELECT u.better_auth_user_id, u.email FROM public.yumi_sessions s JOIN public.yumi_users u ON u.source_id = s.user_source_id
        WHERE s.token = $1 AND s.expires_at > now() LIMIT 1`, [String(body.yumiToken ?? "")]);
    if (!r.rows[0]) return json({ success: false, error: "SESSION_INVALID", message: "Sesi berakhir." }, 401);
    return json({ success: true, linked: !!r.rows[0].better_auth_user_id, email: r.rows[0].email });
  });

  app.post(`${BASE}/link`, async (c) => {
    const session = await getSession(c.req.raw.headers);
    const user = session?.user;
    if (!user?.id) return json({ success: false, error: "GOOGLE_REQUIRED", message: "Masuk dengan Google dulu." }, 401);
    if (user.emailVerified !== true) return json({ success: false, error: "EMAIL_UNVERIFIED", message: "Email Google belum terverifikasi." }, 403);
    const body = await c.req.json().catch(() => ({})) as { userId?: string; pin?: string; yumiToken?: string };
    const email = String(user.email ?? "").trim().toLowerCase();

    let target: YumiRow | undefined;
    if (body.yumiToken) {
      const s = await pool.query<{ user_source_id: string }>(`SELECT user_source_id FROM public.yumi_sessions WHERE token = $1 AND expires_at > now() LIMIT 1`, [String(body.yumiToken)]);
      if (!s.rows[0]) return json({ success: false, error: "SESSION_INVALID", message: "Sesi berakhir. Masuk ulang." }, 401);
      target = (await pool.query<YumiRow>(`SELECT source_id, name, slug, is_active, email, better_auth_user_id, auth_user_id FROM public.yumi_users WHERE source_id = $1`, [s.rows[0].user_source_id])).rows[0];
    } else {
      const userId = String(body.userId ?? ""); const pin = String(body.pin ?? "");
      if (!userId || !/^\d{6}$/.test(pin)) return json({ success: false, error: "INPUT_INVALID", message: "Pilih nama dan isi PIN 6 digit." }, 400);
      const recent = await pool.query<{ ok: boolean }>(`SELECT ok FROM public.attendance_verify_attempts WHERE user_id = $1 AND created_at > now() - make_interval(mins => $2) ORDER BY created_at DESC LIMIT $3`, [userId, PIN_LOCK_MIN, PIN_MAX_FAILS]);
      if (recent.rows.length >= PIN_MAX_FAILS && recent.rows.every((r) => !r.ok)) return json({ success: false, error: "PIN_LOCKED", message: `PIN terkunci ${PIN_LOCK_MIN} menit karena terlalu banyak salah.` }, 429);
      const u = await pool.query<YumiRow & { home_pin_fingerprint: string | null }>(`SELECT source_id, name, slug, is_active, email, better_auth_user_id, auth_user_id, home_pin_fingerprint FROM public.yumi_users WHERE source_id = $1`, [userId]);
      const row = u.rows[0];
      const ok = !!row && !!row.home_pin_fingerprint && row.home_pin_fingerprint === sha256(pin);
      await pool.query(`INSERT INTO public.attendance_verify_attempts (user_id, ok, method) VALUES ($1, $2, 'google_link')`, [userId, ok]);
      if (!ok) return json({ success: false, error: "PIN_WRONG", message: "Nama atau PIN salah." }, 403);
      target = row;
    }
    if (!target || !target.is_active) return json({ success: false, error: "STAFF_INACTIVE", message: "Akun karyawan tidak aktif." }, 403);
    if (target.better_auth_user_id && target.better_auth_user_id !== user.id) return json({ success: false, error: "ALREADY_LINKED", message: "Akun karyawan ini sudah terhubung ke Google lain. Minta supervisor melepasnya." }, 409);
    const taken = await pool.query(`SELECT 1 FROM public.yumi_users WHERE better_auth_user_id = $1 AND source_id <> $2 LIMIT 1`, [user.id, target.source_id]);
    if (taken.rows.length) return json({ success: false, error: "GOOGLE_TAKEN", message: "Akun Google ini sudah terhubung ke karyawan lain." }, 409);
    await pool.query(`UPDATE public.yumi_users SET better_auth_user_id = $1, email = COALESCE(NULLIF(btrim(email), ''), $3) WHERE source_id = $2`, [user.id, target.source_id, email || null]);
    return json({ success: true, linked: true, ...(await issue(target)) });
  });
}
