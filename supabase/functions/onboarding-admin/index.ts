// =============================================================================
// Edge Function: onboarding-admin
// Handles admin operations on employee_onboarding_applications using
// service_role key to bypass RLS. This is needed because the app uses
// Better Auth (not Supabase Auth), so the admin frontend also uses the
// anon key and cannot be distinguished from public users at the RLS level.
//
// Authentication: x-admin-secret header matching ONBOARDING_ADMIN_SECRET
// env var on the Supabase Edge Function. Set it via:
//   supabase secrets set ONBOARDING_ADMIN_SECRET=your-secret-here
//
// The frontend sends VITE_ADMIN_SECRET from .env as this header.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_SECRET = Deno.env.get("ONBOARDING_ADMIN_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!ADMIN_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables: ONBOARDING_ADMIN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

// ── CORS headers ──────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-admin-secret, content-type, apikey",
  "Access-Control-Max-Age": "86400",
};

function corsResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

serve(async (req) => {
  // ── CORS preflight ───────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return corsResponse({ ok: true });
  }

  // ── Auth check ──────────────────────────────────────────────
  const authHeader = req.headers.get("x-admin-secret");
  if (authHeader !== ADMIN_SECRET) {
    return corsResponse({ error: "Unauthorized: invalid or missing admin secret" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { action, ...payload } = body;

    switch (action) {
      case "list":
        return await handleList(supabase, payload);
      case "approve":
        return await handleApprove(supabase, payload);
      case "reject":
        return await handleStatusUpdate(supabase, payload, "rejected");
      case "mark_revision":
        return await handleStatusUpdate(supabase, payload, "needs_revision");
      case "sign_contract":
        return await handleSignContract(supabase, payload);
      case "delete":
        return await handleDelete(supabase, payload);
      case "set_status":
        return await handleSetStatus(supabase, payload);
      case "bulk_delete":
        return await handleBulkDelete(supabase, payload);
      default:
        return corsResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal server error";
    console.error("[onboarding-admin] Error:", message);
    return corsResponse({ error: message }, 500);
  }
});

// ── Response helper ───────────────────────────────────────────
function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── 1. List applications ──────────────────────────────────────
async function handleList(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from("employee_onboarding_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[onboarding-admin] list error:", error);
    return corsResponse({ error: error.message }, 500);
  }

  return corsResponse({ data });
}

// ── 2. Approve application ────────────────────────────────────
async function handleApprove(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const startTs = Date.now();
  console.log("[onboarding-admin] handleApprove called, applicationId:", payload.applicationId);
  const {
    applicationId,
    username,
    password,
    name,
    roleId,
    homePin,
    requiresPinChange,
    slug,
    receiveReportEmails,
    onboardingApplicationId,
    reviewNotes,
    authUserId,
  } = payload as Record<string, unknown>;

  if (!applicationId || !username || !name || !roleId) {
    const missing = [];
    if (!applicationId) missing.push("applicationId");
    if (!username) missing.push("username");
    if (!name) missing.push("name");
    if (!roleId) missing.push("roleId");
    return corsResponse(
      { error: `Data tidak lengkap: ${missing.join(", ")} wajib`, debug: { applicationId, username, name, roleId } },
      400
    );
  }

  // Check if already approved
  const { data: app, error: appError } = await supabase
    .from("employee_onboarding_applications")
    .select("id, status, approved_user_source_id")
    .eq("id", String(applicationId))
    .maybeSingle();

  if (appError) {
    console.error("[onboarding-admin] approve fetch error:", JSON.stringify(appError));
    return corsResponse({ error: `Query error: ${appError.message}`, detail: JSON.stringify(appError) }, 500);
  }
  if (!app) return corsResponse({ error: `Pendaftaran tidak ditemukan (${applicationId})` }, 404);
  if (app.status === "approved" || app.approved_user_source_id) {
    return corsResponse({ error: "Pendaftaran ini sudah disetujui" }, 409);
  }

  // Generate source ID for new user
  const sourceId = `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  // Hash home PIN if provided
  let homePinFingerprint: string | null = null;
  let finalPin = homePin && typeof homePin === "string" && /^\d{6}$/.test(homePin) ? homePin : null;
  if (finalPin) {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(finalPin)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    homePinFingerprint = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Build raw JSON for user
  const raw: Record<string, unknown> = {
    ...(payload.raw as Record<string, unknown> ?? {}),
    password,
    requiresPinChange: Boolean(requiresPinChange),
    onboardingApplicationId,
  };

  // Create user using direct fetch — retry if PIN fingerprint collides
  let insertErrBody = "";
  let userCreated = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const insertPayload = {
      source_id: sourceId,
      username: String(username).toLowerCase().trim(),
      name: String(name).trim(),
      role_source_id: String(roleId),
      is_active: true,
      receive_report_emails: Boolean(receiveReportEmails ?? false) as boolean,
      auth_user_id: authUserId ? String(authUserId) : null,
      slug: slug && String(slug).trim() !== "" ? String(slug).trim() : String(username).toLowerCase().split("@")[0],
      home_pin_fingerprint: homePinFingerprint,
      raw,
    };
    console.log("[onboarding-admin] insertPayload (attempt", attempt, "):", JSON.stringify(insertPayload));
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/yumi_users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(insertPayload),
    });
    if (insertRes.ok) {
      userCreated = true;
      break;
    }
    insertErrBody = await insertRes.text();
    // Check if duplicate key on fingerprint — retry with new PIN
    if (insertErrBody.includes("idx_yumi_users_home_pin_fingerprint") || insertErrBody.includes("home_pin_fingerprint")) {
      finalPin = String(Math.floor(100000 + Math.random() * 900000));
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(finalPin)
      );
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      homePinFingerprint = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      console.log("[onboarding-admin] PIN collision, retrying with new PIN:", finalPin);
      continue;
    }
    // Other error — stop retrying
    break;
  }

  if (!userCreated) {
    console.error("[onboarding-admin] createUser error after retries:", insertErrBody);
    return corsResponse({ error: `Gagal buat user: ${insertErrBody}` }, 500);
  }

  const now = "2026-05-14T00:00:00Z";

  // Update employment startDate to today
  const approvalStartDate = "2026-05-14";
  const employment = {
    ...((payload.employment as Record<string, unknown>) ?? {}),
    startDate: approvalStartDate,
  };

  // Update application: approve + link user (direct fetch)
  const updatePayload = {
    status: "approved",
    approved_user_source_id: sourceId,
    employment,
    review_notes: reviewNotes ? String(reviewNotes) : null,
    reviewed_by: payload.reviewed_by ? String(payload.reviewed_by) : "admin",
    reviewed_at: now,
    raw: { ...((app.raw as Record<string, unknown>) ?? {}), pipelineStep: "approved" },
  };
  const updateAppRes = await fetch(`${SUPABASE_URL}/rest/v1/employee_onboarding_applications?id=eq.${applicationId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(updatePayload),
  });
  if (!updateAppRes.ok) {
    const updateErrBody = await updateAppRes.text();
    console.error("[onboarding-admin] updateApp error:", updateErrBody);
    return corsResponse({ error: `Gagal update aplikasi: ${updateErrBody}` }, 500);
  }

  // ── Telegram notification ──
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const telegramChatId = Deno.env.get("TELEGRAM_REPORT_CHAT_ID") ?? "";
  if (telegramBotToken && telegramChatId) {
    try {
      const appData = await supabase
        .from("employee_onboarding_applications")
        .select("raw, phone, full_name, employment")
        .eq("id", String(applicationId))
        .maybeSingle();
      const regNumber = (appData.data?.raw as any)?.registrationNumber ?? "";
      const msg = [
        `✅ *Pendaftaran Disetujui*`,
        `Nama: ${name}`,
        `Role: ${String((payload.employment as any)?.roleName ?? "-")}`,
        `Username: \`${username}\``,
        regNumber ? `Registrasi: \`${regNumber}\`` : "",
        `Link: /register/selesai/${regNumber}`,
      ].filter(Boolean).join("\n");
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: parseInt(telegramChatId, 10), text: msg, parse_mode: "Markdown" }),
      });
    } catch (_e) {
      console.warn("[onboarding-admin] Telegram notification failed:", _e);
    }
  }

  return corsResponse({
    success: true,
    sourceId,
    message: "Pendaftaran disetujui & user dibuat",
  });
}

