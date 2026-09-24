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
    .select("id,user_id,user_name,leave_type,start_date,end_date,reason,status,reviewed_by,review_notes,created_at,updated_at")
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
    return response({ success: false, error: "Action tidak dikenal" }, 400);
  } catch (error) {
    console.error("[leave-admin] request failed", error instanceof Error ? error.message : error);
    return response({ success: false, error: "Request tidak valid" }, 400);
  }
});
