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

serve(async (req) => {
  // ── Auth check ──────────────────────────────────────────────
  const authHeader = req.headers.get("x-admin-secret");
  if (authHeader !== ADMIN_SECRET) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: invalid or missing admin secret" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
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
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal server error";
    console.error("[onboarding-admin] Error:", message);
    return jsonResponse({ error: message }, 500);
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
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ data });
}

// ── 2. Approve application ────────────────────────────────────
async function handleApprove(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
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
    return jsonResponse(
      { error: "Data tidak lengkap: applicationId, username, name, roleId wajib" },
      400
    );
  }

  // Check if already approved
  const { data: app, error: appError } = await supabase
    .from("employee_onboarding_applications")
    .select("id, status, approved_user_source_id")
    .eq("id", String(applicationId))
    .maybeSingle();

  if (appError) return jsonResponse({ error: appError.message }, 500);
  if (!app) return jsonResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  if (app.status === "approved" || app.approved_user_source_id) {
    return jsonResponse({ error: "Pendaftaran ini sudah disetujui" }, 409);
  }

  // Generate source ID for new user
  const sourceId = `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  // Hash home PIN if provided
  let homePinFingerprint: string | null = null;
  if (homePin && typeof homePin === "string" && /^\d{6}$/.test(homePin)) {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(homePin)
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

  // Create user
  const { error: createUserError } = await supabase.from("yumi_users").insert({
    source_id: sourceId,
    username: String(username).toLowerCase().trim(),
    name: String(name).trim(),
    role_source_id: String(roleId),
    is_active: true,
    receive_report_emails: Boolean(receiveReportEmails ?? false),
    auth_user_id: authUserId ? String(authUserId) : null,
    slug: slug && String(slug).trim() !== "" ? String(slug).trim() : String(username).toLowerCase().split("@")[0],
    home_pin_fingerprint: homePinFingerprint,
    raw,
  });

  if (createUserError) {
    console.error("[onboarding-admin] createUser error:", createUserError);
    return jsonResponse({ error: `Gagal buat user: ${createUserError.message}` }, 500);
  }

  // Update employment startDate to today
  const approvalStartDate = new Date().toISOString().slice(0, 10);
  const employment = {
    ...((payload.employment as Record<string, unknown>) ?? {}),
    startDate: approvalStartDate,
  };

  // Update application: approve + link user
  const { error: updateAppError } = await supabase
    .from("employee_onboarding_applications")
    .update({
      status: "approved",
      approved_user_source_id: sourceId,
      employment,
      review_notes: reviewNotes ? String(reviewNotes) : null,
      reviewed_by: payload.reviewed_by ? String(payload.reviewed_by) : "admin",
      reviewed_at: new Date().toISOString(),
      raw: { ...((app.raw as Record<string, unknown>) ?? {}), pipelineStep: "approved" },
    })
    .eq("id", String(applicationId));

  if (updateAppError) {
    console.error("[onboarding-admin] updateApp error:", updateAppError);
    return jsonResponse({ error: updateAppError.message }, 500);
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

  return jsonResponse({
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
    return jsonResponse({ error: "id wajib diisi" }, 400);
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
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ success: true, message: `Status diubah ke ${status}` });
}

// ── 4. Delete single application ──────────────────────────────
async function handleDelete(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { id } = payload as Record<string, unknown>;

  if (!id) {
    return jsonResponse({ error: "id wajib diisi" }, 400);
  }

  // Don't allow deleting approved applications
  const { data: app, error: checkError } = await supabase
    .from("employee_onboarding_applications")
    .select("status, approved_user_source_id")
    .eq("id", String(id))
    .maybeSingle();

  if (checkError) return jsonResponse({ error: checkError.message }, 500);
  if (!app) return jsonResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  if (app.status === "approved" && app.approved_user_source_id) {
    return jsonResponse({ error: "Tidak bisa menghapus pendaftaran yang sudah disetujui" }, 403);
  }

  const { error } = await supabase
    .from("employee_onboarding_applications")
    .delete()
    .eq("id", String(id));

  if (error) {
    console.error("[onboarding-admin] delete error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ success: true, message: "Pendaftaran dihapus" });
}

// ── 6. Sign contract ──────────────────────────────────────
async function handleSignContract(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  const { applicationId, signatureUrl, contractPdfUrl, contractText } = payload as Record<string, unknown>;

  if (!applicationId || !signatureUrl || !contractPdfUrl || !contractText) {
    return jsonResponse(
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

  if (appError) return jsonResponse({ error: appError.message }, 500);
  if (!app) return jsonResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  if (app.status !== "approved") {
    return jsonResponse({ error: "Pendaftaran harus disetujui terlebih dahulu" }, 409);
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
    return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({
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
    return jsonResponse({ error: "Parameter id dan status wajib diisi" }, 400);
  }

  const VALID_TARGETS = ["pending", "rejected", "needs_revision"] as const;
  if (!VALID_TARGETS.includes(status as any)) {
    return jsonResponse({
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
    return jsonResponse({ error: appError.message }, 500);
  }
  if (!app) {
    return jsonResponse({ error: "Pendaftaran tidak ditemukan" }, 404);
  }

  // ── Validate transition ──
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending:         ["rejected", "needs_revision"],
    rejected:        ["pending"],
    needs_revision:  ["pending", "rejected"],
    approved:        [],
    contract_signed: [],
  };

  const allowed = VALID_TRANSITIONS[app.status] ?? [];
  if (!allowed.includes(status)) {
    return jsonResponse({
      error: `Transisi tidak valid: ${app.status} → ${status}. Transisi yang diizinkan: ${allowed.join(", ") || "tidak ada"}`,
    }, 400);
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
    return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({
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
    return jsonResponse({ error: "ids array wajib diisi" }, 400);
  }

  // Only allow deleting non-approved applications
  const { data: apps, error: checkError } = await supabase
    .from("employee_onboarding_applications")
    .select("id, status, approved_user_source_id")
    .in("id", ids);

  if (checkError) return jsonResponse({ error: checkError.message }, 500);

  const approvedIds = (apps ?? [])
    .filter((a: any) => a.status === "approved" && a.approved_user_source_id)
    .map((a: any) => a.id);

  if (approvedIds.length > 0) {
    return jsonResponse({
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
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ success: true, message: `${ids.length} pendaftaran dihapus` });
}
