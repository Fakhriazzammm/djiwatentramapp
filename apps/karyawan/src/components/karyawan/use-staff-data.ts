import { useEffect, useState } from "react";
import { createClient } from "@djiwaapps/web-shared/lib/client";

export type RunItem = { shift_pay: number; daily_allowance_total: number; overtime_pay: number; bonus_pay: number; fixed_salary: number; gross_pay: number; deductions: number; net_pay: number; total_shifts: number; attendance_days: number; overtime_hours: number };
export type Schedule = { date: string; shift_name: string; start_time: string | null; end_time: string | null; status: string; user_id?: string };

const wibDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
export const todayWib = () => wibDate(0);

/** Latest payroll run item for the staff (live accrual: trigger updates it on every check-out). */
export function useLatestRunItem(staffId?: string) {
	const [item, setItem] = useState<RunItem | null | undefined>(undefined);
	useEffect(() => {
		if (!staffId) return;
		let off = false;
		createClient().schema("pos").from("payroll_run_items")
			.select("shift_pay,daily_allowance_total,overtime_pay,bonus_pay,fixed_salary,gross_pay,deductions,net_pay,total_shifts,attendance_days,overtime_hours")
			.eq("user_id", staffId).order("created_at", { ascending: false }).limit(1)
			.then(({ data }) => { if (!off) setItem((data?.[0] as RunItem | undefined) ?? null); }, () => { if (!off) setItem(null); });
		return () => { off = true; };
	}, [staffId]);
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
