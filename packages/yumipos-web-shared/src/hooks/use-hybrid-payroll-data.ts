import { createClient } from "../lib/client";
import { useSupabaseLiveValue } from "./use-supabase-live-value";
import { invokeEdgeFunction } from "../lib/api-helper";

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

// ─── Constants ──────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://supabase.yumme.id";

// ─── Edge Function Helper ────────────────────────────
// Replaces the broken executeSql() which used Node.js fs/promises in the browser.
// All write operations now go through the generate-payroll Edge Function
// which uses the service_role key on the server side.
async function invokePayrollAction(action: string, payload: Record<string, unknown> = {}) {
	return invokeEdgeFunction("generate-payroll", { action, ...payload });
}

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

// ─── SQL Operations via Edge Function ────────────────
// These replace the old executeSql() which used Node.js fs/promises (broken in browser).

async function generatePayrollRun(args: {
	periodId: string;
	runName?: string;
	createdBy?: string;
}): Promise<any> {
	return invokePayrollAction("generate_for_period", { periodId: args.periodId });
}

async function generatePayslipsForRun(args: {
	runId: string;
}): Promise<any> {
	return invokePayrollAction("generate_payslips_for_run", { runId: args.runId });
}

async function updatePayslipStatus(args: {
	payslipId: string;
	status: "sent" | "acknowledged" | "disputed";
}): Promise<any> {
	return invokePayrollAction("update_payslip_status", {
		payslipId: args.payslipId,
		status: args.status,
	});
}

async function approvePayrollRun(args: {
	runId: string;
	approvedBy?: string;
}): Promise<any> {
	return invokePayrollAction("approve_run", {
		runId: args.runId,
		approvedBy: args.approvedBy,
	});
}

async function updatePayrollRunItem(args: {
	runItemId: string;
	field: string;
	value: number;
}): Promise<any> {
	return invokePayrollAction("update_run_item", {
		runItemId: args.runItemId,
		field: args.field,
		value: args.value,
	});
}

async function syncPayslipFromRunItem(args: {
	runItemId: string;
	payslipId: string;
}): Promise<any> {
	return invokePayrollAction("sync_payslip_from_run_item", {
		runItemId: args.runItemId,
		payslipId: args.payslipId,
	});
}

async function executePayrollSql(query: string): Promise<any> {
	return invokePayrollAction("raw_sql", { query });
}

async function reversePayrollRun(args: { runId: string }): Promise<any> {
	// Use raw_sql since there's no specific action for reverse
	return executePayrollSql(`
		UPDATE pos.payroll_runs
		SET status = 'reversed', updated_at = now()
		WHERE id = '${args.runId}'
		RETURNING *;
	`);
}

async function autoDetectPeriodAndRun(): Promise<{
	action: "created" | "ran" | "generated" | "skipped" | "error";
	message: string;
	periodId?: string;
	runId?: string;
}> {
	try {
		const result = await invokePayrollAction("auto_detect") as Record<string, unknown>;
		return {
			action: (result.action ?? "error") as "created" | "ran" | "generated" | "skipped" | "error",
			message: String(result.message ?? result.error ?? "Unknown error"),
			periodId: result.periodId as string | undefined,
			runId: result.runId as string | undefined,
		};
	} catch (err: any) {
		return {
			action: "error",
			message: err?.message ?? String(err),
		};
	}
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
	autoDetectPeriodAndRun,
	updatePayrollRunItem,
	syncPayslipFromRunItem,
	executePayrollSql,
};