// ── 3. Reject / mark needs_revision ───────────────────────────
async function handleStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  status: "rejected" | "needs_revision"
) {
  const { id, reviewNotes, reviewedBy } = payload as Record<string, unknown>;

  if (!id) {
    return corsResponse({ error: "id wajib diisi" }, 400);
  }

  const { error } = await supabase
    .from("employee_onboarding_applications")
    .update({
      status,
      review_notes: reviewNotes ? String(reviewNotes) : null,
      reviewed_by: reviewedBy ? String(reviewedBy) : "admin",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", String(id));

  if (error) {
    console.error(`[onboarding-admin] update ${status} error:`, error);
    return corsResponse({ error: error.message }, 500);
  }

  return corsResponse({ success: true, message: `Status diubah ke ${status}` });
}

// ── 4. Delete single application ──────────────────────────────
async function handleDelete(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { id } = payload as Record<string, unknown>;

  if (!id) {
    return corsResponse({ error: "id wajib diisi" }, 400);
  }

  // Don't allow deleting approved applications
  const { data: app, error: checkError } = await supabase
    .from("employee_onboarding_applications")
    .select("status, approved_user_source_id")
    .eq("id", String(id))
    .maybeSingle();

  if (checkError) return corsResponse({ error: checkError.message }, 500);
  if (!app) return corsResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  if (app.status === "approved" && app.approved_user_source_id) {
    return corsResponse({ error: "Tidak bisa menghapus pendaftaran yang sudah disetujui" }, 403);
  }

  const { error } = await supabase
    .from("employee_onboarding_applications")
    .delete()
    .eq("id", String(id));

  if (error) {
    console.error("[onboarding-admin] delete error:", error);
    return corsResponse({ error: error.message }, 500);
  }

  return corsResponse({ success: true, message: "Pendaftaran dihapus" });
}

// ── 6. Sign contract ──────────────────────────────────────
async function handleSignContract(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { applicationId, signatureUrl, contractPdfUrl, contractText } = payload as Record<string, unknown>;

  if (!applicationId || !signatureUrl || !contractPdfUrl || !contractText) {
    return corsResponse(
      { error: "Data tidak lengkap: applicationId, signatureUrl, contractPdfUrl, contractText wajib" },
      400
    );
  }

  // Get current application data
  const { data: app, error: appError } = await supabase
    .from("employee_onboarding_applications")
    .select("*")
    .eq("id", String(applicationId))
    .maybeSingle();

  if (appError) return corsResponse({ error: appError.message }, 500);
  if (!app) return corsResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  if (app.status !== "approved") {
    return corsResponse({ error: "Pendaftaran harus disetujui terlebih dahulu" }, 409);
  }

  // Update application with signed contract
  const raw = { ...((app.raw as Record<string, unknown>) ?? {}), pipelineStep: "contract_signed" };
  const { error: updateError } = await supabase
    .from("employee_onboarding_applications")
    .update({
      contract_pdf_url: String(contractPdfUrl),
      signature_url: String(signatureUrl),
      raw,
      contract: { ...((app.contract as Record<string, unknown>) ?? {}), plainText: String(contractText) },
    })
    .eq("id", String(applicationId));

  if (updateError) {
    console.error("[onboarding-admin] sign_contract update error:", updateError);
    return corsResponse({ error: updateError.message }, 500);
  }

  return corsResponse({
    success: true,
    message: "Kontrak berhasil ditandatangani",
    contractPdfUrl,
    signatureUrl,
  });
}

// ── 5. Set status (lightweight transitions) ────────────────────
async function handleSetStatus(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { id, status } = payload as { id?: string; status?: string };

  // ── Validate input ──
  if (!id || !status) {
    return corsResponse({ error: "Parameter id dan status wajib diisi" }, 400);
  }

  const VALID_TARGETS = ["pending", "rejected", "needs_revision"] as const;
  if (!VALID_TARGETS.includes(status as any)) {
    return corsResponse({
      error: `Status target tidak valid. Gunakan: ${VALID_TARGETS.join(", ")}`,
    }, 400);
  }

  // ── Check current application ──
  const { data: app, error: appError } = await supabase
    .from("employee_onboarding_applications")
    .select("id, status")
    .eq("id", String(id))
    .maybeSingle();

  if (appError) {
    console.error("[onboarding-admin] set_status fetch error:", appError);
    return corsResponse({ error: appError.message }, 500);
  }
  if (!app) {
    return corsResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  }

  // ── Validate transition ──
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending:         ["rejected", "needs_revision"],
    rejected:        ["pending"],
    needs_revision:  ["pending", "rejected"],
    approved:        ["pending", "rejected"],
    contract_signed: [],
  };

  const allowed = VALID_TRANSITIONS[app.status] ?? [];
  if (!allowed.includes(status)) {
    return corsResponse({
      error: `Transisi tidak valid: ${app.status} → ${status}. Transisi yang diizinkan: ${allowed.join(", ") || "tidak ada"}`,
    }, 400);
  }

  // Approved → pending/rejected only allowed if not yet signed contract
  if (app.status === "approved" && (status === "pending" || status === "rejected")) {
    const raw = (app.raw as Record<string, unknown>) ?? {};
    if (raw.pipelineStep === "contract_signed") {
      return corsResponse({
        error: "Tidak bisa mengubah status: karyawan sudah menandatangani kontrak",
      }, 409);
    }
  }

  // ── Execute update ──
  const updatePayload: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };

  // Only set reviewed_by if transitioning away from pending (a review decision)
  if (app.status === "pending" && (status === "rejected" || status === "needs_revision")) {
    updatePayload.reviewed_by = payload.reviewedBy ?? "admin";
  }

  const { error: updateError } = await supabase
    .from("employee_onboarding_applications")
    .update(updatePayload)
    .eq("id", String(id));

  if (updateError) {
    console.error("[onboarding-admin] set_status update error:", updateError);
    return corsResponse({ error: updateError.message }, 500);
  }

  return corsResponse({
    success: true,
    message: `Status diubah ke ${status}`,
  });
}

// ── 6. Bulk delete applications ───────────────────────────────
async function handleBulkDelete(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { ids } = payload as { ids?: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return corsResponse({ error: "ids array wajib diisi" }, 400);
  }

  // Only allow deleting non-approved applications
  const { data: apps, error: checkError } = await supabase
    .from("employee_onboarding_applications")
    .select("id, status, approved_user_source_id")
    .in("id", ids);

  if (checkError) return corsResponse({ error: checkError.message }, 500);

  const approvedIds = (apps ?? [])
    .filter((a: any) => a.status === "approved" && a.approved_user_source_id)
    .map((a: any) => a.id);

  if (approvedIds.length > 0) {
    return corsResponse({
      error: `${approvedIds.length} pendaftaran sudah disetujui dan tidak bisa dihapus`,
      approvedIds,
    }, 403);
  }

  const { error } = await supabase
    .from("employee_onboarding_applications")
    .delete()
    .in("id", ids);

  if (error) {
    console.error("[onboarding-admin] bulk delete error:", error);
    return corsResponse({ error: error.message }, 500);
  }

  return corsResponse({ success: true, message: `${ids.length} pendaftaran dihapus` });
}
