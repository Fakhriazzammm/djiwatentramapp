import { createPortal } from "react-dom";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useAdminOverview } from "@/hooks/use-admin-overview";
import {
	buildDashboardRange,
	DASHBOARD_PERIOD_OPTIONS,
	formatDashboardRangeText,
	getDashboardPeriodLabel,
	isDashboardPeriodKey,
	type DashboardPeriodKey,
} from "@/lib/dashboard-periods";
import { type FeedEvent } from "@/lib/dashboard-analytics";
import { Reveal, Segmented, LiveDot } from "./motion";
import { SalesSection } from "./SalesSection";
import { HourlySection } from "./HourlySection";
import { EcosystemSection } from "./EcosystemSection";
import { DjiwaPaySection, BreakdownSection } from "./PaymentsSection";
import { LiveFeed, LiveHeader, OpsSection } from "./OpsSection";
import { WebSection } from "./WebSection";
import { formatAgo, MaskContext, SourceError, useNow } from "./ui";

const PERIOD_PARAM = "periode";

// Bagian berat hanya render ulang saat datanya berubah (bukan setiap detik dari jam).
const SalesBlock = memo(SalesSection);
const HourlyBlock = memo(HourlySection);
const EcosystemBlock = memo(EcosystemSection);
const DjiwaPayBlock = memo(DjiwaPaySection);
const OpsBlock = memo(OpsSection);
const BreakdownBlock = memo(BreakdownSection);
const WebBlock = memo(WebSection);
const PERIOD_OPTIONS = DASHBOARD_PERIOD_OPTIONS.map((option) => ({ value: option.key, label: option.label }));

function readPeriodFromUrl(): DashboardPeriodKey {
	if (typeof window === "undefined") return "today";
	const value = new URLSearchParams(window.location.search).get(PERIOD_PARAM);
	return isDashboardPeriodKey(value) ? value : "today";
}

/**
 * Pusat Pantau Operasional (command center). Periode disimpan di URL (?periode=)
 * agar tautan bisa dibagikan dan bertahan saat refresh. Semua data dari RPC admin_*.
 */
