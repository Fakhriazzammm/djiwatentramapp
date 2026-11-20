import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";
import { computeLatePenalty, LATE_TOLERANCE_MIN, sendAttendanceReport, uploadAttendancePhoto } from "../_shared/attendance-report.ts";

/**
 * Absen masuk langsung dari app Karyawan.
 *   action "preflight" -> cek lokasi, jadwal, status absen (tanpa menulis apa pun)
 *   action "clockIn"   -> verifikasi (wajah atau PIN) + tulis log absen masuk
 * Absen keluar tetap lewat `process-closing` (closing shift wajib), yang memakai
 * aturan identitas dan geofence yang sama.
 * Identitas pemanggil selalu dari token sesi (`yumi_sessions`), bukan dari body.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};

const WIB = 7 * 3600_000;
const FACE_THRESHOLD = 0.6; // default face-api; deskriptor pendaftaran dirata-rata dari 3 bingkai
const MAX_ACCURACY_M = 250;
const WINDOW_OPEN_MIN = 30; // absen dibuka 30 menit sebelum shift
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MIN = 15;
const DEFAULT_RADIUS_M = 80;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400, extra: Record<string, unknown> = {}) =>
  json({ success: false, error: { code, message }, ...extra }, status);

type Db = ReturnType<typeof createClient>;
type Loc = { lat: number; lng: number; accuracy?: number } | null;

function bearer(req: Request) {
  const v = req.headers.get("authorization") ?? "";
  return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : "";
}

async function sha256Hex(value: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371e3, rad = Math.PI / 180;
  const p1 = aLat * rad, p2 = bLat * rad, dp = (bLat - aLat) * rad, dl = (bLng - aLng) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function euclid(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

const wibNow = () => new Date(Date.now() + WIB);
const wibDate = (d = wibNow()) => d.toISOString().slice(0, 10);
const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

async function logEvent(db: Db, userId: string | null, stage: string, code: string, detail?: string, req?: Request) {
  try {
    await db.from("attendance_client_events").insert({ user_id: userId, stage, code, detail: detail?.slice(0, 300) ?? null, user_agent: req?.headers.get("user-agent")?.slice(0, 200) ?? null });
  } catch { /* log gagal tidak boleh mengganggu absen */ }
}

async function authenticate(db: Db, req: Request) {
  const token = bearer(req);
  if (!token) return null;
  const { data: session } = await db
    .from("yumi_sessions").select("user_source_id").eq("token", token)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!session?.user_source_id) return null;
  const { data: user } = await db
    .from("yumi_users")
    .select("source_id,name,is_active,role_source_id,home_pin_hash,home_pin_fingerprint,face_descriptor,raw")
    .eq("source_id", session.user_source_id).maybeSingle();
  if (!user || user.is_active === false) return null;
  return user;
}

async function siteSettings(db: Db) {
  const { data } = await db.schema("pos").from("site_settings").select("raw").limit(1).maybeSingle();
  return (data?.raw ?? {}) as Record<string, unknown>;
}

function geofence(raw: Record<string, unknown>, loc: Loc) {
  const lat = Number(raw.attendanceLat), lng = Number(raw.attendanceLng);
  const radius = Number(raw.attendanceRadius) || DEFAULT_RADIUS_M;
  const configured = Number.isFinite(lat) && Number.isFinite(lng);
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    return { state: "unknown" as const, radius, configured };
  }
  if (!configured) return { state: "ok" as const, radius, configured, distance: null as number | null };
  const distance = Math.round(distanceM(loc.lat, loc.lng, lat, lng));
  const accuracy = Math.round(loc.accuracy ?? 0);
  // GPS di dalam gedung sering kurang akurat. Toleransi: sebagian dari galat yang dilaporkan perangkat (maks 60 m).
  // Galat sangat besar (> 250 m) tetap ditolak karena posisi tidak bisa dipercaya.
  if (accuracy > MAX_ACCURACY_M) return { state: "inaccurate" as const, radius, configured, distance, accuracy };
  const tolerance = Math.min(accuracy, 60);
  return { state: distance <= radius + tolerance ? ("ok" as const) : ("far" as const), radius, configured, distance, accuracy };
}

