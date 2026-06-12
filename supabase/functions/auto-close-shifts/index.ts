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
const GRACE_PERIOD_MS = 2 * 60 * 60 * 1000; // 2 jam grace period

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

function fmtWIB(ms: number): string {
  const d = new Date(ms + WIB_OFFSET_MS);
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const dd = d.getUTCDate();
  const m = months[d.getUTCMonth()];
  const y = d.getUTCFullYear();
  const day = days[d.getUTCDay()];
  return `${day}, ${dd} ${m} ${y} pukul ${hh}.${mm}`;
}

function fmtRp(n: number): string {
  return `Rp ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
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
      return new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), {
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
        JSON.stringify({ success: true, message: "No site settings found", closed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const settingsRow = settingsRows[0];
    const shiftSettings = (settingsRow.raw as any)?.shiftSettings || {};
    const schedules: ShiftSchedule[] = shiftSettings.shiftSchedules || [];
    log(`Found ${schedules.length} schedules: ${JSON.stringify(schedules.map(s => s.name))}`);

    if (schedules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No shift schedules configured", closed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Get all active shifts
    const { data: activeShifts, error: shiftsError } = await supabaseAdmin
      .from("pos_shift_reports")
      .select("shift_id, shift_name, cashier_name, team_members, start_time, starting_cash, total_revenue, cash_revenue, qris_revenue, total_expenses, order_count, total_items_sold, total_discount")
      .eq("status", "AKTIF");

    if (shiftsError) throw shiftsError;
    log(`Found ${activeShifts?.length ?? 0} active shifts`);

    if (!activeShifts || activeShifts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active shifts to close", closed: 0, logs: debugLogs }),
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
      log(`  Scheduled close: ${new Date(scheduledClose).toISOString()}, deadline: ${new Date(deadline).toISOString()}, overdue: ${overdueMs > 0 ? Math.round(overdueMs / 60000) + 'min' : 'not yet'}`);

      if (now < deadline) continue;

      // 4. Auto-close
      const endTime = deadline;
      const cashRevenue = Number(shift.cash_revenue ?? 0);
      const qrisRevenue = Number(shift.qris_revenue ?? 0);
      const totalExpenses = Number(shift.total_expenses ?? 0);
      const startingCash = Number(shift.starting_cash ?? 0);

      // Hitung bruto & diskon dari orders aktual di periode shift
      let totalGrossSales = 0;
      let totalDiscountFromOrders = 0;
      let totalRevenueFromOrders = 0;
      let totalItemsSoldCalc = 0;
      const { data: shiftOrders, error: ordersError } = await supabaseAdmin
        .schema("pos")
        .from("orders")
        .select("total_amount, discount_amount, payment_method")
        .gte("creation_time", startTime)
        .lt("creation_time", deadline)
        .limit(1000);
      if (!ordersError && shiftOrders && shiftOrders.length > 0) {
        totalRevenueFromOrders = shiftOrders.reduce(
          (sum, o) => sum + Number(o.total_amount ?? 0), 0
        );
        totalDiscountFromOrders = shiftOrders.reduce(
          (sum, o) => sum + Number(o.discount_amount ?? 0), 0
        );
        totalGrossSales = totalRevenueFromOrders + totalDiscountFromOrders;
        totalItemsSoldCalc = shiftOrders.length;
      }

      const endingCashExpected = startingCash + cashRevenue - totalExpenses;
      const nonCashExpected = qrisRevenue;

      const summary: Record<string, unknown> = {
        totalRevenue: totalRevenueFromOrders || Number(cashRevenue + qrisRevenue),
        totalGrossSales,
        totalExpenses,
        totalItemsSold: totalItemsSoldCalc,
        cashRevenue,
        qrisRevenue,
        totalDiscount: totalDiscountFromOrders,
      };

      // Build notification text
      const teamStr = String(shift.team_members || "").replace(/,/g, ", ");
      const startWIB = new Date(startTime + WIB_OFFSET_MS);
      const endWIB = new Date(endTime + WIB_OFFSET_MS);
      const startFmt = `${String(startWIB.getUTCHours()).padStart(2, "0")}.${String(startWIB.getUTCMinutes()).padStart(2, "0")}`;
      const endFmt = `${String(endWIB.getUTCHours()).padStart(2, "0")}.${String(endWIB.getUTCMinutes()).padStart(2, "0")}`;
      const startDateFmt = `${String(startWIB.getUTCDate()).padStart(2, "0")}/${String(startWIB.getUTCMonth() + 1).padStart(2, "0")}`;
      const endDateFmt = `${String(endWIB.getUTCDate()).padStart(2, "0")}/${String(endWIB.getUTCMonth() + 1).padStart(2, "0")}`;

      // Hitung non-tunai breakdown dari orders
      const nonCashBreakdown: Record<string, number> = {};
      if (shiftOrders && shiftOrders.length > 0) {
        for (const o of shiftOrders) {
          const pm = String((o as any).payment_method || "").toLowerCase();
          if (pm && pm !== "cash") {
            const label = pm === "qris" ? "QRIS" : pm === "edc" ? "EDC" : pm === "transfer" ? "Transfer" : pm;
            nonCashBreakdown[label] = (nonCashBreakdown[label] || 0) + Number(o.total_amount || 0);
          }
        }
      }

      const nonCashLines = Object.entries(nonCashBreakdown)
        .map(([k, v]) => `  ${k}: ${fmtRp(v)}`)
        .join("\n") || "  (tidak ada)";

      const notifText = `📋 📊 LAPORAN SHIFT (AUTO CLOSE)
━━━━━━━━━━━━━━━
🏪 Djiwa Tentram
🔄 Shift ${shiftName}
👤 Kasir: ${shift.cashier_name || "-"}
${teamStr ? `👥 Tim: ${teamStr}` : ""}
━━━ DI SISTEM ━━━
💰 Modal Kasir: ${fmtRp(startingCash)}
💵 Penjualan Tunai: ${fmtRp(cashRevenue)}
💳 Non-Tunai:\n${nonCashLines}
💸 Pengeluaran: ${fmtRp(totalExpenses)}
📦 Item Terjual: ${totalItemsSoldCalc}
🏷️ Diskon: ${fmtRp(totalDiscountFromOrders)}
━━━━━
💵 Uang Fisik: (tidak dihitung — auto close)
━━━━━
🕐 ${startDateFmt} ${startFmt} sd ${endDateFmt} ${endFmt} WIB
⚠️ Shift ditutup otomatis karena melewati batas waktu`;

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
            auto_close_reason: `Shift "${shiftName}" ditutup otomatis: melewati jadwal ${schedule.closeTime} WIB + 2 jam grace period.`,
            notification_pending: true,
            notification_text: notifText,
            notification_data: {
              shiftName,
              cashierName: shift.cashier_name || "",
              teamMembers: teamStr,
              startTime,
              endTime,
              startingCash,
              cashRevenue,
              totalExpenses,
              totalDiscount: totalDiscountFromOrders,
              totalItemsSold: totalItemsSoldCalc,
              paymentBreakdown: nonCashBreakdown,
              non_cash_expected: nonCashExpected,
              ending_cash_expected: endingCashExpected,
            },
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

    // 5. Process recurring expenses
    const recurringCreated: string[] = [];
    try {
      const { data: recurringTx, error: recurringError } = await supabaseAdmin
        .schema("pos")
        .from("financial_transactions")
        .select("source_id, tx_type, amount, category, merchant, description, payment_method, tags, metadata, raw")
        .eq("is_recurring", true)
        .eq("tx_type", "expense");

      if (!recurringError && recurringTx && recurringTx.length > 0) {
        const nowWib = new Date(now + WIB_OFFSET_MS);
        const monthStart = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), 1)).getTime();
        const monthEnd = new Date(Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth() + 1, 0, 23, 59, 59, 999)).getTime();

        log(`Checking ${recurringTx.length} recurring expenses for month ${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}`);

        // Group by category to avoid duplicates
        const templateByCategory = new Map<string, typeof recurringTx[0]>();
        for (const tx of recurringTx) {
          const cat = (tx.category || "").trim().toLowerCase();
          if (cat && !templateByCategory.has(cat)) {
            templateByCategory.set(cat, tx);
          }
        }

        for (const [, template] of templateByCategory) {
          const cat = (template.category || "").trim().toLowerCase();
          // Check if any transaction with this category already exists this month
          const { data: existingInMonth, error: checkError } = await supabaseAdmin
            .schema("pos")
            .from("financial_transactions")
            .select("source_id")
            .eq("category", template.category)
            .gte("tx_date", monthStart)
            .lte("tx_date", monthEnd)
            .limit(1);

          if (checkError) {
            log(`  Recurring check error for '${cat}': ${checkError.message}`);
            continue;
          }

          if (existingInMonth && existingInMonth.length > 0) {
            log(`  Recurring '${cat}' already exists this month, skipping`);
            continue;
          }

          // Create new recurring expense for this month
          const newId = `fin_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
          const meta = (template.metadata as Record<string, unknown> | null) ?? {};
          const raw = (template.raw as Record<string, unknown> | null) ?? {};

          const { error: createRecurringError } = await supabaseAdmin
            .schema("pos")
            .from("financial_transactions")
            .insert({
              source_id: newId,
              tx_type: "expense",
              amount: template.amount,
              category: template.category,
              merchant: template.merchant,
              description: template.description,
              tx_date: now,
              payment_method: template.payment_method,
              status: "completed",
              is_recurring: true,
              recurring_interval: "monthly",
              tags: template.tags,
              metadata: {
                ...meta,
                source: "recurring_auto",
                recurringParentId: template.source_id,
                autoCreatedAt: now,
              },
              creation_time: now,
              raw: {
                ...raw,
                source: "recurring_auto",
                recurringParentId: template.source_id,
                autoCreatedAt: now,
              },
            });

          if (createRecurringError) {
            log(`  ERROR creating recurring '${cat}': ${createRecurringError.message}`);
          } else {
            log(`  Created recurring expense '${cat}' for this month (Rp ${template.amount})`);
            recurringCreated.push(cat);
          }
        }
      }
    } catch (recurringProcError) {
      const msg = recurringProcError instanceof Error ? recurringProcError.message : String(recurringProcError);
      log(`Recurring expense processing error: ${msg}`);
      console.error("[auto-close-shifts] Recurring error:", msg);
    }

    return new Response(
      JSON.stringify({
        success: true,
        closed: closedShifts.length,
        closedShifts,
        recurringCreated,
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
        success: false,
        error: { code: "INTERNAL_ERROR", message: errMsg },
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
