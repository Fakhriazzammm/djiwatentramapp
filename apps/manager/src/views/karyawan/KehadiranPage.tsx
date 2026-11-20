import { useNavigate } from "./nav";
import { useMemo, useState } from "react";
import { DASHBOARD_PERIOD_OPTIONS, formatDashboardRangeText, type DashboardPeriodKey } from "../../lib/karyawan/periods";
import { WEEKDAY_SHORT } from "../../lib/karyawan/analytics";
import { LiveDot } from "./dash-motion";
import { Btn, Feed, Heatmap, KpiStrip, LineChart, Page, PageHead, Panel, PeriodBar, ProgressList, SourceError, StatusTag, type FeedItem } from "./kit";
import { agoText, deltaOf, num, useAttendanceAnalysis, useDirectory } from "./data";

const PERIODS = DASHBOARD_PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
const clock = (ts: number) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(ts).replace(".", ":");

export default function KehadiranPage() {
	const navigate = useNavigate();
	const [period, setPeriod] = useState<DashboardPeriodKey>("this_week");
	const { range, analysis, prevAnalysis, geofence, loading, error } = useAttendanceAnalysis(period);
	const dir = useDirectory();
	const nameOf = useMemo(() => new Map((dir.rows ?? []).map((r) => [r._id, r.name])), [dir.rows]);

	const staleSessions = useMemo(() => (analysis ? analysis.sessions.filter((s) => !s.closed && Date.now() - s.inTs > 16 * 3_600_000).sort((a, b) => b.inTs - a.inTs) : []), [analysis]);
	const ranking = useMemo(() => (analysis ? Object.values(analysis.byUser).filter((u) => u.sessions > 0).sort((a, b) => b.onTimePct - a.onTimePct || b.days - a.days).slice(0, 8) : []), [analysis]);
	const feed: FeedItem[] = useMemo(() => {
		if (!analysis) return [];
		return [...analysis.sessions].sort((a, b) => b.inTs - a.inTs).slice(0, 8).map((s) => ({
			source: s.outsideRadius ? "Lokasi" : s.lateMin > 0 ? "Terlambat" : s.closed ? "Selesai" : "Masuk",
			tone: s.outsideRadius || s.lateMin > 0 ? ("amber" as const) : s.closed ? ("blue" as const) : ("green" as const),
			text: `${nameOf.get(s.userId) ?? "Karyawan"} · ${s.shiftName ?? "tanpa jadwal"} · ${clock(s.inTs)}${s.lateMin > 0 ? ` · ${s.lateMin} menit` : ""}${s.outsideRadius ? ` · ${s.distanceM} m di luar radius` : ""}`,
			time: agoText(s.inTs),
		}));
	}, [analysis, nameOf]);

	const exportCsv = () => {
		if (!analysis) return;
		const rows = [["Nama", "Tanggal", "Masuk", "Pulang", "Shift", "Terlambat (menit)", "Jam"], ...analysis.sessions.map((s) => [nameOf.get(s.userId) ?? s.userId, s.date, clock(s.inTs), s.outTs ? clock(s.outTs) : "", s.shiftName ?? "", String(s.lateMin), s.hours.toFixed(2)])];
		const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `kehadiran-${period}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<Page>
			<PageHead title="Kehadiran" subtitle="Absensi langsung, pola jam masuk, dan sesi yang perlu dirapikan." actions={<><Btn onClick={() => void navigate({ to: "/admin/operational-team/attendance/pengaturan" })}>Pengaturan</Btn><Btn primary onClick={exportCsv} disabled={!analysis}>Ekspor CSV</Btn></>} />
			<PeriodBar id="kk-att-period" value={period} onChange={setPeriod} options={PERIODS} loading={loading} right={<><span className="inline-flex items-center gap-2"><LiveDot />{formatDashboardRangeText(range)}</span><span>Diperbarui otomatis</span></>} />
			{error ? <SourceError message="Absensi tidak dapat dimuat" /> : null}
			<KpiStrip cols={5} items={[
				{ label: "Kehadiran tercatat", value: analysis ? analysis.presence : null, format: num, delta: analysis && prevAnalysis ? deltaOf(analysis.presence, prevAnalysis.presence) : undefined, sub: "hari-orang" },
				{ label: "Terlambat", value: analysis ? analysis.lateCount : null, format: num, delta: analysis && prevAnalysis ? deltaOf(analysis.lateCount, prevAnalysis.lateCount, true) : undefined, sub: analysis ? `rata-rata ${analysis.lateAvgMin} menit` : undefined },
				{ label: "Ketepatan waktu", value: analysis ? `${analysis.onTimePct}%` : null, sub: "toleransi 10 menit" },
				{ label: "Di luar radius", value: analysis ? analysis.outside : null, format: num, sub: geofence ? `radius ${geofence.radius} m dari lokasi` : "lokasi belum diatur" },
				{ label: "Sesi belum ditutup", value: analysis ? analysis.unclosed : null, format: num, sub: analysis && analysis.unclosed > 0 ? "jam dihitung sampai akhir shift" : "semua sesi tertutup" },
			]} />

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
				<Panel title="Pola jam masuk · hari × jam">
					{analysis && analysis.sessions.length ? <><Heatmap label="Peta panas jam masuk" rows={[...WEEKDAY_SHORT]} cols={analysis.heatCols} matrix={analysis.heat} /><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-[#666672]">Makin gelap = makin banyak karyawan masuk pada jam itu.</p></> : <div className="bg-[#f6f6f9] p-6 text-center text-[12px] text-[#666672]">{loading ? "Memuat…" : "Belum ada absensi pada periode ini."}</div>}
				</Panel>
				<Panel title="Peringkat ketepatan" tone="red">
					{ranking.length ? <ProgressList rows={ranking.map((u) => ({ label: nameOf.get(u.userId) ?? "Karyawan", value: `${u.onTimePct}% · ${u.late} telat`, ratio: u.onTimePct / 100, tone: u.onTimePct >= 90 ? "green" : u.onTimePct >= 75 ? "amber" : "red" }))} /> : <div className="bg-[#f6f6f9] p-4 text-center text-[12px] text-[#666672]">Belum ada data.</div>}
				</Panel>
			</div>

			<Panel title={<>Tren · {range.label.toLowerCase()}</>}>
				{analysis && analysis.labels.length ? <LineChart redrawKey={period} labels={analysis.labels} series={[{ name: "Hadir", values: analysis.seriesPresent, color: "#2f6fdf" }, { name: "Terlambat", values: analysis.seriesLate, color: "#d92d20" }]} /> : <div className="bg-[#f6f6f9] p-6 text-center text-[12px] text-[#666672]">Belum ada data tren.</div>}
			</Panel>

			<div className="grid gap-3 lg:grid-cols-2">
				<Panel title={<span className="inline-flex items-center gap-2"><LiveDot />Absensi langsung</span>} right={<span className="font-mono text-[10px] text-[#666672]">{feed.length} kejadian</span>}><Feed items={feed} empty="Belum ada absensi." /></Panel>
				<Panel title="Sesi belum ditutup" tone="amber" right={<StatusTag tone={staleSessions.length ? "warn" : "ok"}>{staleSessions.length ? `${staleSessions.length} perlu dirapikan` : "Bersih"}</StatusTag>}>
					{staleSessions.length === 0 ? <div className="bg-[#f6f6f9] p-4 text-center text-[12px] text-[#666672]">Tidak ada sesi yang menggantung.</div> : (
						<ul className="divide-y divide-[#efeff2]">
							{staleSessions.slice(0, 8).map((s) => (
								<li key={`${s.userId}-${s.inTs}`} className="flex items-center gap-3 py-2.5 text-[13px]">
									<div className="min-w-0 flex-1"><div className="truncate font-medium">{nameOf.get(s.userId) ?? "Karyawan"}</div><div className="font-mono text-[10px] text-[#666672]">Masuk {s.date} {clock(s.inTs)} · tanpa check-out{s.estimated ? " · jam dihitung sampai akhir shift" : ""}</div></div>
									<span className="font-mono text-[10px] uppercase text-[#666672]">Tutup di Admin</span>
								</li>
							))}
						</ul>
					)}
				</Panel>
			</div>
		</Page>
	);
}
