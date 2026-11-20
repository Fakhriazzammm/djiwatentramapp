import { useMemo, useState } from "react";
import { DASHBOARD_PERIOD_OPTIONS, formatDashboardRangeText, type DashboardPeriodKey } from "../../lib/karyawan/periods";
import { LiveDot } from "./dash-motion";
import { Btn, Chips, DataTable, KpiStrip, LineChart, Note, Page, PageHead, Panel, PeriodBar, ProgressList, SectionTitle, SourceError, StatusTag } from "./kit";
import { deltaOf, num, rupiah, useAttendanceAnalysis, useDirectory, useLeave, usePayroll } from "./data";
import { fmtDate } from "./team";

const PERIODS = DASHBOARD_PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
type Tab = "kehadiran" | "payroll" | "lembur" | "cuti" | "turnover";
type PayRow = { _id: string; name: string; roleName: string; daysWorked: number; totalHours: number; sessionCount: number; monthlyFixedSalary: number; totalShiftSalary: number; totalAllowance: number; totalOvertimeBonus: number; totalTargetBonus: number; totalPenalty: number; netSalary: number; overtimeBonusPerHour: number };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function download(name: string, rows: (string | number)[][]) {
	const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
	const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

const unrealistic = (r: PayRow) => r.daysWorked > 0 && r.totalHours / r.daysWorked > 16;

export default function LaporanPage() {
	const [tab, setTab] = useState<Tab>("kehadiran");
	const [period, setPeriod] = useState<DashboardPeriodKey>("this_month");
	const { range, analysis, prevAnalysis, loading, error } = useAttendanceAnalysis(period);
	const now = new Date();
	const payrollData = usePayroll(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
	const payroll: { rows: PayRow[] } | null | undefined = payrollData.error ? null : payrollData.data ? {
		rows: payrollData.data.rows.map((r) => ({ _id: r.userId, name: r.name, roleName: r.role, daysWorked: r.days, totalHours: r.hours, sessionCount: r.shifts, monthlyFixedSalary: r.fixed, totalShiftSalary: r.shiftPay + r.hourlyPay, totalAllowance: r.allowance, totalOvertimeBonus: r.overtime, totalTargetBonus: r.bonus, totalPenalty: r.deductions, netSalary: r.net, overtimeBonusPerHour: r.rules.overtimeRate })),
	} : undefined;
	const dir = useDirectory();
	const leave = useLeave();
	const rows = (payroll?.rows ?? []).filter((r) => !/^(admin|i040 probe)$/i.test(r.name.trim()));
	const nameOf = useMemo(() => new Map((dir.rows ?? []).map((r) => [r._id, r.name])), [dir.rows]);
	const suspicious = rows.filter(unrealistic);
	const total = rows.reduce((s, r) => s + r.netSalary, 0);
	const overtime = rows.reduce((s, r) => s + r.totalOvertimeBonus, 0);
	const leaveRows = leave.rows ?? [];

	// Headcount berdasarkan tanggal mulai (karyawan aktif saat ini)
	const headcount = useMemo(() => {
		const active = (dir.rows ?? []).filter((r) => r.isActive && r.raw.startDate);
		const labels: string[] = [];
		const values: number[] = [];
		const joins: number[] = [];
		for (let i = 5; i >= 0; i -= 1) {
			const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
			const from = new Date(d.getFullYear(), d.getMonth(), 1);
			labels.push(MONTHS[d.getMonth()].toUpperCase());
			values.push(active.filter((r) => new Date(r.raw.startDate as string) <= d).length);
			joins.push(active.filter((r) => { const s = new Date(r.raw.startDate as string); return s >= from && s <= d; }).length);
		}
		return { labels, values, joins };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dir.rows]);

	const exportCsv = () => {
		if (tab === "kehadiran" && analysis) download(`laporan-kehadiran-${period}.csv`, [["Karyawan", "Hari hadir", "Jam kerja", "Terlambat (kali)", "Terlambat (menit)", "Ketepatan"], ...Object.values(analysis.byUser).map((u) => [nameOf.get(u.userId) ?? u.userId, u.days, u.hours.toFixed(1), u.late, u.lateMinutes, `${u.onTimePct}%`])]);
		else if (tab === "cuti") download("laporan-cuti.csv", [["Karyawan", "Jenis", "Mulai", "Selesai", "Status", "Alasan"], ...leaveRows.map((r) => [r.user_name ?? "", r.leave_type, r.start_date, r.end_date, r.status ?? "pending", r.reason])]);
		else download(`laporan-${tab}.csv`, [["Karyawan", "Jabatan", "Hari", "Jam", "Pokok", "Shift", "Tunjangan", "Lembur", "Bonus", "Potongan", "Bersih"], ...rows.map((r) => [r.name, r.roleName, r.daysWorked, r.totalHours.toFixed(1), r.monthlyFixedSalary, r.totalShiftSalary, r.totalAllowance, r.totalOvertimeBonus, r.totalTargetBonus, r.totalPenalty, r.netSalary])]);
	};

	return (
		<Page>
			<PageHead title="Laporan Karyawan" subtitle="Ringkasan kehadiran, payroll, lembur, cuti, dan komposisi tim." actions={<Btn primary onClick={exportCsv}>Ekspor CSV</Btn>} />
			<PeriodBar id="kk-lap-period" value={period} onChange={setPeriod} options={PERIODS} loading={loading} right={<><span className="inline-flex items-center gap-2"><LiveDot />{formatDashboardRangeText(range)}</span><span>Payroll memakai bulan berjalan</span></>} />
			<Chips value={tab} onChange={setTab} options={[{ value: "kehadiran", label: "Kehadiran" }, { value: "payroll", label: "Payroll" }, { value: "lembur", label: "Lembur" }, { value: "cuti", label: "Cuti" }, { value: "turnover", label: "Komposisi tim" }]} />
			{error ? <SourceError message="Absensi tidak dapat dimuat" /> : null}

			{tab === "kehadiran" ? (
				<>
					<KpiStrip items={[
						{ label: "Karyawan aktif", value: dir.rows ? dir.rows.filter((r) => r.isActive).length : null },
						{ label: "Kehadiran tercatat", value: analysis ? analysis.presence : null, format: num, delta: analysis && prevAnalysis ? deltaOf(analysis.presence, prevAnalysis.presence) : undefined, sub: "hari-orang" },
						{ label: "Sesi check-in", value: analysis ? analysis.sessions.length : null, format: num, sub: analysis && analysis.unclosed ? `${analysis.unclosed} belum ditutup` : "semua tertutup" },
						{ label: "Ketepatan waktu", value: analysis ? `${analysis.onTimePct}%` : null, sub: analysis ? `${analysis.lateCount} terlambat` : undefined },
					]} />
					{analysis && analysis.unclosed > 0 ? <Note>{analysis.unclosed} sesi check-in belum ditutup, sehingga jam kerjanya tidak dihitung. Tutup sesi di halaman Kehadiran agar laporan akurat.</Note> : null}
					<Panel title={<>Tren · {range.label.toLowerCase()}</>}>{analysis && analysis.labels.length ? <LineChart redrawKey={`${period}-${tab}`} labels={analysis.labels} series={[{ name: "Hadir", values: analysis.seriesPresent, color: "#2f6fdf" }, { name: "Terlambat", values: analysis.seriesLate, color: "#d92d20" }]} /> : <div className="bg-[#f6f6f9] p-6 text-center text-[12px] text-[#666672]">{loading ? "Memuat…" : "Belum ada data."}</div>}</Panel>
					<SectionTitle color="#111114" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">akun sistem disaring</span>}>Ringkasan per karyawan</SectionTitle>
					<DataTable
						rows={Object.values(analysis?.byUser ?? {}).filter((u) => nameOf.has(u.userId) && !/^(admin|i040 probe)$/i.test(nameOf.get(u.userId) ?? ""))}
						rowKey={(u) => u.userId}
						empty="Belum ada absensi pada periode ini."
						columns={[
							{ key: "n", header: "Karyawan", render: (u) => <b className="font-medium">{nameOf.get(u.userId)}</b> },
							{ key: "d", header: "Hari kerja", align: "right", render: (u) => u.days },
							{ key: "h", header: "Jam kerja", align: "right", render: (u) => `${u.hours.toFixed(1)} jam` },
							{ key: "l", header: "Terlambat", align: "right", render: (u) => `${u.late}× · ${u.lateMinutes} menit` },
							{ key: "o", header: "Ketepatan", align: "right", render: (u) => <StatusTag tone={u.onTimePct >= 90 ? "ok" : u.onTimePct >= 75 ? "warn" : "bad"}>{u.onTimePct}%</StatusTag> },
							{ key: "u", header: "Sesi menggantung", align: "right", render: (u) => (u.unclosed ? <StatusTag tone="warn">{u.unclosed}</StatusTag> : "—") },
						]}
					/>
				</>
			) : null}

			{tab === "payroll" ? (
				<>
					<KpiStrip items={[
						{ label: "Total gaji bersih", value: payroll ? total : null, format: rupiah, sub: `${rows.filter((r) => r.netSalary > 0).length} karyawan bergaji` },
						{ label: "Baris Rp 0", value: payroll ? rows.filter((r) => r.netSalary <= 0).length : null, sub: "belum ada data gaji" },
						{ label: "Total lembur", value: payroll ? overtime : null, format: rupiah },
						{ label: "Potongan", value: payroll ? rows.reduce((s, r) => s + r.totalPenalty, 0) : null, format: rupiah },
					]} />
					{suspicious.length ? <Note>Jam kerja {suspicious.map((r) => `${r.name} (${r.totalHours.toFixed(0)} jam)`).slice(0, 3).join(", ")} tidak wajar untuk {suspicious[0].daysWorked} hari kerja. Kemungkinan check-in belum ditutup.</Note> : null}
					<DataTable rows={rows} rowKey={(r) => r._id} columns={[
						{ key: "n", header: "Karyawan", render: (r) => <div><div className="font-medium">{r.name}</div><div className="font-mono text-[10px] text-[#666672]">{r.roleName}</div></div> },
						{ key: "d", header: "Hari", align: "right", render: (r) => r.daysWorked },
						{ key: "h", header: "Jam", align: "right", render: (r) => (unrealistic(r) ? <StatusTag tone="bad">{r.totalHours.toFixed(1)}</StatusTag> : r.totalHours.toFixed(1)) },
						{ key: "b", header: "Pokok + shift", align: "right", render: (r) => rupiah(r.monthlyFixedSalary + r.totalShiftSalary) },
						{ key: "t", header: "Tunjangan + bonus", align: "right", render: (r) => rupiah(r.totalAllowance + r.totalTargetBonus) },
						{ key: "o", header: "Lembur", align: "right", render: (r) => rupiah(r.totalOvertimeBonus) },
						{ key: "net", header: "Bersih", align: "right", render: (r) => <b>{rupiah(r.netSalary)}</b> },
					]} />
				</>
			) : null}

			{tab === "lembur" ? (
				<>
					<KpiStrip items={[
						{ label: "Biaya lembur", value: payroll ? overtime : null, format: rupiah },
						{ label: "Jam lembur", value: payroll ? Math.round(rows.reduce((s, r) => s + Math.max(0, r.totalHours - r.sessionCount * 8), 0)) : null, format: num, sub: "jam" },
						{ label: "Karyawan lembur", value: payroll ? rows.filter((r) => r.totalOvertimeBonus > 0).length : null },
						{ label: "Data tidak wajar", value: payroll ? suspicious.length : null, sub: suspicious.length ? "lembur membengkak" : "tidak ada" },
					]} />
					<Panel title="Lembur per karyawan" tone="red"><ProgressList rows={[...rows].filter((r) => r.totalOvertimeBonus > 0).sort((a, b) => b.totalOvertimeBonus - a.totalOvertimeBonus).slice(0, 8).map((r) => ({ label: r.name, value: rupiah(r.totalOvertimeBonus), ratio: r.totalOvertimeBonus / Math.max(1, ...rows.map((x) => x.totalOvertimeBonus)), tone: unrealistic(r) ? ("red" as const) : ("amber" as const) }))} /></Panel>
				</>
			) : null}

			{tab === "cuti" ? (
				<>
					<KpiStrip items={[
						{ label: "Total pengajuan", value: leave.rows ? leaveRows.length : null },
						{ label: "Disetujui", value: leave.rows ? leaveRows.filter((r) => r.status === "approved").length : null },
						{ label: "Menunggu", value: leave.rows ? leaveRows.filter((r) => (r.status ?? "pending") === "pending").length : null },
						{ label: "Ditolak", value: leave.rows ? leaveRows.filter((r) => r.status === "rejected").length : null },
					]} />
					<div className="grid gap-3 lg:grid-cols-2">
						<Panel title="Jenis pengajuan" tone="red"><ProgressList rows={["cuti", "sakit", "izin", "other"].map((t) => { const n = leaveRows.filter((r) => r.leave_type === t).length; return { label: { cuti: "Cuti", sakit: "Sakit", izin: "Izin", other: "Lainnya" }[t] ?? t, value: String(n), ratio: n / Math.max(1, leaveRows.length), tone: t === "sakit" ? ("red" as const) : ("blue" as const) }; })} /></Panel>
						<Panel title="Pengajuan terbaru"><ul className="divide-y divide-[#efeff2] text-[13px]">{leaveRows.slice(0, 6).map((r) => <li key={r.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0 truncate">{r.user_name ?? "Karyawan"} · {fmtDate(r.start_date)}</span><StatusTag tone={r.status === "approved" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>{r.status ?? "pending"}</StatusTag></li>)}</ul></Panel>
					</div>
				</>
			) : null}

			{tab === "turnover" ? (
				<>
					<KpiStrip items={[
						{ label: "Karyawan aktif", value: dir.rows ? dir.rows.filter((r) => r.isActive).length : null },
						{ label: "Nonaktif", value: dir.rows ? dir.rows.filter((r) => !r.isActive).length : null, sub: "akun dinonaktifkan" },
						{ label: "Masuk 6 bulan", value: headcount.joins.reduce((a, b) => a + b, 0), sub: "berdasarkan tanggal mulai" },
						{ label: "Rasio nonaktif", value: dir.rows && dir.rows.length ? `${Math.round((dir.rows.filter((r) => !r.isActive).length / dir.rows.length) * 100)}%` : null, sub: "dari semua akun" },
					]} />
					<Panel title="Headcount aktif · 6 bulan"><LineChart redrawKey="headcount" labels={headcount.labels} series={[{ name: "Karyawan aktif", values: headcount.values, color: "#2f6fdf" }]} /></Panel>
					<p className="font-mono text-[10px] text-[#666672]">Headcount dihitung dari tanggal mulai karyawan yang saat ini aktif. Tanggal keluar belum dicatat, jadi karyawan yang sudah keluar tidak ikut tergambar.</p>
				</>
			) : null}
		</Page>
	);
}
