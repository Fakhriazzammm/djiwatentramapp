import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";

function safeNum(value: unknown) {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

function useSupabaseValue<T>(
	key: string,
	load: () => Promise<T | null>,
	deps: readonly unknown[]
) {
	return useSupabaseLiveValue(key, load, deps);
}

// ─── Constants ──────────────────────────────────────────────────────
const SUPABASE_URL = "https://xaemykhjpkgypqqpfdcb.supabase.co";

// ─── Fetch: Payroll Periods ─────────────────────────────────────────
async function fetchPayrollPeriods() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_periods")
		.select("*")
		.order("start_date", { ascending: false });

	if (error) throw error;
	return data ?? [];
}

async function fetchPayrollPeriod(id: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_periods")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (error) throw error;
	return data;
}

// ─── Fetch: Payroll Role Rules ──────────────────────────────────────
async function fetchPayrollRoleRules() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_role_rules")
		.select("*")
		.order("role_name", { ascending: true });

	if (error) throw error;
	return data ?? [];
}

async function fetchActivePayrollRoleRule(sourceRoleId: string) {
	const supabase = createClient();
	const today = new Date().toISOString().slice(0, 10);
	const { data, error } = await supabase
		.from("pos_payroll_role_rules")
		.select("*")
		.eq("source_role_id", sourceRoleId)
		.lte("effective_from", today)
		.order("effective_from", { ascending: false })
		.limit(1);

	if (error) throw error;
	return (data ?? [])[0] ?? null;
}

// ─── Fetch: Payroll User Overrides ──────────────────────────────────
async function fetchPayrollUserOverrides(args?: {
	userId?: string;
	periodId?: string;
}) {
	const supabase = createClient();
	let query = supabase
		.from("pos_payroll_user_overrides")
		.select("*")
		.order("created_at", { ascending: false });

	if (args?.userId) query = query.eq("user_id", args.userId);
	if (args?.periodId) query = query.eq("payroll_period_id", args.periodId);

	const { data, error } = await query;
	if (error) throw error;
	return data ?? [];
}

// ─── Fetch: Payroll Runs ────────────────────────────────────────────
async function fetchPayrollRuns(periodId?: string) {
	const supabase = createClient();
	let query = supabase
		.from("pos_payroll_runs")
		.select("*")
		.order("run_date", { ascending: false });

	if (periodId) query = query.eq("payroll_period_id", periodId);

	const { data, error } = await query;
	if (error) throw error;
	return data ?? [];
}

async function fetchPayrollRun(runId: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_runs")
		.select("*")
		.eq("id", runId)
		.maybeSingle();

	if (error) throw error;
	return data;
}

// ─── Fetch: Payroll Run Items ───────────────────────────────────────
async function fetchPayrollRunItems(runId: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_run_items")
		.select("*")
		.eq("payroll_run_id", runId)
		.order("user_name", { ascending: true });

	if (error) throw error;
	return data ?? [];
}

// ─── Fetch: Payslips ────────────────────────────────────────────────
async function fetchPayslips(args?: { userId?: string; status?: string }) {
	const supabase = createClient();
	let query = supabase
		.from("pos_payslips")
		.select("*")
		.order("created_at", { ascending: false });

	if (args?.userId) query = query.eq("user_id", args.userId);
	if (args?.status) query = query.eq("status", args.status);

	const { data, error } = await query;
	if (error) throw error;
	return data ?? [];
}

async function fetchPayslipByRunItem(runItemId: string) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payslips")
		.select("*")
		.eq("payroll_run_item_id", runItemId)
		.maybeSingle();

	if (error) throw error;
	return data;
}

// ─── Fetch: Payroll Audit Logs ──────────────────────────────────────
async function fetchPayrollAuditLogs(limit = 200) {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_audit_logs")
		.select("*")
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error) throw error;
	return data ?? [];
}

// ─── Fetch: Payroll Staff Active View ───────────────────────────────
async function fetchPayrollStaffActive() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_payroll_staff_active_view")
		.select("*")
		.order("user_name", { ascending: true });

	if (error) throw error;
	return data ?? [];
}

// ─── Fetch: Attendance Payroll Summary View ─────────────────────────
async function fetchAttendancePayrollSummary() {
	const supabase = createClient();
	const { data, error } = await supabase
		.from("pos_attendance_payroll_summary_view")
		.select("*")
		.order("user_name", { ascending: true });

	if (error) throw error;
	return data ?? [];
}

