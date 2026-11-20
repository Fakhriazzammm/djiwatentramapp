import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

type Actor = { id: string; name: string; roleName: string; permissions: string[] };
type LeaveStatus = "approved" | "rejected" | "cancelled";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

async function authenticateAdmin(supabase: ReturnType<typeof createClient>, req: Request): Promise<Actor | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data: session, error: sessionError } = await supabase
    .from("yumi_sessions")
    .select("user_source_id")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session?.user_source_id) return null;

  const { data: user, error: userError } = await supabase
    .from("yumi_users")
    .select("source_id,name,role_source_id,is_active")
    .eq("source_id", session.user_source_id)
    .maybeSingle();
  if (userError || !user || user.is_active === false) return null;

  const { data: role, error: roleError } = await supabase
    .from("yumi_roles")
    .select("name,permissions")
    .eq("source_id", user.role_source_id)
    .maybeSingle();
  if (roleError || !role) return null;

  const permissions = Array.isArray(role.permissions) ? role.permissions.map(String) : [];
  const isAdmin = String(role.name ?? "").trim().toLowerCase() === "admin";
  if (!isAdmin && !permissions.includes("users:manage")) return null;

  return { id: String(user.source_id), name: String(user.name ?? ""), roleName: String(role.name ?? ""), permissions };
}

async function listRequests(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("attendance_leave_requests")
    .select("id,user_id,user_name,leave_type,start_date,end_date,reason,status,reviewed_by,review_notes,created_at,updated_at,metadata")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return response({ success: false, error: "Gagal memuat pengajuan Cuti & Izin" }, 500);
  return response({ success: true, data: data ?? [] });
}

async function updateStatus(supabase: ReturnType<typeof createClient>, actor: Actor, payload: Record<string, unknown>, newStatus: LeaveStatus) {
  const requestId = String(payload.requestId ?? "").trim();
  const reviewNotes = String(payload.reviewNotes ?? "").trim();
  if (!requestId) return response({ success: false, error: "requestId wajib diisi" }, 400);
  if (reviewNotes.length > 2000) return response({ success: false, error: "Catatan review terlalu panjang" }, 400);

  const { data: updated, error: reviewError } = await supabase.rpc("review_attendance_leave_request", {
    p_request_id: requestId,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
    p_actor_role: actor.roleName,
    p_new_status: newStatus,
    p_review_notes: reviewNotes || null,
  });
  if (reviewError) {
    const message = reviewError.message ?? "Gagal memperbarui status pengajuan";
    if (message.includes("already processed")) return response({ success: false, error: "Pengajuan sudah diproses dan tidak dapat diproses ulang" }, 409);
    if (message.includes("not found")) return response({ success: false, error: "Pengajuan tidak ditemukan" }, 404);
    return response({ success: false, error: "Gagal memperbarui status pengajuan" }, 500);
  }

  return response({ success: true, data: updated, audit: { actorId: actor.id, action: newStatus } });
}