export default function CommandCenter() {
	const [period, setPeriod] = useState<DashboardPeriodKey>(readPeriodFromUrl);
	const [masked, setMasked] = useState(false);
	const [statusTarget, setStatusTarget] = useState<HTMLElement | null>(null);
	useEffect(() => setStatusTarget(document.getElementById("admin-dashboard-live-status")), []);
	const [refreshing, setRefreshing] = useState(false);
	const { state, reload } = useAdminOverview(period);
	const now = useNow(1000);
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		if (typeof window === "undefined") return;
		const url = new URL(window.location.href);
		if (url.searchParams.get(PERIOD_PARAM) === period) return;
		url.searchParams.set(PERIOD_PARAM, period);
		window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
	}, [period]);

	const changePeriod = useCallback((next: DashboardPeriodKey) => setPeriod(next), []);
	const handleRefresh = useCallback(() => {
		setRefreshing(true);
		reload();
		window.setTimeout(() => setRefreshing(false), 900);
	}, [reload]);

	const range = useMemo(() => buildDashboardRange(period, now), [period, now]);
	const periodLabel = getDashboardPeriodLabel(period);
	const rangeText = formatDashboardRangeText(range);
	const data = state.data;
	const loadingPeriod = !data || data.range.key !== period;
	const updatedText = state.updatedAt ? formatAgo(state.updatedAt, now) : "memuat…";

	const breakdown = data?.breakdown.ok ? data.breakdown.value : null;

	const pendingCount = breakdown?.statusCounts.pending ?? 0;
	const sampleDays = data?.heatmap.ok ? data.heatmap.value.sampleDays : null;

	return (
		<MaskContext.Provider value={masked}>
			<MotionConfig reducedMotion="user">
				{statusTarget && createPortal(<span className="command-live-badge"><LiveDot />Live · diperbarui {updatedText}</span>, statusTarget)}
				<main aria-label="Pusat Pantau Operasional" className="admin-command min-h-full bg-[#f4f4f6] pb-12 pt-1 font-sans text-[#111114]">
					<div className="w-full max-w-[1380px] space-y-[14px] px-3 sm:px-7">
						<div className="flex flex-wrap items-center gap-3">
							<Segmented id="period" label="Periode data" value={period} onChange={changePeriod} options={PERIOD_OPTIONS} />
							<div className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[10px] text-[#666672]">
								<span className="inline-flex items-center gap-2">
									<LiveDot />
									{rangeText}
								</span>
								<span aria-live="polite">Diperbarui {updatedText}</span>
							</div>
						<Header
							masked={masked}
							onToggleMask={() => setMasked((value) => !value)}
							onRefresh={handleRefresh}
							refreshing={refreshing}
							reduceMotion={Boolean(reduceMotion)}
						/>
						</div>
						<div className="relative h-[2px] overflow-hidden bg-[#e4e4e8]" aria-hidden="true">
							{loadingPeriod && !reduceMotion && (
								<motion.div
									className="absolute inset-y-0 w-1/3 bg-[#111114]"
									initial={{ x: "-100%" }}
									animate={{ x: "300%" }}
									transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
								/>
							)}
						</div>

						{state.status === "error" && !data && (
							<div className="space-y-2">
								<SourceError message={state.error ?? "Koneksi data Admin gagal."} />
								<button type="button" onClick={handleRefresh} className="inline-flex items-center gap-2 border border-[#111114] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] hover:bg-[#111114] hover:text-white">
									<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Coba lagi
								</button>
							</div>
						)}

						<Reveal>
							<ActivityRow
								pendingCount={pendingCount}
								feed={data?.feed.ok ? data.feed.value : null}
								feedError={data && !data.feed.ok ? data.feed.error : null}
								now={now}
								updatedText={updatedText}
								periodLabel={periodLabel}
							/>
						</Reveal>

						{data ? (
							<>
								<Reveal delay={0.05}>
									<SalesBlock overview={data} period={period} onPeriodChange={changePeriod} periodLabel={periodLabel} />
								</Reveal>
								<Reveal delay={0.08}>
									<EcosystemBlock overview={data} periodLabel={periodLabel} />
								</Reveal>
								<Reveal delay={0.10}>
									<DjiwaPayBlock overview={data} periodLabel={periodLabel} />
								</Reveal>
								<Reveal delay={0.12}>
									<WebBlock overview={data} periodLabel={periodLabel} />
								</Reveal>
								<Reveal delay={0.14}>
									<HourlyBlock overview={data} periodLabel={periodLabel} />
								</Reveal>
								<Reveal delay={0.16}>
									<OpsBlock overview={data} periodLabel={periodLabel} />
								</Reveal>
								<Reveal delay={0.18}>
									<BreakdownBlock overview={data} periodLabel={periodLabel} />
								</Reveal>
							</>
						) : (
							<LoadingSkeleton />
						)}

						<Notes sampleDays={sampleDays} />

						<footer className="flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[10px] text-[#8e8e93]">
							<span>Djiwa Tentram · Pusat Pantau Operasional · WIB</span>
							<span>Data langsung dari database, bukan contoh.</span>
						</footer>
					</div>
				</main>
			</MotionConfig>
		</MaskContext.Provider>
	);
}

