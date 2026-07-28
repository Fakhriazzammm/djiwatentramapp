// =============================================================================
// Edge Function: generate-payroll
// Handles payroll auto-detection, run generation, and payslip creation using
// service_role key to bypass RLS and write to pos. schema tables.
// This replaces the broken browser-side executeSql() which used Node.js
// fs/promises (not available in the browser).
// =============================================================================
// Deployment: npx supabase functions deploy generate-payroll --no-verify-jwt
// Env vars needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

// ── CORS headers ───────────────────────────────────
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

function fail(code: string, message: string, status = 400) {
  return corsResponse({ success: false, error: { code, message } }, status);
}

// ─── Helpers ────────────────────────────────────────

// Direct PostgreSQL connection — replaces Supabase Management API for self-host
async function queryRaw(sql: string) {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL") ?? "";
  if (!dbUrl) {
    throw new Error("SUPABASE_DB_URL not configured");
  }
  // Use pg via npm for self-host, fallback to supabase-js for cloud
  const { default: { Client } } = await import("npm:pg@8.11.3");
  const client = new Client(dbUrl);
  try {
    await client.connect();
    const result = await client.query(sql);
    return result.rows ?? [];
  } finally {
    await client.end().catch(() => {});
  }
}

// Check if exec_sql RPC exists; if not, create it on first invocation
async function ensureExecSql(supabase: ReturnType<typeof createClient>): Promise<void> {
  // No-op: use Management API instead of RPC
}

// ─── Action Handlers ────────────────────────────────

