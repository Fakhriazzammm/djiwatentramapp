import { useEffect, useState } from "react";
import { createClient } from "@djiwaapps/web-shared/lib/client";

export type RunItem = { shift_pay: number; daily_allowance_total: number; overtime_pay: number; bonus_pay: number; fixed_salary: number; gross_pay: number; deductions: number; net_pay: number; total_shifts: number; attendance_days: number; overtime_hours: number };
export type Schedule = { date: string; shift_name: string; start_time: string | null; end_time: string | null; status: string; user_id?: string };

const wibDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
export const todayWib = () => wibDate(0);

/** Latest payroll run item for the staff (live accrual: trigger updates it on every check-out). */
export function useLatestRunItem(staffId?: string, refreshKey = 0) {
	const [item, setItem] = useState<RunItem | null | undefined>(undefined);
	useEffect(() => {
		if (!staffId) return;
		let off = false;
		const sb = createClient();
		const load = () => sb.schema("pos").from("payroll_run_items")
			.select("shift_pay,daily_allowance_total,overtime_pay,bonus_pay,fixed_salary,gross_pay,deductions,net_pay,total_shifts,attendance_days,overtime_hours")
			.eq("user_id", staffId).order("created_at", { ascending: false }).limit(1)
			.then(({ data }) => { if (!off) setItem((data?.[0] as RunItem | undefined) ?? null); }, () => { if (!off) setItem((v) => v ?? null); });
		void load();
		// Realtime: perubahan baris gaji sendiri (dipicu absen) + cadangan polling 20 detik dan saat tab kembali aktif.
		const ch = sb.channel(`payroll-live-${staffId}`)
			.on("postgres_changes", { event: "*", schema: "pos", table: "payroll_run_items", filter: `user_id=eq.${staffId}` }, () => { void load(); })
			.subscribe();
		const iv = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 20_000);
		const vis = () => { if (document.visibilityState === "visible") void load(); };
		document.addEventListener("visibilitychange", vis);
		return () => { off = true; clearInterval(iv); document.removeEventListener("visibilitychange", vis); void sb.removeChannel(ch); };
	}, [staffId, refreshKey]);
	return item;
}

/** Schedules of the month for one staff (or everyone when staffId is omitted, for the Tim tab). */
export function useMonthSchedules(year: number, month: number, staffId?: string) {
	const [rows, setRows] = useState<Schedule[] | null>(null);
	useEffect(() => {
		let off = false;
		const first = `${year}-${String(month).padStart(2, "0")}-01`;
		const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
		let q = createClient().schema("pos").from("attendance_schedules").select("date,shift_name,start_time,end_time,status,user_id").gte("date", first).lte("date", last);
		if (staffId) q = q.eq("user_id", staffId);
		q.then(({ data }) => { if (!off) setRows((data as Schedule[]) ?? []); }, () => { if (!off) setRows([]); });
		return () => { off = true; };
	}, [year, month, staffId]);
	return rows;
}

export const isOffShift = (s?: Pick<Schedule, "shift_name" | "status"> | null) => !s || /off|libur/i.test(s.shift_name) || s.status === "off";
export const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : "");
export const rupiah = (n: number) => `Rp${Math.round(n || 0).toLocaleString("id-ID")}`;

export function useTopAnnouncement() {
	const [a, setA] = useState<{ title: string; subtitle: string | null } | null>(null);
	useEffect(() => {
		let off = false;
		createClient().from("announcements").select("title,subtitle").eq("is_active", true).order("priority", { ascending: false }).limit(1).maybeSingle()
			.then(({ data }) => { if (!off && data) setA(data as { title: string; subtitle: string | null }); }, () => undefined);
		return () => { off = true; };
	}, []);
	return a;
}

export const fmtClock = (secs: number) => {
	const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export type TodayAttendance = {
	loading: boolean;
	isIn: boolean;
	finished: boolean;
	lastIn: number | null;
	lastOut: number | null;
	sched: Schedule | null;
	/** Ada jadwal bulan ini, tapi tidak ada shift aktif hari ini. */
	noScheduleToday: boolean;
	/** Kemarin (atau hari lalu) check-in tanpa check-out. */
	forgotOut: { date: string; checkIn: number } | null;
	reload: () => void;
};

/** Status absen hari ini untuk satu karyawan: dipakai tombol tengah tab bar dan Beranda. */
export function useTodayAttendance(staffId?: string, refreshKey = 0): TodayAttendance {
	const [state, setState] = useState<Omit<TodayAttendance, "reload">>({ loading: true, isIn: false, finished: false, lastIn: null, lastOut: null, sched: null, noScheduleToday: false, forgotOut: null });
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!staffId) return;
		let off = false;
		const sb = createClient();
		const today = todayWib();
		const startMs = Date.parse(`${today}T00:00:00+07:00`);
		const yMs = startMs - 3 * 86_400_000;
		(async () => {
			try {
				const [{ data: logs }, { data: sc }] = await Promise.all([
					sb.from("pos_attendance_logs").select("type,timestamp").eq("userId", staffId).gte("timestamp", yMs).order("timestamp", { ascending: true }),
					sb.schema("pos").from("attendance_schedules").select("date,shift_name,start_time,end_time,status").eq("user_id", staffId).gte("date", `${today.slice(0, 8)}01`).lte("date", today),
				]);
				if (off) return;
				const all = (logs ?? []) as { type: string; timestamp: number }[];
				const todays = all.filter((l) => l.timestamp >= startMs);
				const lastIn = [...todays].reverse().find((l) => l.type === "check_in")?.timestamp ?? null;
				const lastOut = [...todays].reverse().find((l) => l.type === "check_out")?.timestamp ?? null;
				const last = todays[todays.length - 1];
				const isIn = last?.type === "check_in";
				const finished = !!last && last.type === "check_out";
				const rows = (sc ?? []) as Schedule[];
				const sched = rows.find((r) => r.date === today && !isOffShift(r)) ?? null;
				// Check-in sebelum hari ini yang belum ditutup check-out = lupa absen keluar.
				const before = all.filter((l) => l.timestamp < startMs);
				const prev = before[before.length - 1];
				const forgotOut = prev?.type === "check_in" ? { date: new Date(prev.timestamp + 7 * 3600_000).toISOString().slice(0, 10), checkIn: prev.timestamp } : null;
				setState({ loading: false, isIn, finished, lastIn, lastOut, sched, noScheduleToday: rows.length > 0 && !sched, forgotOut: isIn ? null : forgotOut });
			} catch {
				if (!off) setState((s) => ({ ...s, loading: false }));
			}
		})();
		return () => { off = true; };
	}, [staffId, refreshKey, tick]);
	return { ...state, reload: () => setTick((t) => t + 1) };
}
