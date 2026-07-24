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

function fail(code: string, message: string, status = 400) {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

// ─── Time helpers ────────────────────────────────────────────────

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function nowWib(): number {
  return Date.now(); // We'll use UTC epoch ms — shift calc uses WIB offset
}

function startOfDayWib(ts: number): number {
  const wib = new Date(ts + WIB_OFFSET_MS);
  return new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate(), 0, 0, 0, 0),
  ).getTime() - WIB_OFFSET_MS;
}

function makeDocId(): string {
  const hex = "abcdef0123456789";
  let rnd = "";
  for (let i = 0; i < 20; i++) rnd += hex[Math.floor(Math.random() * 16)];
  return `att_svc_${rnd}`;
}

// ─── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  try {
    const payload = await req.json();
    const {
      userId,
      type,
      source = "api",
      shiftName,
      notes,
      roleName,
    } = payload as {
      userId: string;
      type: "check_in" | "check_out";
      source: string;
      shiftName?: string;
      notes?: string;
      roleName?: string;
    };

    // ── Validation ──────────────────────────────────────────────
    if (!userId || !type) {
      return fail("VALIDATION_ERROR", "userId and type are required");
    }
    if (!["check_in", "check_out"].includes(type)) {
      return fail("VALIDATION_ERROR", "type must be 'check_in' or 'check_out'");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return fail("CONFIG_ERROR", "Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = nowWib();
    const todayStart = startOfDayWib(now);
    const todayEnd = todayStart + 86400000;

    // ── Sequence validation ────────────────────────────────────
    // Get today's logs for this user
    const { data: todayLogs } = await supabase
      .from("pos_attendance_logs")
      .select("type, timestamp")
      .eq("userId", userId)
      .gte("timestamp", todayStart)
      .lt("timestamp", todayEnd)
      .order("timestamp", { ascending: false })
      .limit(1);

    const lastLog = todayLogs?.[0];

    if (type === "check_in" && lastLog?.type === "check_in") {
      return fail("SEQUENCE_ERROR", "Already checked in. Please check out first before checking in again.");
    }
    if (type === "check_out" && lastLog?.type !== "check_in") {
      return fail("SEQUENCE_ERROR", "Not checked in today. Please check in first.");
    }

    // If check-out, validate minimum 30 minutes
    if (type === "check_out" && lastLog) {
      const checkInTs = Number(lastLog.timestamp ?? 0);
      const elapsed = (now - checkInTs) / 60000;
      if (elapsed < 30) {
        return fail(
          "TOO_EARLY",
          `Minimal 30 menit sejak absen masuk. (${Math.round(elapsed)} menit sejak check-in)`,
        );
      }
      // This check is primarily for bot-based check-outs.
      // Web app closing page may skip this (user has to do opname).
    }

    // ── Auto-detect shift (if not provided, only for check_in) ──
    let finalShiftName = shiftName ?? "";
    if (type === "check_in" && !finalShiftName) {
      try {
        const { data: settings } = await supabase
          .from("site_settings")
          .select("raw")
          .limit(1)
          .single();

        const schedules =
          ((settings?.raw as Record<string, unknown>)?.shiftSettings as Record<string, unknown>)
            ?.shiftSchedules as Array<Record<string, unknown>> ?? [];

        const currentMin = new Date().getHours() * 60 + new Date().getMinutes();
        const matches: Array<{ name: string; openMin: number }> = [];

        for (const s of schedules) {
          const ot = String(s.openTime ?? s.open_time ?? "");
          const ct = String(s.closeTime ?? s.close_time ?? "");
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
          finalShiftName = matches[0].name;
        }
      } catch {
        // ignore
      }
    }

    // ── Write to legacy_mirror ──────────────────────────────────
    const doc: Record<string, unknown> = {
      userId,
      type,
      timestamp: now,
      source: source || "api",
    };
    if (finalShiftName) doc.shiftName = finalShiftName;
    if (roleName) doc.roleName = roleName;
    if (notes) doc.notes = notes;

    const { error: writeError } = await supabase
      .schema("legacy_mirror")
      .from("documents")
      .insert({
        table_name: "attendance",
        document_id: makeDocId(),
        creation_time: now,
        document: doc,
      });

    if (writeError) {
      console.error("[record-attendance] Write error:", writeError);
      return fail("DB_ERROR", "Failed to record attendance", 500);
    }

    return jsonResponse({
      success: true,
      log: {
        userId,
        type,
        timestamp: now,
        shiftName: finalShiftName,
        source: source || "api",
      },
    });
  } catch (err) {
    console.error("[record-attendance] Error:", err);
    return jsonResponse(
      { success: false, error: { code: "INTERNAL_ERROR", message: String(err) } },
      500,
    );
  }
});