async function handleAutoDetect(supabase: ReturnType<typeof createClient>) {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const now = new Date(Date.now() + WIB_OFFSET_MS);
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const periodName = `${monthNames[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;

  // Step 1: Find existing period
  const findPeriodSql = `
    SELECT id, period_name, status
    FROM pos.payroll_periods
    WHERE period_name = '${periodName}'
    LIMIT 1;
  `;
  const existingPeriods: any[] = await queryRaw(findPeriodSql);
  let periodId: string | undefined;

  if (!existingPeriods || existingPeriods.length === 0) {
    // Step 2a: Auto-create period
    const createSql = `
      INSERT INTO pos.payroll_periods (period_name, start_date, end_date, status)
      VALUES ('${periodName}', '${startDateStr}', '${endDateStr}', 'open')
      RETURNING id;
    `;
    const created: any[] = await queryRaw(createSql);
    periodId = created?.[0]?.id;
    if (!periodId) throw new Error("Failed to create payroll period");

    // Step 2b: Auto-generate run
    const runResult = await generatePayrollRun(supabase, periodId);
    const runId = runResult?.run_id ?? null;
    return {
      action: "created",
      message: `${periodName} — periode berhasil dibuat dan payroll dijalankan`,
      periodId,
      runId,
    };
  }

  periodId = existingPeriods[0].id;

  // Step 3: Check for existing completed runs
  const findRunSql = `
    SELECT id, status
    FROM pos.payroll_runs
    WHERE payroll_period_id = '${periodId}'
    ORDER BY run_date DESC
    LIMIT 1;
  `;
  const existingRuns: any[] = await queryRaw(findRunSql);

  if (!existingRuns || existingRuns.length === 0) {
    // No runs yet — generate one
    const runResult = await generatePayrollRun(supabase, periodId);
    const runId = runResult?.run_id ?? null;
    return {
      action: "ran",
      message: `${periodName} — payroll run berhasil dibuat`,
      periodId,
      runId,
    };
  }

  const latestRun = existingRuns[0];

  if (latestRun.status === "completed") {
    // Run already completed — generate payslips
    await generatePayslipsForRun(supabase, latestRun.id);
    return {
      action: "generated",
      message: `${periodName} — slip gaji berhasil dihasilkan`,
      periodId,
      runId: latestRun.id,
    };
  }

  return {
    action: "skipped",
    message: `${periodName} — run masih berstatus "${latestRun.status}"`,
    periodId,
    runId: latestRun.id,
  };
}

async function generatePayrollRun(supabase: ReturnType<typeof createClient>, periodId: string) {
  const sql = `
    WITH period AS (
      SELECT id, start_date, end_date, period_name
      FROM pos.payroll_periods
      WHERE id = '${periodId}'
    ),
    new_run AS (
      INSERT INTO pos.payroll_runs (payroll_period_id, run_name, status)
      VALUES (
        (SELECT id FROM period),
        NULL,
        'processing'
      )
      RETURNING id AS run_id
    ),
    staff AS (
      SELECT
        v.user_id,
        v.user_name,
        v.role_name,
        v.role_id,
        v.base_hourly_rate,
        v.base_shift_rate,
        v.monthly_fixed_salary,
        v.daily_allowance,
        v.overtime_rate_per_hour,
        v.active_role_rule_id
      FROM pos.pos_payroll_staff_active_view v
    ),
    attendance AS (
      SELECT
        user_id,
        user_name,
        role_name,
        total_days_worked,
        total_shifts
      FROM pos.get_attendance_summary_for_period(
        (SELECT start_date FROM period),
        (SELECT end_date FROM period)
      )
    ),
    inserted_items AS (
      INSERT INTO pos.payroll_run_items (
        payroll_run_id, user_id, user_name, role_name, role_rule_id,
        total_shifts, total_hours, overtime_hours, attendance_days, absent_days,
        shift_pay, hourly_pay, fixed_salary, daily_allowance_total,
        overtime_pay, bonus_pay, gross_pay, deductions, net_pay,
        compensation_breakdown
      )
      SELECT
        (SELECT run_id FROM new_run),
        st.user_id,
        st.user_name,
        st.role_name,
        st.active_role_rule_id,
        COALESCE(att.total_shifts, 0),
        0,
        0,
        COALESCE(att.total_days_worked, 0),
        0,
        COALESCE(att.total_shifts, 0) * st.base_shift_rate,
        0,
        st.monthly_fixed_salary,
        COALESCE(att.total_days_worked, 0) * st.daily_allowance,
        0,
        0,
        st.monthly_fixed_salary
          + COALESCE(att.total_shifts, 0) * st.base_shift_rate
          + COALESCE(att.total_days_worked, 0) * st.daily_allowance,
        0,
        st.monthly_fixed_salary
          + COALESCE(att.total_shifts, 0) * st.base_shift_rate
          + COALESCE(att.total_days_worked, 0) * st.daily_allowance,
        jsonb_build_object(
          'role_name', st.role_name,
          'base_shift_rate', st.base_shift_rate,
          'monthly_fixed_salary', st.monthly_fixed_salary,
          'daily_allowance', st.daily_allowance,
          'overtime_rate_per_hour', st.overtime_rate_per_hour,
          'shifts', COALESCE(att.total_shifts, 0),
          'days_worked', COALESCE(att.total_days_worked, 0),
          'total_shift_pay', COALESCE(att.total_shifts, 0) * st.base_shift_rate,
          'total_allowance', COALESCE(att.total_days_worked, 0) * st.daily_allowance,
          'total_overtime_bonus', 0,
          'total_penalty', 0,
          'bonus_target', '{}'::jsonb
        )
      FROM staff st
      LEFT JOIN attendance att ON att.user_id = st.user_id
      RETURNING *
    )
    UPDATE pos.payroll_runs
    SET
      status = 'completed',
      completed_at = now(),
      total_employees = (SELECT count(*) FROM inserted_items),
      total_gross_pay = (SELECT COALESCE(sum(gross_pay), 0) FROM pos.payroll_run_items WHERE payroll_run_id = (SELECT run_id FROM new_run)),
      total_net_pay = (SELECT COALESCE(sum(net_pay), 0) FROM pos.payroll_run_items WHERE payroll_run_id = (SELECT run_id FROM new_run))
    WHERE id = (SELECT run_id FROM new_run)
    RETURNING *;
  `;
  const result: any[] = await queryRaw(sql);
  return result?.[0] ?? null;
}

async function generatePayslipsForRun(supabase: ReturnType<typeof createClient>, runId: string) {
  const sql = `
    INSERT INTO pos.payslips (
      payroll_run_item_id, user_id, user_name, slug,
      period_name, period_start, period_end,
      gross_pay, deductions, net_pay, breakdown, status
    )
    SELECT
      ri.id,
      ri.user_id,
      ri.user_name,
      (SELECT slug FROM public.pos_staff_users WHERE _id = ri.user_id),
      pp.period_name,
      pp.start_date,
      pp.end_date,
      ri.gross_pay,
      ri.deductions,
      ri.net_pay,
      ri.compensation_breakdown,
      'generated'
    FROM pos.payroll_run_items ri
    JOIN pos.payroll_runs pr ON pr.id = ri.payroll_run_id
    JOIN pos.payroll_periods pp ON pp.id = pr.payroll_period_id
    WHERE ri.payroll_run_id = '${runId}'
    ON CONFLICT (payroll_run_item_id) DO UPDATE SET
      gross_pay = EXCLUDED.gross_pay,
      deductions = EXCLUDED.deductions,
      net_pay = EXCLUDED.net_pay,
      breakdown = EXCLUDED.breakdown,
      slug = EXCLUDED.slug,
      updated_at = now();
  `;
  const result = await queryRaw(sql);

  // ── Post-process: apply bonus from shift memberBonuses ──
  try {
    // Get period for this run
    const periodData: any[] = await queryRaw(`
      SELECT pp.period_name, pp.start_date, pp.end_date
      FROM pos.payroll_periods pp
      JOIN pos.payroll_runs pr ON pr.payroll_period_id = pp.id
      WHERE pr.id = '${runId}'
      LIMIT 1
    `);
    if (periodData && periodData.length > 0) {
      const startTs = new Date(periodData[0].start_date).getTime();
      const endTs = new Date(periodData[0].end_date).getTime() + 86400000;

      // Get all shifts in this period that have stored memberBonuses
      const shiftsWithBonus: any[] = await queryRaw(`
        SELECT source_id, shift_name, start_time, team_members,
               raw->'memberBonuses' AS member_bonuses
        FROM pos.shifts
        WHERE start_time >= ${startTs}
          AND start_time <= ${endTs}
          AND raw ? 'memberBonuses'
      `);

      if (shiftsWithBonus && shiftsWithBonus.length > 0) {
        // Group bonus by staff name
        const staffBonus: Record<string, { total: number; shifts: { shiftName: string; bonus: number; date: string }[] }> = {};

        for (const shift of shiftsWithBonus) {
          let bonuses: any[] = [];
          if (typeof shift.member_bonuses === 'string') {
            try { bonuses = JSON.parse(shift.member_bonuses); } catch {}
          } else if (Array.isArray(shift.member_bonuses)) {
            bonuses = shift.member_bonuses;
          }
          for (const mb of bonuses) {
            const name = (mb.name ?? "").toUpperCase().trim();
            if (!name) continue;
            if (!staffBonus[name]) staffBonus[name] = { total: 0, shifts: [] };
            const bonusAmount = Number(mb.bonus ?? 0);
            if (bonusAmount > 0) {
              staffBonus[name].total += bonusAmount;
              staffBonus[name].shifts.push({
                shiftName: shift.shift_name ?? "Shift",
                bonus: bonusAmount,
                date: shift.start_time
                  ? new Date(shift.start_time).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                  : "",
              });
            }
          }
        }

        // Update each payslip with bonus data
        const runItems: any[] = await queryRaw(`
          SELECT id, user_name, gross_pay, net_pay, compensation_breakdown
          FROM pos.payroll_run_items
          WHERE payroll_run_id = '${runId}'
        `);

        for (const item of runItems) {
          const name = (item.user_name ?? "").toUpperCase().trim();
          const bonusInfo = staffBonus[name];
          if (!bonusInfo || bonusInfo.total <= 0) continue;

          const breakdown = typeof item.compensation_breakdown === 'string'
            ? JSON.parse(item.compensation_breakdown)
            : (item.compensation_breakdown ?? {});

          breakdown.bonus_target = {
            basis: "shift",
            total_bonus: bonusInfo.total,
            shifts: bonusInfo.shifts,
          };
          breakdown.shift_work_dates = bonusInfo.shifts.map((s) => s.date);
          breakdown.shifts = bonusInfo.shifts.length;

          const newGross = (item.gross_pay ?? 0) + bonusInfo.total;
          const newNet = (item.net_pay ?? 0) + bonusInfo.total;

          await queryRaw(`
            UPDATE pos.payslips
            SET
              breakdown = '${JSON.stringify(breakdown).replace(/'/g, "''")}'::jsonb,
              gross_pay = ${newGross},
              net_pay = ${newNet}
            WHERE payroll_run_item_id = '${item.id}';
          `);

          // Also update payroll_run_items so SaldoCard gets correct data
          await queryRaw(`
            UPDATE pos.payroll_run_items
            SET
              bonus_pay = ${bonusInfo.total},
              gross_pay = ${newGross},
              net_pay = ${newNet},
              compensation_breakdown = '${JSON.stringify(breakdown).replace(/'/g, "''")}'::jsonb,
              updated_at = now()
            WHERE id = '${item.id}';
          `);
        }
      }
    }
  } catch (e) {
    console.warn("[generate-payroll] bonus post-processing failed:", e);
    // Non-fatal — payslips still created without bonus data
  }

  return result;
}

async function handleUpdatePayslipStatus(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { payslipId, status } = payload as { payslipId: string; status: "sent" | "acknowledged" | "disputed" };
  if (!payslipId || !status) throw new Error("Missing payslipId or status");

  const validStatuses = ["sent", "acknowledged", "disputed"];
  if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);

  const statusTimestamp =
    status === "sent" ? "sent_at = now()"
    : status === "acknowledged" ? "acknowledged_at = now()"
    : "";

  const sql = `
    UPDATE pos.payslips
    SET status = '${status}', ${statusTimestamp} updated_at = now()
    WHERE id = '${payslipId}'
    RETURNING *;
  `;
  const result: any[] = await queryRaw(sql);
  return result?.[0] ?? null;
}

async function handleSaveShiftBonuses(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { shiftId, memberBonuses } = payload as { shiftId: string; memberBonuses: any[] };
  if (!shiftId || !Array.isArray(memberBonuses)) throw new Error("Missing shiftId or memberBonuses array");

  const sql = `
    UPDATE pos.shifts
    SET raw = COALESCE(raw, '{}'::jsonb) || '${JSON.stringify({ memberBonuses }).replace(/'/g, "''")}'::jsonb
    WHERE source_id = '${shiftId}'
    RETURNING source_id;
  `;
  return queryRaw(sql);
}

async function handleUpdateRunItem(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { runItemId, field, value } = payload as { runItemId: string; field: string; value: number };
  if (!runItemId || !field) throw new Error("Missing runItemId or field");

  const sql = `
    UPDATE pos.payroll_run_items
    SET ${field} = ${value}, updated_at = now()
    WHERE id = '${runItemId}'
    RETURNING *;
  `;
  return queryRaw(sql);
}

async function handleSyncPayslipFromRunItem(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { runItemId, payslipId } = payload as { runItemId: string; payslipId: string };
  if (!runItemId || !payslipId) throw new Error("Missing runItemId or payslipId");

  const sql = `
    UPDATE pos.payslips
    SET
      gross_pay = (SELECT gross_pay FROM pos.payroll_run_items WHERE id = '${runItemId}'),
      deductions = (SELECT deductions FROM pos.payroll_run_items WHERE id = '${runItemId}'),
      net_pay = (SELECT net_pay FROM pos.payroll_run_items WHERE id = '${runItemId}'),
      breakdown = (SELECT compensation_breakdown FROM pos.payroll_run_items WHERE id = '${runItemId}'),
      slug = (SELECT slug FROM public.pos_staff_users WHERE _id = (SELECT user_id FROM pos.payroll_run_items WHERE id = '${runItemId}')),
      updated_at = now()
    WHERE id = '${payslipId}'
    RETURNING *;
  `;
  return queryRaw(sql);
}

async function handleApproveRun(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { runId, approvedBy } = payload as { runId: string; approvedBy?: string };
  if (!runId) throw new Error("Missing runId");

  const sql = `
    UPDATE pos.payroll_runs
    SET status = 'completed',
        completed_at = now(),
        metadata = jsonb_set(
          COALESCE(metadata, '{}'),
          '{approved_by}',
          ${approvedBy ? `'${approvedBy}'` : "'null'"}
        ),
        updated_at = now()
    WHERE id = '${runId}'
    RETURNING *;
  `;
  return queryRaw(sql);
}

async function handleRawSql(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { query } = payload as { query: string };
  if (!query) throw new Error("Missing query");
  return queryRaw(query);
}

// ─── Main Handler ────────────────────────────────────

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      db: { schema: "pos" },
    });

    const body = await req.json();
    const { action, ...payload } = body;
    console.log(`[generate-payroll] action: ${action}`, JSON.stringify(payload));

    let result;
    switch (action) {
      case "auto_detect":
        result = await handleAutoDetect(supabase);
        break;
      case "generate_for_period":
        result = await generatePayrollRun(supabase, payload.periodId as string);
        break;
      case "generate_payslips_for_run":
        result = await generatePayslipsForRun(supabase, payload.runId as string);
        break;
      case "update_payslip_status":
        result = await handleUpdatePayslipStatus(supabase, payload);
        break;
      case "save_shift_bonuses":
        result = await handleSaveShiftBonuses(supabase, payload);
        break;
      case "update_run_item":
        result = await handleUpdateRunItem(supabase, payload);
        break;
      case "sync_payslip_from_run_item":
        result = await handleSyncPayslipFromRunItem(supabase, payload);
        break;
      case "approve_run":
        result = await handleApproveRun(supabase, payload);
        break;
      case "raw_sql":
        result = await handleRawSql(supabase, payload);
        break;
      default:
        return fail("UNKNOWN_ACTION", `Unknown action: ${action}`, 400);
    }

    return corsResponse({ success: true, result, action, ...(typeof result === "object" ? result : {}) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate-payroll] Error:", message);
    return corsResponse({ success: false, error: { code: "INTERNAL_ERROR", message } }, 500);
  }
});