// ─── SQL Operations via Management API ──────────────────────────────
async function getManagementToken(): Promise<string> {
	const fs = await import("fs/promises");
	const token = (await fs.readFile("/home/ubuntu/.supabase/access-token", "utf-8")).trim();
	return token;
}

async function executeSql(query: string): Promise<any> {
	const token = await getManagementToken();
	const res = await fetch(
		`https://api.supabase.com/v1/projects/xaemykhjpkgypqqpfdcb/database/query`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ query }),
		}
	);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Management API error: ${res.status} ${text}`);
	}
	return res.json();
}

// ─── SQL: Generate Payroll Run ───────────────────────────────────────
async function generatePayrollRun(args: {
	periodId: string;
	runName?: string;
	createdBy?: string;
}): Promise<any> {
	const sql = `
		WITH period AS (
			SELECT id, start_date, end_date, period_name
			FROM pos.payroll_periods
			WHERE id = '${args.periodId}'
		),
		new_run AS (
			INSERT INTO pos.payroll_runs (payroll_period_id, run_name, status, created_by)
			VALUES (
				(SELECT id FROM period),
				${args.runName ? `'${args.runName}'` : "NULL"},
				'processing',
				${args.createdBy ? `'${args.createdBy}'` : "NULL"}
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
				s.user_id,
				s.user_name,
				s.role_name,
				s.total_days_worked,
				s.total_shifts,
				s.period_start,
				s.period_end
			FROM pos.pos_attendance_payroll_summary_view s
			WHERE s.period_start >= (SELECT start_date FROM period)
			  AND s.period_end <= (SELECT end_date FROM period)
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
					'base_shift_rate', st.base_shift_rate,
					'monthly_fixed_salary', st.monthly_fixed_salary,
					'daily_allowance', st.daily_allowance,
					'overtime_rate_per_hour', st.overtime_rate_per_hour,
					'shifts', COALESCE(att.total_shifts, 0),
					'days_worked', COALESCE(att.total_days_worked, 0)
				)
			FROM staff st
			LEFT JOIN attendance att ON att.user_id = st.user_id
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
	return executeSql(sql);
}

// ─── SQL: Generate Payslips for a Run ───────────────────────────────
async function generatePayslipsForRun(args: {
	runId: string;
}): Promise<any> {
	const sql = `
		INSERT INTO pos.payslips (
			payroll_run_item_id, user_id, user_name,
			period_name, period_start, period_end,
			gross_pay, deductions, net_pay, breakdown, status
		)
		SELECT
			ri.id,
			ri.user_id,
			ri.user_name,
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
		WHERE ri.payroll_run_id = '${args.runId}'
		ON CONFLICT (payroll_run_item_id) DO UPDATE SET
			gross_pay = EXCLUDED.gross_pay,
			deductions = EXCLUDED.deductions,
			net_pay = EXCLUDED.net_pay,
			breakdown = EXCLUDED.breakdown,
			updated_at = now();
	`;
	return executeSql(sql);
}

// ─── SQL: Update Payslip Status ─────────────────────────────────────
async function updatePayslipStatus(args: {
	payslipId: string;
	status: "sent" | "acknowledged" | "disputed";
}): Promise<any> {
	const statusTimestamp =
		args.status === "sent"
			? "sent_at = now()"
			: args.status === "acknowledged"
				? "acknowledged_at = now()"
				: "";

	const sql = `
		UPDATE pos.payslips
		SET status = '${args.status}', ${statusTimestamp} updated_at = now()
		WHERE id = '${args.payslipId}'
		RETURNING *;
	`;
	return executeSql(sql);
}

// ─── SQL: Approve Payroll Run ───────────────────────────────────────
async function approvePayrollRun(args: {
	runId: string;
	approvedBy?: string;
}): Promise<any> {
	const sql = `
		UPDATE pos.payroll_runs
		SET status = 'completed',
		    completed_at = now(),
		    metadata = jsonb_set(
				COALESCE(metadata, '{}'),
				'{approved_by}',
				${args.approvedBy ? `'"${args.approvedBy}"'` : "'null'"}
			),
		    updated_at = now()
		WHERE id = '${args.runId}'
		RETURNING *;
	`;
	return executeSql(sql);
}

