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

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getEndOfDayTimestamp(now: number): number {
  // End of day in WIB = start of next day WIB = midnight + 1 day
  const wibNow = new Date(now + WIB_OFFSET_MS);
  const endOfDayWib = Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate(),
    23, 59, 59, 999,
  );
  // The auto clock-out timestamp = end of day in WIB, stored as UTC epoch
  // But we want it to appear as "23:59:59 WIB" which is UTC 23:59:59 - 7h = 16:59:59 UTC
  // Actually let's just use the end of the day in local terms
  // midnight WIB = next day 00:00:00 WIB = (today 00:00:00 + 1 day) UTC
  // today start in UTC based on WIB:
  const todayStartWib = Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate(),
    0, 0, 0, 0,
  );
  return todayStartWib - WIB_OFFSET_MS + 24 * 60 * 60 * 1000 - 1; // 23:59:59 WIB
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const debugLogs: string[] = [];
  const log = (msg: string) => {
    console.log(`[auto-attendance-clockout] ${msg}`);
    debugLogs.push(msg);
  };

  try {
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const headerSecret = req.headers.get("x-cron-secret") || "";
    if (cronSecret && headerSecret !== cronSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const now = Date.now();

    // 1. Get all users currently in store (checked in, no check_out)
    const { data: checkedInUsers, error: rpcError } = await supabaseAdmin.rpc(
      "get_currently_in_store",
    );

    if (rpcError) throw rpcError;
    log(
      `Found ${checkedInUsers?.length ?? 0} users still checked in: ${
        JSON.stringify((checkedInUsers ?? []).map((u: any) => u.user_name))
      }`,
    );

    if (!checkedInUsers || checkedInUsers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No users to auto clock-out",
          autoClockOut: 0,
          logs: debugLogs,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sourceIds: string[] = [];
    const names: string[] = [];

    // 2. For each user, insert a check_out record
    for (const user of checkedInUsers) {
      const userId = String(user.user_id || "");
      const userName = String(user.user_name || "Unknown");
      const checkInTime = Number(user.check_in_time ?? 0);

      if (!userId) {
        log(`  SKIP: user has no user_id`);
        continue;
      }

      // Skip if check-in was within last 30 minutes (grace period)
      if (now - checkInTime < 30 * 60 * 1000) {
        log(
          `  SKIP: ${userName} checked in <30min ago (${new Date(checkInTime).toISOString()})`,
        );
        continue;
      }

      // 🛠 FIX: Use checkInTime to determine the correct day's end
      // Previously used `now` — caused auto clock-out to always show today's date
      // even when the user checked in yesterday (e.g. check-in 03/07 → timestamp 04/07 23:59)
      const refTime = checkInTime > 0 ? checkInTime : now;
      const userClockOutTime = getEndOfDayTimestamp(refTime);
      const userClockOutDate = new Date(userClockOutTime + WIB_OFFSET_MS)
        .toISOString()
        .split("T")[0];

      // Check if there's already an auto-check_out for the check-in day
      const checkInDayStart = new Date(
        Date.UTC(
          new Date(refTime + WIB_OFFSET_MS).getUTCFullYear(),
          new Date(refTime + WIB_OFFSET_MS).getUTCMonth(),
          new Date(refTime + WIB_OFFSET_MS).getUTCDate(),
          0, 0, 0, 0,
        ),
      ).getTime() - WIB_OFFSET_MS;

      const { data: existingToday, error: checkError } = await supabaseAdmin
        .from("pos_attendance_logs")
        .select("_id")
        .eq("userId", userId)
        .eq("type", "check_out")
        .gte("timestamp", checkInDayStart)
        .lt("timestamp", checkInDayStart + 86400000)
        .limit(1);

      if (checkError) {
        log(`  SKIP ${userName}: error checking existing: ${checkError.message}`);
        continue;
      }

      if (existingToday && existingToday.length > 0) {
        log(
          `  SKIP: ${userName} already has check_out on ${userClockOutDate}`,
        );
        continue;
      }

      // Generate document ID
      const id = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

      log(`Auto clock-out for ${userName}: refTime=${refTime} → timestamp=${userClockOutTime} (date: ${userClockOutDate})`);

      const { error: insertError } = await supabaseAdmin
        .schema("legacy_mirror")
        .from("documents")
        .insert({
          table_name: "attendance",
          document_id: id,
          creation_time: now,
          document: {
            userId,
            type: "check_out",
            timestamp: userClockOutTime,
            location: null,
            notes:
              `Auto clock-out: lupa absen keluar pada ${userClockOutDate}`,
          },
        });

      if (insertError) {
        log(`  ERROR clocking out ${userName}: ${insertError.message}`);
        continue;
      }

      log(`  ✅ Auto clocked out: ${userName} (clocked out at ${userClockOutDate} 23:59 WIB)`);
      sourceIds.push(userId);
      names.push(userName);
    }

    log(
      `Done. Auto clocked out ${names.length} users: ${JSON.stringify(names)}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        autoClockOut: names.length,
        users: names,
        userIds: sourceIds,
        logs: debugLogs,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("[auto-attendance-clockout] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs: debugLogs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