// ── Pengganti shift (izin / sakit / cuti) ──────────────────────────────────────────────
const COVER_TYPES = ["cuti", "izin", "sakit", "other"];
const APP_URL = Deno.env.get("KARYAWAN_APP_URL") ?? "https://karyawan.djiwatentram.web.id";
const dateId = (d: string) => new Date(`${d}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
const isOffRow = (r: { shift_name?: string | null; status?: string | null }) => /off|libur/i.test(r.shift_name ?? "") || r.status === "off";
const hhmm = (v?: string | null) => (v ? String(v).slice(0, 5) : "");

async function telegram(supabase: ReturnType<typeof createClient>, userId: string, text: string) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) return;
  const { data } = await supabase.from("employee_telegram_links").select("telegram_user_id,is_active").eq("employee_user_id", userId).maybeSingle();
  if (!data || data.is_active === false) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: Number(data.telegram_user_id), text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [[{ text: "📱 Buka Aplikasi Karyawan", url: APP_URL }]] } }),
    });
  } catch { /* notifikasi tidak boleh menggagalkan penugasan */ }
}

async function loadCoverRequest(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const requestId = String(payload.requestId ?? "").trim();
  if (!requestId) return { error: response({ success: false, error: "requestId wajib diisi" }, 400) };
  const { data: request } = await supabase.from("attendance_leave_requests").select("id,user_id,user_name,leave_type,start_date,end_date,status,metadata").eq("id", requestId).maybeSingle();
  if (!request) return { error: response({ success: false, error: "Pengajuan tidak ditemukan" }, 404) };
  if (!COVER_TYPES.includes(String(request.leave_type))) return { error: response({ success: false, error: "Pengganti hanya untuk cuti, izin, atau sakit" }, 400) };
  if (!["pending", "approved"].includes(String(request.status))) return { error: response({ success: false, error: "Pengajuan sudah ditolak atau dibatalkan" }, 409) };
  return { request };
}

function datesBetween(start: string, end: string) {
  const out: string[] = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last && out.length < 31; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

async function coverPlan(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { request, error } = await loadCoverRequest(supabase, payload);
  if (error) return error;
  const start = String(request!.start_date).slice(0, 10), end = String(request!.end_date).slice(0, 10);
  const { data: rows } = await supabase.schema("pos").from("attendance_schedules").select("date,shift_name,start_time,end_time,status,raw").eq("user_id", request!.user_id).gte("date", start).lte("date", end);
  const byDate = new Map((rows ?? []).map((r: any) => [String(r.date), r]));
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const days = [];
  for (const date of datesBetween(start, end)) {
    const row: any = byDate.get(date);
    if (!row) { days.push({ date, state: "no_schedule" }); continue; }
    if (row.raw?.coveredBy) {
      const { data: cover } = await supabase.from("yumi_users").select("name").eq("source_id", row.raw.coveredBy).maybeSingle();
      days.push({ date, state: "covered", shift: { name: row.raw.originalShift, start: hhmm(row.raw.originalStart), end: hhmm(row.raw.originalEnd) }, coverUserId: row.raw.coveredBy, coverName: cover?.name ?? "Rekan", past: date < today });
      continue;
    }
    if (isOffRow(row)) { days.push({ date, state: "off" }); continue; }
    const { data: candidates } = date < today ? { data: [] } : await supabase.schema("pos").rpc("cover_candidates", { p_absent: request!.user_id, p_date: date });
    days.push({ date, state: "needs", past: date < today, shift: { name: row.shift_name, start: hhmm(row.start_time), end: hhmm(row.end_time) }, candidates: candidates ?? [] });
  }
  return response({ success: true, data: { requestId: request!.id, userName: request!.user_name, leaveType: request!.leave_type, status: request!.status, days } });
}

async function assignCover(supabase: ReturnType<typeof createClient>, actor: Actor, payload: Record<string, unknown>) {
  const { request, error } = await loadCoverRequest(supabase, payload);
  if (error) return error;
  const date = String(payload.date ?? ""), coverId = String(payload.coverUserId ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < String(request!.start_date).slice(0, 10) || date > String(request!.end_date).slice(0, 10)) return response({ success: false, error: "Tanggal di luar rentang pengajuan" }, 400);
  if (!coverId) return response({ success: false, error: "Pilih rekan pengganti" }, 400);
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (date < today) return response({ success: false, error: "Tanggal sudah lewat" }, 400);
  const { data: candidates } = await supabase.schema("pos").rpc("cover_candidates", { p_absent: request!.user_id, p_date: date });
  const chosen = (Array.isArray(candidates) ? candidates : []).find((c: any) => c.userId === coverId);
  if (!chosen) return response({ success: false, error: "Rekan ini tidak tersedia untuk menggantikan di tanggal itu" }, 409);
  const { data: result, error: rpcError } = await supabase.schema("pos").rpc("cover_shift", { p_absent: request!.user_id, p_cover: coverId, p_date: date, p_leave_id: request!.id });
  if (rpcError || !result?.ok) {
    const reason = result?.reason;
    return response({ success: false, error: reason === "absent_not_working" ? "Karyawan ini tidak punya shift kerja di tanggal itu" : reason === "cover_busy" ? "Rekan ini sudah punya shift di tanggal itu" : "Gagal menugaskan pengganti" }, 409);
  }
  const covers = Array.isArray(request!.metadata?.covers) ? request!.metadata.covers.filter((c: any) => c.date !== date) : [];
  covers.push({ date, coverUserId: coverId, coverName: chosen.name, by: actor.id, at: new Date().toISOString() });
  await supabase.from("attendance_leave_requests").update({ metadata: { ...(request!.metadata ?? {}), covers } }).eq("id", request!.id);
  const label = `${result.shift}${result.start ? ` ${hhmm(result.start)}–${hhmm(result.end)}` : ""}`;
  await telegram(supabase, coverId, `🔄 Kamu ditugaskan menggantikan ${request!.user_name}\n📅 ${dateId(date)}\n⏰ ${label}\n\nJadwalmu di tanggal itu sudah diperbarui. Buka aplikasi Karyawan untuk melihatnya.`);
  await telegram(supabase, String(request!.user_id), `✅ ${chosen.name} menggantikan shiftmu ${dateId(date)} (${label}). Cepat sembuh / semoga urusanmu lancar.`);
  return response({ success: true, data: { date, coverUserId: coverId, coverName: chosen.name, shift: label }, audit: { actorId: actor.id, action: "assign_cover" } });
}

async function uncover(supabase: ReturnType<typeof createClient>, actor: Actor, payload: Record<string, unknown>) {
  const { request, error } = await loadCoverRequest(supabase, payload);
  if (error) return error;
  const date = String(payload.date ?? "");
  const { data: result, error: rpcError } = await supabase.schema("pos").rpc("uncover_shift", { p_absent: request!.user_id, p_date: date });
  if (rpcError || !result?.ok) return response({ success: false, error: "Pengganti di tanggal ini tidak ditemukan atau sudah dibatalkan" }, 409);
  const covers = Array.isArray(request!.metadata?.covers) ? request!.metadata.covers.filter((c: any) => c.date !== date) : [];
  await supabase.from("attendance_leave_requests").update({ metadata: { ...(request!.metadata ?? {}), covers } }).eq("id", request!.id);
  await telegram(supabase, String(result.coverUserId), `↩️ Penugasan pengganti ${dateId(date)} dibatalkan. Jadwalmu kembali seperti semula.`);
  return response({ success: true, data: { date }, audit: { actorId: actor.id, action: "uncover" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return response({ ok: true });
  if (req.method !== "POST") return response({ success: false, error: "Method tidak diizinkan" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response({ success: false, error: "Konfigurasi server belum lengkap" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const actor = await authenticateAdmin(supabase, req);
  if (!actor) return response({ success: false, error: "Sesi admin tidak valid atau permission tidak cukup" }, 401);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action === "list") return await listRequests(supabase);
    if (action === "approve" || action === "reject" || action === "cancel") {
      return await updateStatus(supabase, actor, body, action);
    }
    if (action === "coverPlan") return await coverPlan(supabase, body);
    if (action === "assignCover") return await assignCover(supabase, actor, body);
    if (action === "uncover") return await uncover(supabase, actor, body);
    return response({ success: false, error: "Action tidak dikenal" }, 400);
  } catch (error) {
    console.error("[leave-admin] request failed", error instanceof Error ? error.message : error);
    return response({ success: false, error: "Request tidak valid" }, 400);
  }
});
