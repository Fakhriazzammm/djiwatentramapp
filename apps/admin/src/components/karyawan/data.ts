import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { invokeDirectFetch } from "@/lib/api-helper";
import { buildDashboardRange, type DashboardPeriodKey, type DashboardRange } from "@/lib/dashboard-periods";
import { analyzeAttendance, wibParts, type AttendanceAnalysis, type AttendanceLog, type ScheduleLite } from "@/lib/karyawan-analytics";
import { DAY_MS } from "@/lib/wib-utils";

export type DirectoryContract = { id: string; registrationNumber: string | null; status: string; pdfUrl: string | null };
export type DirectoryRow = {
	_id: string;
	name: string;
	username: string;
	initial?: string;
	slug?: string;
	photoUrl?: string | null;
	roleId?: string | null;
	roleName: string;
	isActive: boolean;
	hasFace?: boolean;
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

/** Direktori karyawan (RPC admin_employee_directory) dengan sesi admin. */
export function useDirectory() {
	const { token } = useYumiAuth();
	const [state, setState] = useState<{ token: string; rows?: DirectoryRow[]; error?: string }>();
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!token) return;
		const controller = new AbortController();
		void (async () => {
			try {
				const { data, error } = await createClient().rpc("admin_employee_directory", { session_token: token }).abortSignal(controller.signal);
				if (error) throw error;
				if (!controller.signal.aborted) setState({ token, rows: (data ?? []) as DirectoryRow[] });
			} catch {
				if (!controller.signal.aborted) setState({ token, error: "Data karyawan belum dapat dimuat. Coba lagi atau masuk ulang." });
			}
		})();
		return () => controller.abort();
	}, [token, tick]);
	const current = state?.token === token ? state : undefined;
	const reload = useCallback(() => setTick((v) => v + 1), []);
	return { rows: current?.rows, error: current?.error ?? (token ? undefined : "Sesi admin tidak tersedia."), reload, loading: !current };
}

export type ScheduleRow = ScheduleLite & { _id?: string };

type Bundle = { logs: AttendanceLog[]; schedules: ScheduleRow[] };

async function loadBundle(range: DashboardRange): Promise<Bundle> {
	const supabase = createClient();
	const first = range.start === 0 ? 0 : range.start - DAY_MS;
	const logsQuery = supabase.from("pos_attendance_logs").select("userId,type,timestamp,location,penalty:raw->>penaltyAmount").gte("timestamp", first).lt("timestamp", range.end).order("timestamp", { ascending: true }).limit(20000);
	const startDate = range.start === 0 ? "2020-01-01" : wibParts(range.start).date;
	const endDate = wibParts(range.end - 1).date;
	const schedQuery = supabase.from("pos_attendance_schedules").select("userId,date,shiftName,startTime,endTime,status").gte("date", startDate).lte("date", endDate).limit(20000);
	const [logs, scheds] = await Promise.all([logsQuery, schedQuery]);
	if (logs.error) throw logs.error;
	if (scheds.error) throw scheds.error;
	return {
		logs: (logs.data ?? []).map((r: any) => ({ userId: String(r.userId), type: String(r.type), timestamp: Number(r.timestamp), location: r.location && typeof r.location === "object" ? { lat: Number(r.location.lat), lng: Number(r.location.lng) } : null, penalty: Number(r.penalty ?? 0) || 0 })),
		schedules: (scheds.data ?? []).map((r: any) => ({ userId: String(r.userId), date: String(r.date), shiftName: String(r.shiftName ?? ""), startTime: r.startTime ?? null, endTime: r.endTime ?? null, status: r.status ?? null })),
	};
}

/** Absensi + jadwal untuk periode dashboard, dianalisis (terlambat, jam, heatmap, tren). Live. */
export function useAttendanceAnalysis(period: DashboardPeriodKey) {
	const range = useMemo(() => buildDashboardRange(period), [period]);
	const bundle = useSupabaseLiveValue<Bundle>(`karyawan-attendance:${period}`, () => loadBundle(range), [period], { realtimeSchemas: ["public", "pos"], refreshMs: 30000 });
	const previous = useMemo(() => (range.previous ? ({ ...range, start: range.previous.start, end: range.previous.end }) : null), [range]);
	const prevBundle = useSupabaseLiveValue<Bundle>(`karyawan-attendance-prev:${period}`, () => (previous ? loadBundle(previous) : Promise.resolve({ logs: [], schedules: [] })), [period], { refreshMs: 60000 });
	const site = useHybridSiteSettings() as { attendanceLat?: number; attendanceLng?: number; attendanceRadius?: number } | null | undefined;
	const geofence = useMemo(() => (site && typeof site.attendanceLat === "number" && typeof site.attendanceLng === "number" ? { lat: site.attendanceLat, lng: site.attendanceLng, radius: Number(site.attendanceRadius ?? 100) } : null), [site]);
	const analysis: AttendanceAnalysis | null = useMemo(() => (bundle ? analyzeAttendance(bundle.logs, bundle.schedules, { start: range.start, end: range.end, bucket: range.trendBucket, geofence }) : null), [bundle, range, geofence]);
	const prevAnalysis: AttendanceAnalysis | null = useMemo(() => (prevBundle && previous ? analyzeAttendance(prevBundle.logs, prevBundle.schedules, { start: previous.start, end: previous.end, bucket: range.trendBucket, geofence }) : null), [prevBundle, previous, range.trendBucket, geofence]);
	return { range, analysis, prevAnalysis, geofence, loading: bundle === undefined, error: bundle === null, rawLogs: bundle?.logs ?? [], schedules: bundle?.schedules ?? [] };
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
	reviewed_by?: string | null;
	review_notes?: string | null;
	created_at?: string | null;
	metadata?: { partner_name?: string | null; covers?: { date: string; coverName?: string }[] } | null;
};

