import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Tukar shift antar karyawan, otomatis menurut jadwal masing-masing:
 *   requestSwap → rekan menerima notifikasi (app + Telegram)
 *   respondSwap → rekan terima: kedua jadwal langsung bertukar (tanpa supervisor); tolak: selesai
 *   cancelSwap  → pemohon membatalkan selama belum dijawab
 * Identitas dari token sesi (`yumi_sessions`).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const WIB = 7 * 3600_000;
const APP_URL = "https://karyawan.djiwatentram.web.id";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code: string, message: string, status = 400) => json({ success: false, error: { code, message } }, status);
type Db = ReturnType<typeof createClient>;

const isOff = (r: { shift_name?: string | null; status?: string | null }) => /off|libur/i.test(r.shift_name ?? "") || r.status === "off";
const label = (r: { shift_name: string; start_time: string | null; end_time: string | null; status?: string | null }) =>
  isOff(r) ? "Libur" : `${r.shift_name}${r.start_time ? ` ${r.start_time.slice(0, 5)}–${(r.end_time ?? "").slice(0, 5)}` : ""}`;
const dateId = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });

async function tg(chat: string | number, text: string, button = true) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true, ...(button ? { reply_markup: { inline_keyboard: [[{ text: "📱 Buka Aplikasi Karyawan", url: `${APP_URL}` }]] } } : {}) }),
    });
    return r.ok;
  } catch { return false; }
}
async function dm(db: Db, userId: string, text: string) {
  const { data } = await db.from("employee_telegram_links").select("telegram_user_id,is_active").eq("employee_user_id", userId).maybeSingle();
  if (data && data.is_active !== false) await tg(Number(data.telegram_user_id), text);
}
const group = (text: string) => tg(Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ?? "", text, false);

async function authenticate(db: Db, req: Request) {
  const t = (req.headers.get("authorization") ?? "").replace(/^bearer /i, "").trim();
  if (!t) return null;
  const { data: s } = await db.from("yumi_sessions").select("user_source_id").eq("token", t).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!s?.user_source_id) return null;
  const { data: u } = await db.from("yumi_users").select("source_id,name,is_active").eq("source_id", s.user_source_id).maybeSingle();
  return u && u.is_active !== false ? u : null;
}

async function rowsFor(db: Db, date: string, a: string, b: string) {
  const { data } = await db.schema("pos").from("attendance_schedules").select("user_id,shift_name,start_time,end_time,status").eq("date", date).in("user_id", [a, b]);
  const rows = data ?? [];
  return { ra: rows.find((r) => r.user_id === a), rb: rows.find((r) => r.user_id === b) };
}