// ─── SQL: Reverse Payroll Run ───────────────────────────────────────
async function reversePayrollRun(args: { runId: string }): Promise<any> {
	const sql = `
		UPDATE pos.payroll_runs
		SET status = 'reversed', updated_at = now()
		WHERE id = '${args.runId}'
		RETURNING *;
	`;
	return executeSql(sql);
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTED HOOKS
// ═══════════════════════════════════════════════════════════════════

/** All payroll periods, newest first */
export function useHybridPayrollPeriods() {
	return useSupabaseValue(
		"payroll-periods",
		() => fetchPayrollPeriods(),
		[]
	) as any;
}

/** Single payroll period by ID */
export function useHybridPayrollPeriod(id?: string) {
	return useSupabaseValue(
		`payroll-period:${id ?? "skip"}`,
		() => (id ? fetchPayrollPeriod(id) : Promise.resolve(null)),
		[id]
	) as any;
}

/** All payroll role rules */
export function useHybridPayrollRoleRules() {
	return useSupabaseValue(
		"payroll-role-rules",
		() => fetchPayrollRoleRules(),
		[]
	) as any;
}

/** Active payroll role rule for a specific role */
export function useHybridActivePayrollRoleRule(sourceRoleId?: string) {
	return useSupabaseValue(
		`payroll-active-role-rule:${sourceRoleId ?? "skip"}`,
		() =>
			sourceRoleId
				? fetchActivePayrollRoleRule(sourceRoleId)
				: Promise.resolve(null),
		[sourceRoleId]
	) as any;
}

/** Payroll user overrides, optionally filtered */
export function useHybridPayrollUserOverrides(args?: {
	userId?: string;
	periodId?: string;
}) {
	return useSupabaseValue(
		`payroll-user-overrides:${args?.userId ?? ""}:${args?.periodId ?? ""}`,
		() => fetchPayrollUserOverrides(args),
		[args?.userId, args?.periodId]
	) as any;
}

/** Payroll runs, optionally filtered by period */
export function useHybridPayrollRuns(periodId?: string) {
	return useSupabaseValue(
		`payroll-runs:${periodId ?? "all"}`,
		() => fetchPayrollRuns(periodId),
		[periodId]
	) as any;
}

/** Single payroll run by ID */
export function useHybridPayrollRun(runId?: string) {
	return useSupabaseValue(
		`payroll-run:${runId ?? "skip"}`,
		() => (runId ? fetchPayrollRun(runId) : Promise.resolve(null)),
		[runId]
	) as any;
}

/** All items (employee rows) for a specific payroll run */
export function useHybridPayrollRunItems(runId?: string) {
	return useSupabaseValue(
		`payroll-run-items:${runId ?? "skip"}`,
		() =>
			runId ? fetchPayrollRunItems(runId) : Promise.resolve(null),
		[runId]
	) as any;
}

/** Payslips, optionally filtered by user and/or status */
export function useHybridPayslips(args?: {
	userId?: string;
	status?: string;
}) {
	return useSupabaseValue(
		`payroll-payslips:${args?.userId ?? ""}:${args?.status ?? ""}`,
		() => fetchPayslips(args),
		[args?.userId, args?.status]
	) as any;
}

/** Single payslip by run item ID */
export function useHybridPayslipByRunItem(runItemId?: string) {
	return useSupabaseValue(
		`payroll-payslip-by-runitem:${runItemId ?? "skip"}`,
		() =>
			runItemId
				? fetchPayslipByRunItem(runItemId)
				: Promise.resolve(null),
		[runItemId]
	) as any;
}

/** Payroll audit trail */
export function useHybridPayrollAuditLogs(limit = 200) {
	return useSupabaseValue(
		`payroll-audit-logs:${limit}`,
		() => fetchPayrollAuditLogs(limit),
		[limit]
	) as any;
}

/** Active staff with current payroll role rules */
export function useHybridPayrollStaffActive() {
	return useSupabaseValue(
		"payroll-staff-active",
		() => fetchPayrollStaffActive(),
		[]
	) as any;
}

/** Aggregated attendance summary for payroll calculations */
export function useHybridAttendancePayrollSummary() {
	return useSupabaseValue(
		"payroll-attendance-summary",
		() => fetchAttendancePayrollSummary(),
		[]
	) as any;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTED ACTIONS (SQL via Management API)
// ═══════════════════════════════════════════════════════════════════

export {
	generatePayrollRun,
	generatePayslipsForRun,
	updatePayslipStatus,
	approvePayrollRun,
	reversePayrollRun,
	executeSql as executePayrollSql,
};
