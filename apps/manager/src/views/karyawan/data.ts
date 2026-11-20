import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { buildDashboardRange, type DashboardPeriodKey, type DashboardRange } from "../../lib/karyawan/periods";
import { analyzeAttendance, type AttendanceAnalysis, type AttendanceLog, type Geofence, type ScheduleLite } from "../../lib/karyawan/analytics";

/** Lapisan data Karyawan App untuk Manager. Semua lewat /api/manager/* (auth-server). */

export type DirectoryContract = { id: string; registrationNumber: string | null; status: string; pdfUrl: string | null };
export type DirectoryRow = {
	_id: string;
	name: string;
	username: string;
	roleId?: string | null;
	roleName: string;
	isActive: boolean;
	raw: {
		phone?: string | null;
		identityNumber?: string | null;
		birthDate?: string | null;
		address?: string | null;
		startDate?: string | null;
		employmentType?: string | null;
		contractDuration?: number | string | null;
		contractEndDate?: string | null;
		jabatan?: string | null;
		monthlySalary?: number | string | null;
		location?: string | null;
		emergencyContactName?: string | null;
		emergencyContactPhone?: string | null;
		cvUrl?: string | null;
		contracts?: DirectoryContract[] | null;
	};
};

/** Pemuat sederhana dengan muat ulang berkala saat tab terlihat. */
function useRemote<T>(path: string | null, refreshMs = 0) {
	const [data, setData] = useState<T | null | undefined>(undefined);
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!path) { setData(undefined); return; }
		let active = true;
		setData(undefined);
		void api<T>(path).then((r) => active && setData(r)).catch(() => active && setData(null));
		if (!refreshMs) return () => { active = false; };
		const id = window.setInterval(() => { if (document.visibilityState === "visible") void api<T>(path).then((r) => active && setData(r)).catch(() => undefined); }, refreshMs);
		return () => { active = false; window.clearInterval(id); };
	}, [path, tick, refreshMs]);
	return { data, reload: useCallback(() => setTick((v) => v + 1), []) };
}

export function useDirectory() {
	const { data, reload } = useRemote<{ rows: DirectoryRow[] }>("/api/manager/karyawan/directory", 60_000);
	return { rows: data?.rows, error: data === null ? "Data karyawan belum dapat dimuat. Coba lagi atau masuk ulang." : undefined, reload, loading: data === undefined };
}

type Bundle = { logs: AttendanceLog[]; schedules: ScheduleLite[]; geofence: Geofence | null };

function useBundle(range: DashboardRange | null) {
	const path = range ? `/api/manager/karyawan/attendance?start=${range.start}&end=${range.end}` : null;
	return useRemote<Bundle>(path, 30_000).data;
}

export function useAttendanceAnalysis(period: DashboardPeriodKey) {
	const range = useMemo(() => buildDashboardRange(period), [period]);
	const previous = useMemo(() => (range.previous ? { ...range, start: range.previous.start, end: range.previous.end } : null), [range]);
	const bundle = useBundle(range);
	const prevBundle = useBundle(previous);
	const geofence = bundle?.geofence ?? null;
	const analysis: AttendanceAnalysis | null = useMemo(() => (bundle ? analyzeAttendance(bundle.logs, bundle.schedules, { start: range.start, end: range.end, bucket: range.trendBucket, geofence }) : null), [bundle, range, geofence]);
	const prevAnalysis: AttendanceAnalysis | null = useMemo(() => (prevBundle && previous ? analyzeAttendance(prevBundle.logs, prevBundle.schedules, { start: previous.start, end: previous.end, bucket: range.trendBucket, geofence }) : null), [prevBundle, previous, range.trendBucket, geofence]);
	return { range, analysis, prevAnalysis, geofence, loading: bundle === undefined, error: bundle === null };
}

export type LeaveRow = {
	id: string;
	user_id: string;
	user_name?: string | null;
	leave_type: string;
	start_date: string;
	end_date: string;
	reason: string;
	status?: string | null;
	review_notes?: string | null;
	created_at?: string | null;
	metadata?: { partner_name?: string | null; covers?: { date: string; coverName?: string }[] } | null;
};
const LEAVE_TYPES = ["cuti", "izin", "sakit", "other"];

export function useLeave() {
	const { data, reload } = useRemote<{ leaves: LeaveRow[] }>("/api/manager/team", 60_000);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const all = data?.leaves;
	const rows = useMemo(() => all?.filter((r) => LEAVE_TYPES.includes(r.leave_type)), [all]);
	const swaps = useMemo(() => (all ?? []).filter((r) => r.leave_type === "tukar_shift" || r.leave_type === "pengganti_shift"), [all]);
	const decide = useCallback(async (requestId: string, action: "approve" | "reject", note = "") => {
		if (busy) return false;
		setBusy(requestId);
		try {
			await api(`/api/manager/team/leaves/${requestId}`, { method: "POST", body: { status: action === "approve" ? "approved" : "rejected", note } });
			reload();
			return true;
		} catch {
			setError("Status belum berubah. Pengajuan mungkin sudah diproses.");
			return false;
		} finally { setBusy(null); }
	}, [busy, reload]);
	return { rows, swaps, error: data === null ? "Data Cuti & Izin belum dapat dimuat." : error, busy, decide, reload };
}

export type CoverCandidate = { userId: string; name: string; roleName: string; sameRole: boolean; state: string; weekShifts: number };
export type CoverDay = {
	date: string;
	state: "needs" | "covered" | "off" | "no_schedule";
	past?: boolean;
	shift?: { name: string; start: string; end: string };
	candidates?: CoverCandidate[];
	coverUserId?: string;
	coverName?: string;
};

