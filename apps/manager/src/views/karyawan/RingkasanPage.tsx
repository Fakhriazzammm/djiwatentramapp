import { useNavigate } from "./nav";
import { useMemo, useState } from "react";
import { DASHBOARD_PERIOD_OPTIONS, formatDashboardRangeText, type DashboardPeriodKey } from "../../lib/karyawan/periods";
import { WEEKDAY_SHORT } from "../../lib/karyawan/analytics";
import { LiveDot } from "./dash-motion";
import { Btn, CompareStrip, Feed, InsightList, KpiStrip, LineChart, Page, PageHead, Panel, PeriodBar, ProgressList, SectionTitle, SourceError, StatusTag, type FeedItem, type Insight } from "./kit";
import { agoText, deltaOf, num, useAttendanceAnalysis, useDirectory, useLeave } from "./data";
import { fmtDate, teamStats } from "./team";

const PERIODS = DASHBOARD_PERIOD_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
const WEEKDAY_LONG = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export default function RingkasanPage() {
	const navigate = useNavigate();
	const [period, setPeriod] = useState<DashboardPeriodKey>("today");
	const { range, analysis, prevAnalysis, loading, error } = useAttendanceAnalysis(period);
	const dir = useDirectory();
	const leave = useLeave();

	const stats = useMemo(() => (dir.rows ? teamStats(dir.rows) : null), [dir.rows]);
	const nameOf = useMemo(() => new Map((dir.rows ?? []).map((r) => [r._id, r.name])), [dir.rows]);
	const pending = (leave.rows ?? []).filter((r) => (r.status ?? "pending") === "pending");

	const days = range.days ?? Math.max(1, analysis?.labels.length ?? 1);
	const activeCount = stats?.active ?? 0;
	const attendanceRate = analysis && activeCount ? Math.min(100, Math.round((analysis.presence / (activeCount * Math.max(1, Math.min(days, Math.ceil((Date.now() - range.start) / 86_400_000))))) * 100)) : null;
	const health = analysis && stats ? Math.round(((attendanceRate ?? 0) + analysis.onTimePct + stats.avgCompleteness + stats.pdfRatio) / 4) : null;

	const feed: FeedItem[] = useMemo(() => {
		if (!analysis) return [];
		const items: (FeedItem & { at: number })[] = [];
		for (const s of [...analysis.sessions].sort((a, b) => b.inTs - a.inTs).slice(0, 8)) {
			const name = nameOf.get(s.userId) ?? "Karyawan";
			items.push({ at: s.inTs, source: s.lateMin > 0 ? "Terlambat" : "Masuk", tone: s.lateMin > 0 ? "amber" : "green", text: s.lateMin > 0 ? `${name} clock-in terlambat ${s.lateMin} menit` : `${name} clock-in${s.shiftName ? ` · ${s.shiftName}` : ""}`, time: agoText(s.inTs) });
			if (s.outTs) items.push({ at: s.outTs, source: "Pulang", tone: "blue", text: `${name} clock-out`, time: agoText(s.outTs) });
		}
		for (const l of pending.slice(0, 3)) {
			const at = l.created_at ? new Date(l.created_at).getTime() : Date.now();
			items.push({ at, source: "Cuti", tone: "blue", text: `${l.user_name ?? "Karyawan"} mengajukan ${l.leave_type} ${fmtDate(l.start_date)}–${fmtDate(l.end_date)}`, time: agoText(at) });
		}
		return items.sort((a, b) => b.at - a.at).slice(0, 7);
	}, [analysis, nameOf, pending]);

	const insights: Insight[] = useMemo(() => {
		const out: Insight[] = [];
		if (analysis && analysis.lateCount >= 3) {
			const top = analysis.lateByWeekday.indexOf(Math.max(...analysis.lateByWeekday));
			const share = Math.round((analysis.lateByWeekday[top] / analysis.lateCount) * 100);
			out.push({ tone: "warn", title: `Keterlambatan paling sering hari ${WEEKDAY_LONG[top]}`, detail: `${analysis.lateByWeekday[top]} dari ${analysis.lateCount} kasus (${share}%) pada ${range.label.toLowerCase()}.`, action: { label: "Lihat", onClick: () => void navigate({ to: "/admin/karyawan/kehadiran" }) } });
		}
		if (analysis) {
			const worst = Object.values(analysis.byUser).filter((u) => u.late >= 3).sort((a, b) => b.late - a.late)[0];
			if (worst) out.push({ tone: "bad", title: `${nameOf.get(worst.userId) ?? "Karyawan"} terlambat ${worst.late} kali`, detail: `Ketepatan ${worst.onTimePct}% pada ${range.label.toLowerCase()}.` });
			if (analysis.outside > 0) out.push({ tone: "warn", title: `${analysis.outside} absen di luar radius`, detail: "Lokasi clock-in lebih jauh dari radius yang diatur di Pengaturan Kehadiran.", action: { label: "Tinjau", onClick: () => void navigate({ to: "/admin/karyawan/kehadiran" }) } });
			if (analysis.unclosed > 0) out.push({ tone: "warn", title: `${analysis.unclosed} sesi check-in belum ditutup`, detail: "Jam dihitung sampai akhir shift di jadwal. Tutup sesi agar tercatat check-out sebenarnya.", action: { label: "Tinjau", onClick: () => void navigate({ to: "/admin/karyawan/laporan" }) } });
		}
		if (stats && stats.noPdf.length > 0) out.push({ tone: "info", title: `${stats.noPdf.length} kontrak belum memiliki PDF`, detail: stats.noPdf.slice(0, 3).map((r) => r.name).join(", "), action: { label: "Buka", onClick: () => void navigate({ to: "/admin/karyawan/onboarding/kontrak" }) } });
		if (stats && stats.incomplete > 0) out.push({ tone: "info", title: `${stats.incomplete} data karyawan belum lengkap`, detail: `Rata-rata kelengkapan ${stats.avgCompleteness}%.`, action: { label: "Lengkapi", onClick: () => void navigate({ to: "/admin/karyawan/data" }) } });
		return out;
	}, [analysis, stats, nameOf, range.label, navigate]);

	const upcoming: FeedItem[] = useMemo(() => {
		const out: FeedItem[] = [];
		for (const x of stats?.expiring ?? []) out.push({ source: fmtDate(x.info.endDate), tone: "amber", text: `Kontrak ${x.row.name} berakhir${x.info.estimated ? " (perkiraan)" : ""}`, time: `${x.info.daysLeft} hari` });
		for (const l of pending.slice(0, 3)) out.push({ source: fmtDate(l.start_date), tone: "blue", text: `${l.user_name ?? "Karyawan"} · ${l.leave_type} menunggu keputusan`, time: "tinjau" });
		return out.slice(0, 6);
	}, [stats, pending]);

	const prev = prevAnalysis;
	return (
		<Page>
			<PageHead title="Ringkasan Karyawan" subtitle="Kondisi tim dan hal yang perlu kamu tindak." actions={<Btn primary onClick={() => void navigate({ to: "/admin/karyawan/cuti-izin" })}>Tinjau {pending.length} cuti</Btn>} />
			<PeriodBar
				id="kk-period"
				value={period}
				onChange={setPeriod}
				options={PERIODS}
				loading={loading}
				right={
					<>
						<span className="inline-flex items-center gap-2"><LiveDot />{formatDashboardRangeText(range)}</span>
						<span>Data langsung dari database</span>
					</>
				}
			/>
			{error ? <SourceError message="Absensi tidak dapat dimuat" /> : null}

			<section aria-label="Aktivitas sekarang" className="grid gap-px border border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-[190px_minmax(0,1fr)]">
				<div className="bg-white px-5 py-[18px]">
					<div className="font-display text-[40px] font-normal leading-none tabular-nums">{leave.rows ? pending.length : "—"}</div>
					<div className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Cuti &amp; izin<br />menunggu persetujuan</div>
				</div>
				<div className="bg-white p-4">
					<div className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
						<span className="inline-flex items-center gap-2 font-semibold text-[#111114]"><LiveDot />Aktivitas langsung · Karyawan App</span>
						<span className="text-[#666672]">{feed.length} kejadian</span>
					</div>
					<Feed items={feed} empty="Belum ada aktivitas pada periode ini." />
				</div>
			</section>

			<SectionTitle color="#d92d20" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{range.label}</span>}>Kehadiran</SectionTitle>
			<KpiStrip
				items={[
					{ label: "Kehadiran tercatat", value: analysis ? analysis.presence : null, format: num, delta: analysis && prev ? deltaOf(analysis.presence, prev.presence) : undefined, sub: "hari-orang" },
					{ label: "Terlambat", value: analysis ? analysis.lateCount : null, format: num, delta: analysis && prev ? deltaOf(analysis.lateCount, prev.lateCount, true) : undefined, sub: analysis ? `rata-rata ${analysis.lateAvgMin} menit` : undefined },
					{ label: "Cuti / izin disetujui", value: leave.rows ? leave.rows.filter((r) => r.status === "approved").length : null, sub: "semua periode" },
					{ label: "Tingkat kehadiran", value: attendanceRate === null ? null : `${attendanceRate}%`, sub: attendanceRate === null ? undefined : attendanceRate >= 90 ? "sesuai target 90%" : "di bawah target 90%" },
				]}
			/>
			<CompareStrip items={[
				{ label: "Karyawan aktif", value: stats ? String(stats.active) : "—" },
				{ label: "Sedang bekerja", value: analysis ? String(analysis.workingNow.length) : "—" },
				{ label: "Kontrak ≤ 30 hari", value: stats ? String(stats.expiring.length) : "—" },
				{ label: "Data belum lengkap", value: stats ? String(stats.incomplete) : "—" },
				{ label: "Cuti menunggu", value: leave.rows ? String(pending.length) : "—" },
				{ label: "Sesi belum ditutup", value: analysis ? String(analysis.unclosed) : "—" },
			]} activeIndex={1} />

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
				<Panel title={<>Tren kehadiran · {range.label.toLowerCase()}</>}>
					{analysis && analysis.labels.length > 0 ? (
						<LineChart redrawKey={period} labels={analysis.labels} series={[{ name: "Hadir", values: analysis.seriesPresent, color: "#2f6fdf" }, { name: "Terlambat", values: analysis.seriesLate, color: "#d92d20" }]} />
					) : (
						<div className="bg-[#f6f6f9] p-6 text-center text-[12px] text-[#666672]">{loading ? "Memuat tren…" : "Belum ada kehadiran pada periode ini."}</div>
					)}
				</Panel>
				<Panel title="Skor kesehatan tim" tone="red">
					<div className="mb-3 flex items-baseline gap-2"><span className="font-display text-[48px] font-normal leading-none tabular-nums">{health ?? "—"}</span><span className="font-mono text-[11px] text-[#666672]">/ 100</span></div>
					<ProgressList rows={[
						{ label: "Kehadiran", value: attendanceRate === null ? "—" : `${attendanceRate}%`, ratio: (attendanceRate ?? 0) / 100, tone: (attendanceRate ?? 0) >= 90 ? "green" : "amber" },
						{ label: "Ketepatan waktu", value: analysis ? `${analysis.onTimePct}%` : "—", ratio: (analysis?.onTimePct ?? 0) / 100, tone: (analysis?.onTimePct ?? 0) >= 90 ? "green" : "amber" },
						{ label: "Kelengkapan data", value: stats ? `${stats.avgCompleteness}%` : "—", ratio: (stats?.avgCompleteness ?? 0) / 100, tone: (stats?.avgCompleteness ?? 0) >= 80 ? "green" : "amber" },
						{ label: "Kepatuhan dokumen", value: stats ? `${stats.pdfRatio}%` : "—", ratio: (stats?.pdfRatio ?? 0) / 100, tone: (stats?.pdfRatio ?? 0) >= 80 ? "green" : "red" },
					]} />
				</Panel>
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
				<Panel title="Wawasan otomatis" right={<StatusTag tone="info">dari data nyata</StatusTag>}><InsightList items={insights} /></Panel>
				<Panel title="Akan datang"><Feed items={upcoming} empty="Tidak ada kontrak berakhir atau cuti menunggu." /></Panel>
			</div>

			<details className="border border-[#e4e4e8] bg-white p-4">
				<summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">Cara angka ini dihitung</summary>
				<ul className="mt-3 list-disc space-y-1.5 pl-5 font-mono text-[11px] leading-relaxed text-[#444450]">
					<li>Kehadiran = jumlah hari-orang yang punya check-in. Tingkat kehadiran = kehadiran ÷ (karyawan aktif × hari berjalan).</li>
					<li>Terlambat = check-in lebih dari 10 menit setelah jam mulai di jadwal. Tanpa jadwal, tidak dihitung terlambat.</li>
					<li>Jam kerja mengikuti jadwal shift: dihitung dari jam mulai shift (atau check-in bila terlambat) sampai check-out; tanpa check-out dihitung sampai akhir shift. Lembur = check-out setelah akhir shift.</li>
					<li>Di luar radius = jarak check-in dari lokasi di Pengaturan Kehadiran melebihi radius.</li>
					<li>Skor kesehatan = rata-rata kehadiran, ketepatan waktu, kelengkapan data, dan kepatuhan dokumen.</li>
					<li>Hari dalam WIB. Minggu dimulai Senin ({WEEKDAY_SHORT[0]}).</li>
				</ul>
			</details>
		</Page>
	);
}
