import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── HMAC verify using Web Crypto API ─────────────────────────────

async function hexHmacSha256(secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Shift detection ──────────────────────────────────────────────

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

async function detectShift(supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    const { data: settings } = await supabase
      .schema("pos")
      .from("site_settings")
      .select("raw")
      .limit(1)
      .single();

    if (!settings?.raw) return "Shift";

    const schedules =
      ((settings.raw as Record<string, unknown>)?.shiftSettings as Record<string, unknown>)
        ?.shiftSchedules as Array<Record<string, unknown>> ?? [];

    // Edge Functions run in UTC; shift schedules are WIB.
    const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
    const currentMin = nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes();
    const matches: Array<{ name: string; openMin: number }> = [];

    for (const s of schedules) {
      const ot = String(s.openTime ?? "") || String(s.open_time ?? "");
      const ct = String(s.closeTime ?? "") || String(s.close_time ?? "");
      const name = String(s.name ?? s.shiftName ?? s.shift_name ?? "");
      if (!ot || !ct || !name) continue;

      const [oh, om] = ot.split(":").map(Number);
      const [ch, cm] = ct.split(":").map(Number);
      if (isNaN(oh) || isNaN(om) || isNaN(ch) || isNaN(cm)) continue;

      const openMin = oh * 60 + om;
      const closeMin = ch * 60 + cm;
      let inWindow = false;

      if (openMin <= closeMin) {
        if (currentMin >= (openMin - 60) && currentMin < closeMin) inWindow = true;
      } else {
        if (currentMin >= openMin || currentMin < closeMin) inWindow = true;
      }

      if (inWindow) matches.push({ name, openMin });
    }

    if (matches.length > 0) {
      matches.sort((a, b) => b.openMin - a.openMin);
      return matches[0].name;
    }

    return "Shift";
  } catch {
    return "Shift";
  }
}

// ─── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ valid: false, error: "Method not allowed" }, 405);
  }

  try {
    const { uid, t, sig } = await req.json();

    if (!uid || !t || !sig) {
      return jsonResponse({ valid: false, error: "Missing required params: uid, t, sig" }, 400);
    }

    // Verify timestamp (max 5 minutes)
    const now = Date.now();
    const ts = Number(t);
    if (!ts || now - ts > 5 * 60 * 1000) {
      return jsonResponse({ valid: false, error: "Link expired. Please request a new one from the bot." });
    }

    // Verify HMAC
    const secret = Deno.env.get("ATTENDANCE_HMAC_SECRET") ?? "";
    if (!secret) {
      console.error("[verify-closing-link] ATTENDANCE_HMAC_SECRET not set");
      return jsonResponse({ valid: false, error: "Server configuration error" }, 500);
    }

    const expectedSig = await hexHmacSha256(secret, `${uid}:${t}`);
    if (expectedSig !== sig) {
      return jsonResponse({ valid: false, error: "Invalid signature. Please request a new link from the bot." });
    }

    // Fetch staff info
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ valid: false, error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: user, error: userErr } = await supabase
      .from("yumi_users")
      .select("source_id, name, slug, raw")
      .eq("source_id", uid)
      .maybeSingle();

    if (userErr || !user) {
      return jsonResponse({ valid: false, error: "Staff not found" });
    }

    // Get role name
    let roleName = "";
    const raw = (user.raw ?? {}) as Record<string, unknown>;
    if (raw.roleName) {
      roleName = String(raw.roleName);
    } else if (raw.role_source_id || raw.roleSourceId) {
      const roleId = String(raw.role_source_id ?? raw.roleSourceId ?? "");
      const { data: role } = await supabase
        .schema("public")
        .from("yumi_roles")
        .select("name")
        .eq("source_id", roleId)
        .maybeSingle();
      if (role) roleName = role.name;
    }

    // Detect shift
    const shiftName = await detectShift(supabase);

    return jsonResponse({
      valid: true,
      staff: {
        sourceId: user.source_id,
        name: user.name,
        roleName,
        username: user.slug || user.source_id.slice(0, 8),
      },
      shiftName,
    });
  } catch (err) {
    console.error("[verify-closing-link] Error:", err);
    return jsonResponse({ valid: false, error: String(err) }, 500);
  }
});