export function useCoverPlan(requestId: string | null) {
	const [days, setDays] = useState<CoverDay[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const [busy, setBusy] = useState<string | null>(null);
	useEffect(() => {
		let active = true;
		setDays(null);
		setError(null);
		if (!requestId) return;
		void api<{ days: CoverDay[] }>(`/api/manager/team/leaves/${requestId}/cover`).then((r) => active && setDays(r.days)).catch(() => active && setError("Rencana pengganti belum dapat dimuat."));
		return () => { active = false; };
	}, [requestId, tick]);
	const assign = useCallback(async (date: string, coverUserId: string) => {
		if (!requestId) return { ok: false, message: "Pengajuan tidak dipilih" };
		setBusy(date);
		try {
			const r = await api<{ coverName?: string; shift?: string }>(`/api/manager/team/leaves/${requestId}/cover`, { method: "POST", body: { date, coverUserId } });
			setTick((v) => v + 1);
			return { ok: true, message: `${r.coverName ?? "Rekan"} ditugaskan menggantikan (${r.shift ?? ""})` };
		} catch (e) {
			const code = (e as { code?: string }).code;
			return { ok: false, message: code === "COVER_BUSY" || code === "COVER_UNAVAILABLE" ? "Rekan ini sudah tidak tersedia di tanggal itu." : "Penugasan gagal. Jadwal mungkin sudah berubah." };
		} finally { setBusy(null); }
	}, [requestId]);
	const remove = useCallback(async (date: string) => {
		if (!requestId) return false;
		setBusy(date);
		try { await api(`/api/manager/team/leaves/${requestId}/cover/${date}`, { method: "DELETE" }); setTick((v) => v + 1); return true; } catch { return false; } finally { setBusy(null); }
	}, [requestId]);
	return { days, error, busy, assign, remove };
}

export type ShiftTemplate = { name: string; openTime: string | null; closeTime: string | null };
export type StaffLite = { id: string; name: string; roleName: string };
export type ScheduleRecord = { id: string; userId: string; date: string; shiftName: string; startTime: string | null; endTime: string | null; status: string; raw: Record<string, unknown> };
export type ScheduleRowInput = { userId: string; date: string; shiftName: string; startTime?: string | null; endTime?: string | null; status?: "scheduled" | "off"; note?: string };

export function useSchedules(from: string, to: string) {
	const { data, reload } = useRemote<{ schedules: ScheduleRecord[]; staff: StaffLite[]; shifts: ShiftTemplate[] }>(`/api/manager/karyawan/schedules?from=${from}&to=${to}`);
	const saveCell = useCallback(async (row: ScheduleRowInput) => { await api("/api/manager/karyawan/schedules/cell", { method: "POST", body: row }); reload(); }, [reload]);
	const clearCell = useCallback(async (userId: string, date: string) => { await api(`/api/manager/karyawan/schedules/cell?userId=${encodeURIComponent(userId)}&date=${date}`, { method: "DELETE" }); reload(); }, [reload]);
	const bulkReplace = useCallback(async (rows: ScheduleRowInput[], userIds: string[], start: string, end: string) => {
		const r = await api<{ inserted: number; deleted: number }>("/api/manager/karyawan/schedules/bulk", { method: "POST", body: { rows, userIds, start, end } });
		reload();
		return r;
	}, [reload]);
	return { schedules: data?.schedules, staff: data?.staff ?? [], shifts: data?.shifts ?? [], loading: data === undefined, error: data === null, saveCell, clearCell, bulkReplace, reload };
}

export type PayrollRow = {
	userId: string; name: string; role: string; shifts: number; days: number; hours: number; overtimeHours: number; fixed: number; shiftPay: number; hourlyPay: number; allowance: number;
	overtime: number; bonus: number; bonusAuto: number; deductions: number; gross: number; net: number; live: boolean;
	adjustments: { id: string; kind: string; amount: number; note: string | null; by: string | null }[]; slip: { id: string; status: string } | null;
	rules: { shiftRate: number; allowance: number; fixed: number; overtimeRate: number; basis: string | null };
};
export type PayrollData = { period: string; rows: PayrollRow[]; policy: { adjustmentLimit: number; stdHours: number }; monthTarget: number; monthRevenue: number };

export function usePayroll(period: string) {
	const { data, reload } = useRemote<PayrollData>(`/api/manager/payroll?period=${period}`, 60_000);
	return { data: data ?? undefined, loading: data === undefined, error: data === null, reload };
}

export const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
export const num = (n: number) => Math.round(n).toLocaleString("id-ID");

export function deltaOf(current: number, previous: number | null | undefined, invert = false): { text: string; direction: "up" | "down" | "flat" | "new" } | undefined {
	if (previous === null || previous === undefined) return undefined;
	if (previous === 0) return current === 0 ? { text: "sama", direction: "flat" } : { text: "baru", direction: "new" };
	const pct = Math.round(((current - previous) / previous) * 100);
	if (pct === 0) return { text: "sama", direction: "flat" };
	const up = pct > 0;
	return { text: `${Math.abs(pct)}%`, direction: (invert ? !up : up) ? "up" : "down" };
}

export function agoText(ts: number, now = Date.now()): string {
	const diff = Math.max(0, now - ts);
	const m = Math.floor(diff / 60_000);
	if (m < 1) return "baru saja";
	if (m < 60) return `${m} mnt lalu`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} jam lalu`;
	return `${Math.floor(h / 24)} hari lalu`;
}