function Header({
	masked,
	onToggleMask,
	onRefresh,
	refreshing,
	reduceMotion,
}: {
	masked: boolean;
	onToggleMask: () => void;
	onRefresh: () => void;
	refreshing: boolean;
	reduceMotion: boolean;
}) {
	return (
		<div className="command-toolbar-actions flex items-center gap-2">
				<button
					type="button"
					onClick={onToggleMask}
					aria-pressed={masked}
					aria-label={masked ? "Tampilkan angka" : "Sembunyikan angka"}
					title={masked ? "Tampilkan angka" : "Sembunyikan angka"}
					className="flex h-10 w-10 items-center justify-center border border-[#d8d8de] bg-white text-[#111114] transition-colors duration-200 hover:bg-[#f5f5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114]"
				>
					{masked ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
				</button>
				<button
					type="button"
					onClick={onRefresh}
					aria-label="Refresh data" title="Refresh data" className="flex h-10 w-10 items-center justify-center border border-[#d8d8de] bg-white text-[12px] font-medium text-[#111114] transition-colors duration-200 hover:bg-[#f5f5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#111114]"
				>
					<motion.span
						aria-hidden="true"
						animate={refreshing && !reduceMotion ? { rotate: 360 } : { rotate: 0 }}
						transition={{ duration: 0.9, ease: [0.5, 0.1, 0.3, 1] }}
						className="inline-flex"
					>
						<RefreshCw className="h-3.5 w-3.5" />
					</motion.span>
				</button>
		</div>
	);
}

function ActivityRow({
	pendingCount,
	feed,
	feedError,
	now,
	updatedText,
	periodLabel,
}: {
	pendingCount: number;
	feed: FeedEvent[] | null;
	feedError: string | null;
	now: number;
	updatedText: string;
	periodLabel: string;
}) {
	return (
		<section aria-label="Aktivitas sekarang" className="grid gap-px border border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-[190px_minmax(0,1fr)]">
			<div className="bg-white px-5 py-[18px]">
				<div className="font-display text-[40px] font-semibold leading-none tabular-nums">{pendingCount}</div>
				<div className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Menunggu bayar<br />{periodLabel}</div>
			</div>
			<div className="bg-white p-4">
				<LiveHeader updatedLabel={`diperbarui ${updatedText}`} count={feed?.length ?? 0} />
				{feedError ? <div className="mt-2"><SourceError message={feedError} /></div> : feed ? <LiveFeed events={feed} now={now} /> : <div className="mt-3 h-24 animate-pulse bg-[#ececf0]" aria-hidden="true" />}
			</div>
		</section>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-3" aria-busy="true" aria-label="Memuat dashboard">
			<div className="h-48 animate-pulse bg-[#ececf0]" />
			<div className="grid gap-3 lg:grid-cols-2">
				<div className="h-64 animate-pulse bg-[#ececf0]" />
				<div className="h-64 animate-pulse bg-[#ececf0]" />
			</div>
		</div>
	);
}

function Notes({ sampleDays }: { sampleDays: number | null }) {
	return (
		<details className="border border-[#e4e4e8] bg-white p-4">
			<summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#111114]">Cara angka ini dihitung</summary>
			<ul className="mt-3 list-disc space-y-1.5 pl-5 font-mono text-[11px] leading-relaxed text-[#444450]">
				<li>Pendapatan dan order memakai transaksi <strong>settled</strong> (paid/completed) dalam zona WIB.</li>
				<li>Minggu dimulai Senin. "3 bulan terakhir" dan "6 bulan terakhir" mencakup bulan berjalan dan dua/lima bulan sebelumnya, sesuai kalender.</li>
				<li>Perbandingan memakai rentang setara tepat sebelum periode terpilih; "Semua" tidak memiliki pembanding.</li>
				<li>Jam ramai dan hari teratas dihitung dari seluruh transaksi settled pada periode terpilih{sampleDays !== null ? ` (${sampleDays} hari berisi transaksi)` : ""}.</li>
				<li>Volume DjiwaPay = pesanan dengan metode DjiwaPay yang settled. Saldo dompet adalah posisi saat ini.</li>
				<li>Kehadiran membaca log absensi hari ini (WIB). Status "Belum hadir" berarti belum ada clock-in hari ini.</li>
				<li>Data diperbarui ketika tabel terkait berubah (realtime) dan dicek ulang setiap 15 detik saat tab terlihat.</li>
			</ul>
		</details>
	);
}
