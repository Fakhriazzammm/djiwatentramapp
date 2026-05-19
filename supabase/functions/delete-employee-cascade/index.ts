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
    return corsResponse({}, 204);
  }

  // Only allow POST
  if (req.method !== "POST") {
    return corsResponse({ error: "Method not allowed" }, 405);
  }

  // Verify admin secret
  const adminSecret = req.headers.get("x-admin-secret") ?? "";
  if (!adminSecret || adminSecret !== ADMIN_SECRET) {
    return corsResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return corsResponse({ error: "ids array is required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 1: Fetch applications to get approved_user_source_id
    const { data: apps, error: fetchError } = await supabase
      .from("employee_onboarding_applications")
      .select("id, approved_user_source_id, full_name")
      .in("id", ids);

    if (fetchError) {
      console.error("[delete-employee-cascade] Fetch error:", fetchError);
      return corsResponse({ error: fetchError.message }, 500);
    }

    if (!apps || apps.length === 0) {
      return corsResponse({ error: "Applications not found" }, 404);
    }

    // Collect all source IDs for cleanup
    const sourceIds = apps
      .map((a: any) => a.approved_user_source_id)
      .filter(Boolean);

    console.log(`[delete-employee-cascade] Deleting ${apps.length} applications, source_ids:`, sourceIds);

    // Step 2: Delete from pos_users_public (the karyawan list)
    if (sourceIds.length > 0) {
      const { error: posDeleteError } = await supabase
        .from("pos_users_public")
        .delete()
        .in("_id", sourceIds);

      if (posDeleteError) {
        console.error("[delete-employee-cascade] pos_users_public delete error:", posDeleteError);
        // Continue — don't fail the whole operation
      }
    }

    // Step 3: Delete from yumi_users (auth)
    if (sourceIds.length > 0) {
      const { error: authDeleteError } = await supabase
        .from("yumi_users")
        .delete()
        .in("source_id", sourceIds);

      if (authDeleteError) {
        console.error("[delete-employee-cascade] yumi_users delete error:", authDeleteError);
        // Continue
      }
    }

    // Step 4: Delete from employee_onboarding_applications
    const { error: appDeleteError } = await supabase
      .from("employee_onboarding_applications")
      .delete()
      .in("id", ids);

    if (appDeleteError) {
      console.error("[delete-employee-cascade] Onboarding app delete error:", appDeleteError);
      return corsResponse({ error: appDeleteError.message }, 500);
    }

    return corsResponse({
      success: true,
      deleted: apps.length,
      names: apps.map((a: any) => a.full_name),
    });
  } catch (e: any) {
    console.error("[delete-employee-cascade] Error:", e.message);
    return corsResponse({ error: e.message }, 500);
  }
});
