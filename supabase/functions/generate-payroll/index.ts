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
const PROJECT_REF = "xaemykhjpkgypqqpfdcb";

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

function fail(message: string, status = 400) {
  return corsResponse({ error: message }, status);
}

// ─── Helpers ────────────────────────────────────────

async function queryRaw(supabase: ReturnType<typeof createClient>, sql: string) {
  // Execute SQL via Management API (Postgres query endpoint)
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const mgmtToken = Deno.env.get("MGMT_ACCESS_TOKEN") ?? "";
  if (!mgmtToken) {
    throw new Error("MGMT_ACCESS_TOKEN not configured");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mgmtToken}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Check if exec_sql RPC exists; if not, create it on first invocation
async function ensureExecSql(supabase: ReturnType<typeof createClient>): Promise<void> {
  // No-op: use Management API instead of RPC
}

// ─── Action Handlers ────────────────────────────────

async function handleAutoDetect(supabase: ReturnType<typeof createClient>) {
  const now = new Date();
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const periodName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startDateStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0);
  const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

  // Step 1: Find existing period
  const findPeriodSql = `
    SELECT id, period_name, status
    FROM pos.payroll_periods
    WHERE period_name = '${periodName}'
    LIMIT 1;
  `;
  const existingPeriods: any[] = await queryRaw(supabase, findPeriodSql);
  let periodId: string | undefined;

  if (!existingPeriods || existingPeriods.length === 0) {
    // Step 2a: Auto-create period
    const createSql = `
      INSERT INTO pos.payroll_periods (period_name, start_date, end_date, status)
      VALUES ('${periodName}', '${startDateStr}', '${endDateStr}', 'open')
      RETURNING id;
    `;
    const created: any[] = await queryRaw(supabase, createSql);
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
  const existingRuns: any[] = await queryRaw(supabase, findRunSql);

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
  const result: any[] = await queryRaw(supabase, sql);
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
  return queryRaw(supabase, sql);
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
  const result: any[] = await queryRaw(supabase, sql);
  return result?.[0] ?? null;
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
  return queryRaw(supabase, sql);
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
  return queryRaw(supabase, sql);
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
  return queryRaw(supabase, sql);
}

async function handleRawSql(supabase: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { query } = payload as { query: string };
  if (!query) throw new Error("Missing query");
  return queryRaw(supabase, query);
}

// ─── Main Handler ────────────────────────────────────

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return fail("Method not allowed", 405);
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
        return fail(`Unknown action: ${action}`, 400);
    }

    return corsResponse({ ok: true, result, action, ...(typeof result === "object" ? result : {}) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[generate-payroll] Error:", message);
    return corsResponse({ error: message }, 500);
  }
});