export type CoverCandidate = { userId: string; name: string; roleName: string; sameRole: boolean; state: "off" | "unscheduled"; weekShifts: number };
export type CoverDay = {
	date: string;
	state: "needs" | "covered" | "off" | "no_schedule";
	past?: boolean;
	shift?: { name: string; start: string; end: string };
	candidates?: CoverCandidate[];
	coverUserId?: string;
	coverName?: string;
};

const leaveUrl = () => `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1/leave-admin`;

export function useLeave() {
	const { token } = useYumiAuth();
	const [rows, setRows] = useState<LeaveRow[] | undefined>(undefined);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const [busy, setBusy] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		if (!token) {
			setError("Sesi admin tidak tersedia. Silakan login ulang.");
			return;
		}
		setError(null);
		void invokeDirectFetch<{ data?: LeaveRow[] }>(leaveUrl(), {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ action: "list" }),
		})
			.then((result) => active && setRows(Array.isArray(result.data) ? result.data : []))
			.catch(() => active && setError("Data Cuti & Izin belum dapat dimuat. Sesi admin atau permission tidak valid."));
		return () => {
			active = false;
		};
	}, [token, tick]);

	const decide = useCallback(
		async (requestId: string, action: "approve" | "reject") => {
			if (!token || busy) return false;
			setBusy(requestId);
			try {
				await invokeDirectFetch(leaveUrl(), {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
					body: JSON.stringify({ action, requestId }),
				});
				setTick((v) => v + 1);
				return true;
			} catch {
				setError("Status belum berubah. Pengajuan mungkin sudah diproses admin lain.");
				return false;
			} finally {
				setBusy(null);
			}
		},
		[token, busy],
	);

	const LEAVE_TYPES = ["cuti", "izin", "sakit", "other"];
	const leaveRows = useMemo(() => rows?.filter((r) => LEAVE_TYPES.includes(r.leave_type)), [rows]);
	const swapRows = useMemo(() => (rows ?? []).filter((r) => r.leave_type === "tukar_shift" || r.leave_type === "pengganti_shift"), [rows]);
	return { rows: leaveRows, swaps: swapRows, error, busy, decide, reload: useCallback(() => setTick((v) => v + 1), []) };
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

/** Rencana pengganti shift untuk satu pengajuan izin/sakit/cuti (fungsi leave-admin). */
export function useCoverPlan(requestId: string | null) {
	const { token } = useYumiAuth();
	const [days, setDays] = useState<CoverDay[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [tick, setTick] = useState(0);
	const [busy, setBusy] = useState<string | null>(null);
	const post = useCallback(async <T,>(body: Record<string, unknown>) => {
		if (!token) throw new Error("Sesi admin tidak tersedia.");
		return invokeDirectFetch<T>(leaveUrl(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
	}, [token]);

	useEffect(() => {
		let active = true;
		setDays(null);
		setError(null);
		if (!requestId) return;
		void post<{ data?: { days?: CoverDay[] } }>({ action: "coverPlan", requestId })
			.then((r) => active && setDays(r.data?.days ?? []))
			.catch(() => active && setError("Rencana pengganti belum dapat dimuat."));
		return () => { active = false; };
	}, [requestId, post, tick]);

	const assign = useCallback(async (date: string, coverUserId: string) => {
		if (!requestId) return { ok: false, message: "Pengajuan tidak dipilih" };
		setBusy(date);
		try {
			const r = await post<{ data?: { coverName?: string; shift?: string } }>({ action: "assignCover", requestId, date, coverUserId });
			setTick((v) => v + 1);
			return { ok: true, message: `${r.data?.coverName ?? "Rekan"} ditugaskan menggantikan (${r.data?.shift ?? ""})` };
		} catch (e) {
			return { ok: false, message: e instanceof Error && e.message ? e.message : "Penugasan gagal. Jadwal mungkin sudah berubah." };
		} finally { setBusy(null); }
	}, [requestId, post]);

	const remove = useCallback(async (date: string) => {
		if (!requestId) return false;
		setBusy(date);
		try { await post({ action: "uncover", requestId, date }); setTick((v) => v + 1); return true; } catch { return false; } finally { setBusy(null); }
	}, [requestId, post]);

	return { days, error, busy, assign, remove, reload: useCallback(() => setTick((v) => v + 1), []) };
}
