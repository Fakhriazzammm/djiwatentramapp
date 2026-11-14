import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useHybridStaffLogs } from "@yumipos/web-shared";
import { createClient } from "@yumipos/web-shared/lib/client";
import { DsAvatar, DsGroup, DsGroupLabel, DsIcon, DsRow, DsSegmented, DsTag } from "@yumipos/web-shared/components/ds";
import { useStaffProfile } from "../$username.lazy";
import { hhmm, isOffShift, todayWib, useMonthSchedules } from "@/components/karyawan/use-staff-data";

export const Route = createLazyFileRoute("/$username/jadwal")({
	component: JadwalPage,
});

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const dot = (name: string) => (/sore|siang/i.test(name) ? "#e6890e" : /general|full/i.test(name) ? "#8b5cf6" : "#2fa66a");
const pad = (n: number) => String(n).padStart(2, "0");

function JadwalPage() {
	const { staff, navigate, username, isUnlocked, refreshKey } = useStaffProfile();
	const now = new Date();
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [year, setYear] = useState(now.getFullYear());
	const [tab, setTab] = useState<"pribadi" | "tim">("pribadi");
	const today = todayWib();
	const [sel, setSel] = useState(today);

	const mine = useMonthSchedules(year, month, staff?._id);
	const all = useMonthSchedules(year, month, tab === "tim" ? undefined : "__none__");
	const logs = useHybridStaffLogs(isUnlocked && staff ? { userId: staff._id, month, year, refreshTrigger: refreshKey } : undefined);
	const [names, setNames] = useState<Record<string, string>>({});
	useEffect(() => {
		if (tab !== "tim") return;
		createClient().from("pos_users_public").select("_id,name").then(({ data }) => setNames(Object.fromEntries((data ?? []).map((u: any) => [u._id, u.name]))), () => undefined);
	}, [tab]);

	const byDate = useMemo(() => new Map((mine ?? []).map((s) => [s.date, s])), [mine]);
	const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
	const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const selSched = byDate.get(sel);
	const teamRows = (all ?? []).filter((s) => s.date === sel);

	// Attendance history grouped by WIB date: first check-in, last check-out, late vs schedule.
	const history = useMemo(() => {
		const g = new Map<string, { in?: number; out?: number }>();
		for (const l of (Array.isArray(logs) ? logs : []).slice().sort((a: any, b: any) => a.timestamp - b.timestamp)) {
			const d = new Date(l.timestamp + 7 * 3600_000).toISOString().slice(0, 10);
			const e = g.get(d) ?? {};
			if (l.type === "check_in" && e.in === undefined) e.in = l.timestamp;
			if (l.type === "check_out") e.out = l.timestamp;
			g.set(d, e);
		}
		return [...g.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
	}, [logs]);
	const clock = (ts?: number) => (ts ? new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":") : "—");
	const lateMin = (date: string, ts?: number) => {
		const s = byDate.get(date);
		if (!s?.start_time || !ts) return 0;
		const [h, m] = s.start_time.split(":").map(Number);
		const start = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h - 7, m);
		return Math.max(0, Math.round((ts - start) / 60000));
	};
	const shift = (d: number) => {
		const next = new Date(Date.UTC(year, month - 1 + d, 1));
		const nextYear = next.getUTCFullYear(), nextMonth = next.getUTCMonth() + 1;
		setYear(nextYear);
		setMonth(nextMonth);
		setSel(`${nextYear}-${pad(nextMonth)}-01`);
	};

	return (
		<div>
			<div className="ds-header" style={{ padding: "8px 0 14px" }}><h1 className="ds-grow" style={{ fontSize: 32, letterSpacing: "-.035em" }}>Jadwal</h1></div>
			<DsSegmented value={tab} onChange={setTab} items={[["pribadi", "Pribadi"], ["tim", "Tim"]]} />

			<div style={{ marginTop: 14 }}>
				<DsGroup white>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4, marginBottom: 8 }}>
						<div style={{ display: "flex", alignItems: "center" }}>
							<button type="button" onClick={() => shift(-1)} aria-label="Bulan sebelumnya" style={{ minHeight: 44, minWidth: 30, background: "none", border: 0, fontSize: 20 }}>‹</button>
							<b style={{ fontSize: 17, whiteSpace: "nowrap" }}>{MONTHS[month - 1]} {year}</b>
							<button type="button" onClick={() => shift(1)} aria-label="Bulan berikutnya" style={{ minHeight: 44, minWidth: 30, background: "none", border: 0, fontSize: 20 }}>›</button>
						</div>
						<div className="ds-sub" style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", fontSize: 11 }}>
							{[["#2fa66a", "Pagi"], ["#e6890e", "Sore"], ["#aab0bf", "Off"]].map(([color, label]) => <span key={label} style={{ whiteSpace: "nowrap" }}><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, marginRight: 3 }} />{label}</span>)}
						</div>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center" }}>
						{DAYS.map((d) => <div key={d} style={{ font: "600 11px var(--ds-font)", color: "var(--ds-faint)", padding: "6px 0" }}>{d}</div>)}
						{Array.from({ length: first }).map((_, i) => <div key={`e${i}`} />)}
						{Array.from({ length: days }).map((_, i) => {
							const d = i + 1, key = `${year}-${pad(month)}-${pad(d)}`, s = byDate.get(key), isToday = key === today;
							return (
								<button key={key} type="button" onClick={() => setSel(key)} style={{ position: "relative", minHeight: 44, border: 0, borderRadius: 14, font: `${isToday ? 700 : 500} 15px var(--ds-font)`, background: isToday ? "var(--ds-navy)" : "none", color: isToday ? "#fff" : "inherit", boxShadow: key === sel ? "inset 0 0 0 2px var(--ds-navy)" : undefined }}>
									{d}
									{s && <i style={{ position: "absolute", left: "50%", bottom: 5, width: 5, height: 5, borderRadius: "50%", transform: "translateX(-50%)", background: isOffShift(s) ? "#aab0bf" : dot(s.shift_name) }} />}
								</button>
							);
						})}
					</div>
				</DsGroup>
			</div>

			{tab === "pribadi" ? (
				<>
					<DsGroupLabel>{new Date(sel).toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "UTC" })}</DsGroupLabel>
					<DsGroup flush>
						<DsRow icon={<DsIcon name="work-schedule" />} title={selSched ? selSched.shift_name : "Tidak ada jadwal"} sub={selSched && !isOffShift(selSched) ? `${hhmm(selSched.start_time)}${selSched.end_time ? ` – ${hhmm(selSched.end_time)}` : ""}` : "Hari libur"} trail={selSched && !isOffShift(selSched) ? <DsTag tone="ok">Shift</DsTag> : <DsTag>Off</DsTag>} />
					</DsGroup>
				</>
			) : (
				<>
					<DsGroupLabel>Tim · {new Date(sel).toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "UTC" })}</DsGroupLabel>
					<DsGroup flush>
						{teamRows.length === 0 && <div className="ds-sub" style={{ padding: "14px 0" }}>Belum ada jadwal tim untuk tanggal ini.</div>}
						{teamRows.map((s) => <DsRow key={`${s.user_id}-${s.shift_name}`} icon={<DsAvatar name={names[s.user_id ?? ""] ?? "?"} size={40} />} title={names[s.user_id ?? ""] ?? "Karyawan"} trail={<DsTag tone={isOffShift(s) ? undefined : "ok"}>{s.shift_name}</DsTag>} />)}
					</DsGroup>
				</>
			)}

			<DsGroupLabel action={<button type="button" onClick={() => navigate({ to: "/$username/rekap-absensi" as any, params: { username } })}>Rekap lengkap</button>}>Riwayat kehadiran</DsGroupLabel>
			<DsGroup flush>
				{history.length === 0 && <div className="ds-sub" style={{ padding: "14px 0" }}>Belum ada riwayat bulan ini.</div>}
				{history.map(([date, e]) => {
					const late = lateMin(date, e.in);
					return <DsRow key={date} icon={<DsIcon name="employee-attendance-check-in" />} title={new Date(date).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })} sub={`${clock(e.in)} – ${clock(e.out)}`} trail={!e.in ? <DsTag>Tanpa absen masuk</DsTag> : late > 5 ? <DsTag tone="warn">Telat {late} mnt</DsTag> : <DsTag tone="ok">Tepat waktu</DsTag>} />;
				})}
			</DsGroup>
		</div>
	);
}
