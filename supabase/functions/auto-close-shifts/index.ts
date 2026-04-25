import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 30 * 60 * 1000;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface ShiftSchedule {
  name: string;
  openTime: string;
  closeTime: string;
}

function getScheduledCloseEpoch(startMs: number, closeTime: string): number {
  const shifted = new Date(startMs + WIB_OFFSET_MS);
  const [hh, mm] = closeTime.split(":").map(Number);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    (hh || 0) - 7,
    mm || 0,
    0,
    0,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const debugLogs: string[] = [];
  const log = (msg: string) => {
    console.log(`[auto-close-shifts] ${msg}`);
    debugLogs.push(msg);
  };

  try {
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (cronSecret && headerSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get shift schedules
    const { data: settingsRows, error: settingsError } = await supabaseAdmin
      .from("pos_site_settings")
      .select("raw")
      .limit(1);

    if (settingsError) throw settingsError;
    if (!settingsRows || settingsRows.length === 0) {
      return new Response(
        JSON.stringify({ message: "No site settings found", closed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const settingsRow = settingsRows[0];
    const shiftSettings = (settingsRow.raw as any)?.shiftSettings || {};
    const schedules: ShiftSchedule[] = shiftSettings.shiftSchedules || [];
    log(`Found ${schedules.length} schedules: ${JSON.stringify(schedules.map(s => s.name))}`);

    if (schedules.length === 0) {
      return new Response(
        JSON.stringify({ message: "No shift schedules configured", closed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Get all active shifts
    const { data: activeShifts, error: shiftsError } = await supabaseAdmin
      .from("pos_shift_reports")
      .select("shift_id, shift_name, cashier_name, start_time, starting_cash, total_revenue, cash_revenue, qris_revenue, total_expenses, order_count, total_items_sold, total_discount")
      .eq("status", "AKTIF");

    if (shiftsError) throw shiftsError;
    log(`Found ${activeShifts?.length ?? 0} active shifts`);

    if (!activeShifts || activeShifts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active shifts to close", closed: 0, logs: debugLogs }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = Date.now();
    const closedShifts: Array<{ id: string; name: string; reason: string }> = [];

    // 3. For each active shift
    for (const shift of activeShifts) {
      const startTime = Number(shift.start_time);
      const shiftName = String(shift.shift_name || "");
      log(`Checking shift '${shiftName}' (id=${shift.shift_id}, start=${startTime})`);

      const schedule = schedules.find((s) => s.name === shiftName);
      if (!schedule?.closeTime) {
        log(`  No matching schedule for '${shiftName}' - skipping`);
        continue;
      }

      const scheduledClose = getScheduledCloseEpoch(startTime, schedule.closeTime);
      const deadline = scheduledClose + GRACE_PERIOD_MS;
      const overdueMs = now - deadline;
      log(`  Scheduled close: ${scheduledClose} (${new Date(scheduledClose).toISOString()}), deadline: ${deadline}, overdue: ${overdueMs > 0 ? Math.round(overdueMs / 60000) + 'min' : 'not yet'}`);

      if (now < deadline) continue;

      // 4. Auto-close
      const endTime = deadline;
      const cashRevenue = Number(shift.cash_revenue ?? 0);
      const qrisRevenue = Number(shift.qris_revenue ?? 0);
      const totalRevenue = Number(shift.total_revenue ?? 0);
      const totalExpenses = Number(shift.total_expenses ?? 0);
      const totalItemsSold = Number(shift.total_items_sold ?? 0);
      const totalDiscount = Number(shift.total_discount ?? 0);
      const startingCash = Number(shift.starting_cash ?? 0);

      const endingCashExpected = startingCash + cashRevenue - totalExpenses;
      const nonCashExpected = qrisRevenue;

      const summary = {
        totalRevenue,
        totalExpenses,
        totalItemsSold,
        cashRevenue,
        qrisRevenue,
        totalDiscount,
      };

      // Update via pos schema
      const { error: updateError } = await supabaseAdmin
        .schema("pos")
        .from("shifts")
        .update({
          end_time: endTime,
          ending_cash_expected: endingCashExpected,
          ending_cash_physical: 0,
          non_cash_expected: nonCashExpected,
          non_cash_confirmed: 0,
          summary,
          raw: {
            auto_closed: true,
            auto_closed_at: now,
            auto_close_reason: `Shift "${shiftName}" ditutup otomatis: melewati jadwal ${schedule.closeTime} WIB + 30 menit grace period.`,
          },
        })
        .eq("source_id", shift.shift_id);

      if (updateError) {
        log(`  ERROR closing: ${JSON.stringify(updateError)}`);
        continue;
      }

      log(`  Successfully auto-closed shift ${shift.shift_id}`);
      closedShifts.push({
        id: shift.shift_id,
        name: shiftName,
        reason: `Overdue by ${Math.round(overdueMs / 60000)} min`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        closed: closedShifts.length,
        closedShifts,
        logs: debugLogs,
        checkedAt: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
    const errStack = error instanceof Error ? error.stack?.slice(0, 500) : undefined;
    console.error("[auto-close-shifts] Error:", errMsg, errStack);
    return new Response(
      JSON.stringify({
        error: errMsg,
        stack: errStack,
        logs: debugLogs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