async function todaySchedule(db: Db, userId: string) {
  const today = wibDate();
  const monthStart = today.slice(0, 8) + "01";
  const { data } = await db.schema("pos").from("attendance_schedules")
    .select("date,shift_name,start_time,end_time,status")
    .eq("user_id", userId).gte("date", monthStart).lte("date", today);
  const rows = data ?? [];
  const isOff = (r: { shift_name?: string; status?: string }) => /off|libur/i.test(r.shift_name ?? "") || r.status === "off";
  const todays = rows.filter((r) => r.date === today && !isOff(r));
  return { usesSchedule: rows.length > 0, shift: todays[0] ?? null, hasOffToday: rows.some((r) => r.date === today && isOff(r)) };
}

async function attendanceState(db: Db, userId: string) {
  const w = wibNow();
  const start = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - WIB;
  const { data } = await db.from("pos_attendance_logs").select("type,timestamp")
    .eq("userId", userId).gte("timestamp", start).lt("timestamp", start + 86400_000)
    .order("timestamp", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

async function pinLocked(db: Db, userId: string) {
  const since = new Date(Date.now() - PIN_LOCK_MIN * 60_000).toISOString();
  const { data } = await db.from("attendance_verify_attempts").select("ok,created_at")
    .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(PIN_MAX_FAILS);
  const rows = data ?? [];
  return rows.length >= PIN_MAX_FAILS && rows.every((r) => r.ok === false);
}

async function verifyIdentity(db: Db, user: Record<string, any>, method: string, pin: string, face: number[]) {
  if (method === "face") {
    const stored: number[] = Array.isArray(user.face_descriptor) && user.face_descriptor.length
      ? user.face_descriptor
      : (Array.isArray(user.raw?.faceDescriptor) ? user.raw.faceDescriptor.filter((v: unknown) => typeof v === "number") : []);
    if (!stored.length) return { ok: false, code: "FACE_NOT_ENROLLED", message: "Wajah belum terdaftar. Pakai PIN atau daftarkan wajah di Profil." };
    const ok = euclid(face, stored) <= FACE_THRESHOLD;
    return ok ? { ok: true } : { ok: false, code: "FACE_MISMATCH", message: "Wajah tidak cocok. Coba lagi atau pakai PIN." };
  }
  if (!/^\d{6}$/.test(pin)) return { ok: false, code: "PIN_INVALID", message: "PIN harus 6 digit." };
  const ok = user.home_pin_hash
    ? await bcrypt.compare(pin, user.home_pin_hash)
    : user.home_pin_fingerprint ? (await sha256Hex(pin)) === user.home_pin_fingerprint : false;
  return ok ? { ok: true } : { ok: false, code: "PIN_WRONG", message: "PIN salah." };
}

function lateness(shift: { start_time: string | null } | null) {
  if (!shift?.start_time) return 0;
  const now = wibNow();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  return Math.max(0, cur - minutesOfDay(shift.start_time.slice(0, 5)));
}

function windowState(shift: { start_time: string | null } | null) {
  if (!shift?.start_time) return "open" as const;
  const now = wibNow();
  const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
  return cur < minutesOfDay(shift.start_time.slice(0, 5)) - WINDOW_OPEN_MIN ? ("early" as const) : ("open" as const);
}

async function checks(db: Db, user: Record<string, any>, loc: Loc) {
  const userId = String(user.source_id);
  const [raw, sched, last] = await Promise.all([siteSettings(db), todaySchedule(db, userId), attendanceState(db, userId)]);
  const geo = geofence(raw, loc);
  const isIn = last?.type === "check_in";
  const done = last?.type === "check_out";
  const shift = sched.shift;
  const win = windowState(shift);
  const lateMin = lateness(shift);
  const noSchedule = sched.usesSchedule && !shift;
  const face = (Array.isArray(user.face_descriptor) && user.face_descriptor.length > 0) ||
    (Array.isArray(user.raw?.faceDescriptor) && user.raw.faceDescriptor.length > 0);
  return {
    geo, isIn, done, shift, win, lateMin, noSchedule, hasOffToday: sched.hasOffToday, hasFace: face,
    lateTolerance: LATE_TOLERANCE_MIN,
    needsLateReason: lateMin > LATE_TOLERANCE_MIN,
    lockedPin: await pinLocked(db, userId),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return fail("CONFIG_ERROR", "Supabase belum dikonfigurasi", 500);
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const user = await authenticate(db, req);
    if (!user) return fail("UNAUTHORIZED", "Sesi berakhir. Masuk lagi.", 401);
    const userId = String(user.source_id);

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const rej = async (code: string, message: string, status = 400, extra: Record<string, unknown> = {}) => { await logEvent(db, userId, String(body.action ?? "clock_in"), code, message, req); return fail(code, message, status, extra); };
    const loc: Loc = body.location && Number.isFinite(Number(body.location.lat))
      ? { lat: Number(body.location.lat), lng: Number(body.location.lng), accuracy: Number(body.location.accuracy) || 0 }
      : null;

    if (body.action === "report") {
      await logEvent(db, userId, String(body.stage ?? "client").slice(0, 30), String(body.code ?? "unknown").slice(0, 60), String(body.detail ?? ""), req);
      return json({ success: true });
    }

    if (body.action === "preflight") {
      const c = await checks(db, user, loc);
      return json({ success: true, ...c });
    }

    if (body.action === "clockIn") {
      const c = await checks(db, user, loc);
      if (c.isIn) return await rej("ALREADY_IN", "Kamu sudah absen masuk. Selesaikan closing untuk absen keluar.");
      if (c.geo.state === "unknown") return await rej("LOCATION_REQUIRED", "Lokasi tidak tersedia. Aktifkan GPS lalu coba lagi.");
      if (c.geo.state === "inaccurate") return await rej("LOCATION_INACCURATE", "Sinyal GPS kurang akurat. Pindah ke area terbuka lalu coba lagi.", 400, { geo: c.geo });
      if (c.geo.state === "far") return await rej("OUTSIDE_RADIUS", `Kamu ${c.geo.distance} m dari toko (batas ${c.geo.radius} m).`, 403, { geo: c.geo });
      if (c.noSchedule) return await rej("NO_SCHEDULE", "Tidak ada jadwal untukmu hari ini. Hubungi supervisor.", 403);
      if (c.win === "early") return await rej("TOO_EARLY", `Absen dibuka ${WINDOW_OPEN_MIN} menit sebelum shift mulai.`, 403);

      const lateReason = String(body.lateReason ?? "").trim().slice(0, 300);
      if (c.needsLateReason && !lateReason) return await rej("LATE_REASON_REQUIRED", `Kamu terlambat ${c.lateMin} menit. Pilih alasan.`);

      const method = body.method === "face" ? "face" : "pin";
      if (method === "pin" && c.lockedPin) return await rej("PIN_LOCKED", `PIN terkunci ${PIN_LOCK_MIN} menit karena terlalu banyak salah.`, 429);
      const verdict = await verifyIdentity(db, user, method, String(body.pin ?? ""), Array.isArray(body.faceDescriptor) ? body.faceDescriptor.map(Number) : []);
      await db.from("attendance_verify_attempts").insert({ user_id: userId, ok: verdict.ok, method });
      if (!verdict.ok) return await rej((verdict as any).code, (verdict as any).message, 403);

      const ts = Date.now();
      const { data: role } = await db.from("yumi_roles").select("name").eq("source_id", user.role_source_id).maybeSingle();
      const penalty = await computeLatePenalty(db, userId, c.shift?.start_time, c.shift?.end_time, ts);

      // Foto selfie dari verifikasi wajah (opsional): disimpan dan ikut ke laporan grup.
      let photo: { bytes: Uint8Array; contentType: string } | null = null;
      let photoUrl: string | null = null;
      if (typeof body.photo === "string" && /^data:image\/jpe?g;base64,/.test(body.photo) && body.photo.length < 700_000) {
        try {
          const bin = atob(body.photo.split(",")[1]);
          const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
          photo = { bytes, contentType: "image/jpeg" };
          photoUrl = await uploadAttendancePhoto(db, userId, ts, bytes, "image/jpeg");
        } catch { photo = null; }
      }

      const note = [
        "Absen via app Karyawan",
        `metode: ${method}`,
        loc ? `lokasi: ${loc.lat},${loc.lng} (±${Math.round(loc.accuracy ?? 0)}m${c.geo.distance != null ? `, ${c.geo.distance}m dari toko` : ""})` : "",
        !penalty.onTime ? `terlambat ${penalty.lateMinutes}m${lateReason ? `: ${lateReason}` : ""}${penalty.penaltyAmount ? ` | denda Rp${penalty.penaltyAmount}` : ""}` : "",
        photoUrl ? `foto: ${photoUrl}` : "",
      ].filter(Boolean).join(" | ");
      const doc: Record<string, unknown> = { userId, type: "check_in", timestamp: ts, source: "karyawan_app", notes: note, lateMinutes: penalty.lateMinutes, penaltyAmount: penalty.penaltyAmount };
      if (photoUrl) doc.photoUrl = photoUrl;
      if (c.shift?.shift_name) doc.shiftName = c.shift.shift_name;
      if (role?.name) doc.roleName = role.name;
      const rnd = Array.from({ length: 20 }, () => "abcdef0123456789"[Math.floor(Math.random() * 16)]).join("");
      const { error } = await db.schema("legacy_mirror").from("documents").insert({
        table_name: "attendance", document_id: `att_app_${rnd}`, creation_time: ts, document: doc,
      });
      if (error) {
        console.error("[staff-attendance] write error", error);
        return await rej("DB_ERROR", "Gagal mencatat absen. Coba lagi.", 500);
      }

      // Laporan ke grup [Report] Djiwa Tentram, format sama dengan bot HRD. Kegagalan Telegram tidak membatalkan absen.
      const shiftLine = c.shift ? `${c.shift.shift_name}${c.shift.start_time ? ` (${c.shift.start_time.slice(0, 5)} - ${(c.shift.end_time ?? "").slice(0, 5)})` : ""}` : "";
      const reported = await sendAttendanceReport({
        type: "check_in", atMs: ts, name: String(user.name ?? ""), roleName: role?.name, shiftLine, penalty, photo,
        extraLines: [`📱 Via app Karyawan · ${method === "face" ? "wajah" : "PIN"}${c.geo.distance != null ? ` · ${c.geo.distance} m dari toko` : ""}`, ...(penalty.onTime || !lateReason ? [] : [`📝 Alasan: ${lateReason}`])],
      });
      return json({
        success: true,
        log: { timestamp: ts, shiftName: c.shift?.shift_name ?? "", method, distance: c.geo.distance, lateMin: penalty.lateMinutes, onTime: penalty.onTime, penaltyAmount: penalty.penaltyAmount, reported },
      });
    }

    if (body.action === "enrollFace") {
      const desc: number[] = Array.isArray(body.faceDescriptor) ? body.faceDescriptor.map(Number) : [];
      if (desc.length !== 128 || desc.some((v) => !Number.isFinite(v))) return await rej("FACE_INVALID", "Data wajah tidak valid. Ulangi pemindaian.");
      // Pendaftaran wajah wajib konfirmasi PIN, supaya sesi yang dibajak tidak bisa mengganti wajah.
      if (await pinLocked(db, userId)) return await rej("PIN_LOCKED", `PIN terkunci ${PIN_LOCK_MIN} menit karena terlalu banyak salah.`, 429);
      const verdict = await verifyIdentity(db, user, "pin", String(body.pin ?? ""), []);
      await db.from("attendance_verify_attempts").insert({ user_id: userId, ok: verdict.ok, method: "enroll" });
      if (!verdict.ok) return await rej((verdict as any).code, (verdict as any).message, 403);
      const raw = { ...(user.raw && typeof user.raw === "object" ? user.raw : {}), faceDescriptor: desc };
      const { error } = await db.from("yumi_users").update({ face_descriptor: desc, raw }).eq("source_id", userId);
      if (error) return await rej("DB_ERROR", "Gagal menyimpan wajah. Coba lagi.", 500);
      return json({ success: true });
    }

    return fail("UNKNOWN_ACTION", "Aksi tidak dikenali", 404);
  } catch (e) {
    console.error("[staff-attendance]", e);
    return fail("INTERNAL_ERROR", "Terjadi kesalahan. Coba lagi.", 500);
  }
});
