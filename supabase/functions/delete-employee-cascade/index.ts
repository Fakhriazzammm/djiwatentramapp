// =============================================================================
// Edge Function: delete-employee-cascade
// Cascade delete an employee from all tables: employee_onboarding_applications,
// pos_users_public, and yumi_users.
//
// Uses service_role key to bypass RLS.
// Authentication: x-admin-secret header matching ONBOARDING_ADMIN_SECRET.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_SECRET = Deno.env.get("ONBOARDING_ADMIN_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!ADMIN_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables");
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
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...extraHeaders },
  });
}

// ── Main handler ──────────────────────────────────────────────
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse({ ok: true });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return corsResponse({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } }, 405);
  }

  // Verify admin secret
  const adminSecret = req.headers.get("x-admin-secret") ?? "";
  if (!adminSecret || adminSecret !== ADMIN_SECRET) {
    return corsResponse({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
  }

  try {
    const body = await req.json() as { ids?: string[]; source_ids?: string[] };
    const { ids, source_ids } = body;
    const hasIds = Array.isArray(ids) && ids.length > 0;
    const hasSourceIds = Array.isArray(source_ids) && source_ids.length > 0;

    // Validasi: minimal salah satu dari ids atau source_ids harus diisi
    if (!hasIds && !hasSourceIds) {
      return corsResponse({ success: false, error: { code: "VALIDATION_ERROR", message: "Either ids or source_ids array is required" } }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Collect applications from both lookup paths ──────────────
    let allApps: any[] = [];
    let rawSourceIds: string[] = [];

    // Path 1: lookup by ids (existing behavior)
    if (hasIds) {
      const { data: appsById, error: fetchError } = await supabase
        .from("employee_onboarding_applications")
        .select("id, approved_user_source_id, full_name")
        .in("id", ids);

      if (fetchError) {
        console.error("[delete-employee-cascade] Fetch by ids error:", fetchError);
        return corsResponse({ success: false, error: { code: "QUERY_ERROR", message: fetchError.message } }, 500);
      }

      if (appsById) {
        allApps.push(...appsById);
      }
    }

    // Path 2: lookup by source_ids (approved_user_source_id)
    if (hasSourceIds) {
      rawSourceIds = source_ids;

      const { data: appsBySource, error: fetchError } = await supabase
        .from("employee_onboarding_applications")
        .select("id, approved_user_source_id, full_name")
        .in("approved_user_source_id", source_ids);

      if (fetchError) {
        console.error("[delete-employee-cascade] Fetch by source_ids error:", fetchError);
        return corsResponse({ success: false, error: { code: "QUERY_ERROR", message: fetchError.message } }, 500);
      }

      if (appsBySource) {
        allApps.push(...appsBySource);
      }
    }

    if (allApps.length === 0) {
      return corsResponse({ success: false, error: { code: "NOT_FOUND", message: "Applications not found" } }, 404);
    }

    // Deduplicate by id (union)
    const seen = new Set<string>();
    const uniqueApps = allApps.filter((app: any) => {
      if (seen.has(app.id)) return false;
      seen.add(app.id);
      return true;
    });

    // Collect all source IDs: from lookup results + raw source_ids param
    const sourceIdsFromApps = uniqueApps
      .map((a: any) => a.approved_user_source_id)
      .filter(Boolean);

    const allSourceIds = [...new Set([...sourceIdsFromApps, ...rawSourceIds])];
    const allAppIds = uniqueApps.map((a: any) => a.id);

    const deletedNames = uniqueApps.map((a: any) => a.full_name);
    console.log(
      `[delete-employee-cascade] Deleting ${uniqueApps.length} applications, source_ids:`,
      allSourceIds,
      "names:",
      deletedNames,
    );

    // ── Step 2: Delete from pos_users_public (the karyawan list) ──
    if (allSourceIds.length > 0) {
      const { error: posDeleteError } = await supabase
        .from("pos_users_public")
        .delete()
        .in("_id", allSourceIds);

      if (posDeleteError) {
        console.error("[delete-employee-cascade] pos_users_public delete error:", posDeleteError);
        // Continue — don't fail the whole operation
      }
    }

    // ── Step 3: Delete from yumi_users (auth) ──
    if (allSourceIds.length > 0) {
      const { error: authDeleteError } = await supabase
        .from("yumi_users")
        .delete()
        .in("source_id", allSourceIds);

      if (authDeleteError) {
        console.error("[delete-employee-cascade] yumi_users delete error:", authDeleteError);
        // Continue
      }
    }

    // ── Step 4: Delete from employee_onboarding_applications ──
    const { error: appDeleteError } = await supabase
      .from("employee_onboarding_applications")
      .delete()
      .in("id", allAppIds);

    if (appDeleteError) {
      console.error("[delete-employee-cascade] Onboarding app delete error:", appDeleteError);
      return corsResponse({ success: false, error: { code: "DELETE_ERROR", message: appDeleteError.message } }, 500);
    }

    return corsResponse({
      success: true,
      deleted: uniqueApps.length,
      names: deletedNames,
    });
  } catch (e: any) {
    console.error("[delete-employee-cascade] Error:", e.message);
    return corsResponse({ success: false, error: { code: "INTERNAL_ERROR", message: e.message } }, 500);
  }
});