async function checkedInToday(db: Db, date: string, ids: string[]) {
  const start = Date.parse(`${date}T00:00:00+07:00`);
  const { data } = await db.from("pos_attendance_logs").select("userId").in("userId", ids).gte("timestamp", start).lt("timestamp", start + 86400_000);
  return new Set((data ?? []).map((d) => String(d.userId)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "", key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const me = await authenticate(db, req);
    if (!me) return fail("UNAUTHORIZED", "Sesi berakhir. Masuk lagi.", 401);
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const today = new Date(Date.now() + WIB).toISOString().slice(0, 10);
    const reqs = db.from("attendance_leave_requests");

    if (body.action === "requestSwap") {
      const date = String(body.date ?? ""), partnerId = String(body.partnerId ?? ""), reason = String(body.reason ?? "").trim().slice(0, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) return fail("DATE_INVALID", "Pilih tanggal hari ini atau setelahnya.");
      if (!partnerId || partnerId === me.source_id) return fail("PARTNER_INVALID", "Pilih rekan untuk tukar shift.");
      if (!reason) return fail("REASON_REQUIRED", "Tulis alasan singkat.");
      const { data: partner } = await db.from("yumi_users").select("source_id,name,is_active").eq("source_id", partnerId).maybeSingle();
      if (!partner || partner.is_active === false) return fail("PARTNER_INVALID", "Rekan tidak aktif.");
      const { ra, rb } = await rowsFor(db, date, me.source_id, partnerId);
      if (!ra || !rb) return fail("NO_SCHEDULE", "Salah satu dari kalian belum punya jadwal di tanggal itu.");
      if (isOff(ra) && isOff(rb)) return fail("BOTH_OFF", "Kalian berdua libur di tanggal itu.");
      if (ra.shift_name === rb.shift_name && ra.start_time === rb.start_time && ra.end_time === rb.end_time) return fail("SAME_SHIFT", "Shift kalian sama, tidak perlu ditukar.");
      const present = await checkedInToday(db, date, [me.source_id, partnerId]);
      if (present.size) return fail("ALREADY_IN", "Salah satu sudah absen masuk di tanggal itu, shift tidak bisa ditukar lagi.");
      const { data: pending } = await reqs.select("id,user_id,metadata").eq("leave_type", "tukar_shift").eq("status", "pending").eq("start_date", date);
      if ((pending ?? []).some((p: any) => [p.user_id, p.metadata?.partner_id].some((x) => x === me.source_id || x === partnerId))) {
        return fail("PENDING_EXISTS", "Sudah ada permintaan tukar shift yang menunggu untuk salah satu dari kalian di tanggal itu.");
      }
      const { data: created, error } = await reqs.insert({
        user_id: me.source_id, user_name: me.name, leave_type: "tukar_shift", start_date: date, end_date: date, reason, status: "pending",
        metadata: { partner_id: partnerId, partner_name: partner.name, my_shift: label(ra), partner_shift: label(rb), stage: "waiting_partner" },
      }).select("id").single();
      if (error || !created) { console.error(error); return fail("DB_ERROR", "Gagal membuat permintaan.", 500); }
      await dm(db, partnerId, `🔁 Permintaan tukar shift dari ${me.name}\n📅 ${dateId(date)}\nShiftmu: ${label(rb)} → jadi ${label(ra)}\nShift ${me.name.split(" ")[0]}: ${label(ra)} → jadi ${label(rb)}\n📝 ${reason}\n\nBuka aplikasi Karyawan → Izin & cuti untuk Terima atau Tolak. Bila diterima, jadwal langsung bertukar otomatis.`);
      return json({ success: true, id: created.id });
    }

    if (body.action === "respondSwap") {
      const { data: r } = await reqs.select("*").eq("id", String(body.requestId ?? "")).maybeSingle();
      if (!r || r.leave_type !== "tukar_shift") return fail("NOT_FOUND", "Permintaan tidak ditemukan.", 404);
      if (r.metadata?.partner_id !== me.source_id) return fail("FORBIDDEN", "Permintaan ini bukan untukmu.", 403);
      if (r.status !== "pending") return fail("ALREADY_DONE", "Permintaan ini sudah diproses.", 409);
      const date = String(r.start_date);
      if (body.accept !== true) {
        await reqs.update({ status: "rejected", reviewed_by: me.source_id, review_notes: "Ditolak oleh rekan", metadata: { ...r.metadata, stage: "declined" } }).eq("id", r.id);
        await dm(db, r.user_id, `❌ ${me.name} menolak tukar shift ${dateId(date)}. Jadwalmu tidak berubah.`);
        return json({ success: true, status: "rejected" });
      }
      if (date < today) return fail("DATE_PAST", "Tanggal shift sudah lewat.");
      const { ra, rb } = await rowsFor(db, date, r.user_id, me.source_id);
      if (!ra || !rb) return fail("NO_SCHEDULE", "Jadwal salah satu dari kalian sudah berubah. Minta pengajuan ulang.");
      const present = await checkedInToday(db, date, [r.user_id, me.source_id]);
      if (present.size) return fail("ALREADY_IN", "Salah satu sudah absen masuk di tanggal itu, shift tidak bisa ditukar lagi.");
      const { data: ok, error } = await db.schema("pos").rpc("swap_schedules", { p_user_a: r.user_id, p_user_b: me.source_id, p_date: date });
      if (error || !ok) { console.error(error); return fail("SWAP_FAILED", "Gagal menukar jadwal. Coba lagi.", 500); }
      await reqs.update({ status: "approved", reviewed_by: me.source_id, review_notes: "Disetujui rekan — jadwal bertukar otomatis", metadata: { ...r.metadata, swapped: true, swappedBy: "partner", stage: "done" } }).eq("id", r.id);
      const msgReq = `✅ ${me.name} menerima tukar shift ${dateId(date)}.\nJadwalmu sekarang: ${label(rb)}`;
      await dm(db, r.user_id, msgReq);
      await dm(db, me.source_id, `✅ Tukar shift ${dateId(date)} selesai.\nJadwalmu sekarang: ${label(ra)}`);
      await group(`🔁 Tukar Shift — ${dateId(date)}\n👤 ${r.user_name}: ${label(ra)} → ${label(rb)}\n👤 ${me.name}: ${label(rb)} → ${label(ra)}\n✅ Disetujui rekan, jadwal sudah bertukar otomatis.`);
      return json({ success: true, status: "approved", yourNewShift: label(ra) });
    }

    if (body.action === "cancelSwap") {
      const { data: r } = await reqs.select("id,user_id,status,leave_type").eq("id", String(body.requestId ?? "")).maybeSingle();
      if (!r || r.leave_type !== "tukar_shift" || r.user_id !== me.source_id) return fail("NOT_FOUND", "Permintaan tidak ditemukan.", 404);
      if (r.status !== "pending") return fail("ALREADY_DONE", "Permintaan ini sudah diproses.", 409);
      await reqs.update({ status: "cancelled", reviewed_by: me.source_id, review_notes: "Dibatalkan pemohon" }).eq("id", r.id);
      return json({ success: true });
    }

    return fail("UNKNOWN_ACTION", "Aksi tidak dikenali", 404);
  } catch (e) {
    console.error("[staff-schedule]", e);
    return fail("INTERNAL_ERROR", "Terjadi kesalahan. Coba lagi.", 500);
  }
});
