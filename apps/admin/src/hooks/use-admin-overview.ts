import { useCallback, useEffect, useRef, useState } from "react";
import { pollWhenVisible } from "@yumipos/web-shared/lib/visible-polling";
import { createClient } from "@/lib/client";
import { adminProtectedRpc } from "@/lib/admin-protected-read";
import {
	buildTrendSeries,
	type ActionsPayload,
	type AttendancePayload,
	type BreakdownPayload,
	type CashflowPayload,
	type DjiwaPayPayload,
	type EcosystemCard,
	type FeedEvent,
	type HeatmapPayload,
	type SalesRangeRow,
	type TrendPoint,
	type TrendSeriesPoint,
	type WebTrafficPayload,
} from "@/lib/dashboard-analytics";
import {
	buildDashboardRange,
	getComparisonRanges,
	type DashboardPeriodKey,
	type DashboardRange,
} from "@/lib/dashboard-periods";

// Data command center: setiap sumber dimuat lewat RPC admin_* (Edge Function
// admin-protected-read). Kegagalan satu sumber tidak menjatuhkan seluruh dashboard.

export type Source<T> = { ok: true; value: T } | { ok: false; error: string };

export type ComparisonItem = { key: DashboardPeriodKey; label: string; orders: number; revenue: number };

export type AdminOverview = {
	range: DashboardRange;
	summary: Source<{ selected: SalesRangeRow; previous: SalesRangeRow | null; comparison: ComparisonItem[] }>;
	trend: Source<TrendSeriesPoint[]>;
	heatmap: Source<HeatmapPayload>;
	breakdown: Source<BreakdownPayload>;
	cashflow: Source<CashflowPayload>;
	djiwapay: Source<DjiwaPayPayload>;
	attendance: Source<AttendancePayload>;
	feed: Source<FeedEvent[]>;
	ecosystem: Source<EcosystemCard[]>;
	web: Source<WebTrafficPayload>;
	actions: Source<ActionsPayload>;
};

export type AdminOverviewState = {
	data: AdminOverview | null;
	status: "loading" | "ready" | "error";
	error: string | null;
	updatedAt: number | null;
};

// Realtime hanya untuk tabel yang ada di publikasi supabase_realtime dan bisa dibaca
// sesi admin (role authenticated). Sumber lain (dompet, donasi, booking, web, absensi)
// belum dipublikasikan ke realtime, jadi diperbarui lewat polling POLL_MS.
const REALTIME_TABLES: ReadonlyArray<{ schema: string; table: string }> = [
	{ schema: "pos", table: "orders" },
	{ schema: "pos", table: "financial_transactions" },
];
const POLL_MS = 15_000;
const REALTIME_DEBOUNCE_MS = 1_200;

const hasSupabaseConfig = Boolean(
	import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

async function settle<T>(task: () => Promise<T>): Promise<Source<T>> {
	try {
		return { ok: true, value: await task() };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : "Gagal memuat data" };
	}
}

/** Memuat seluruh bagian dashboard untuk periode dan waktu `now` (epoch ms). */
export async function loadAdminOverview(period: DashboardPeriodKey, now: number = Date.now()): Promise<AdminOverview> {
	const range = buildDashboardRange(period, now);
	const today = buildDashboardRange("today", now);
	const comparisonRanges = getComparisonRanges(now);

	const summaryRanges = [
		{ key: "selected", start_ms: range.start, end_ms: range.end },
		...(range.previous ? [{ key: "previous", start_ms: range.previous.start, end_ms: range.previous.end }] : []),
		...comparisonRanges.map((item) => ({ key: `cmp:${item.key}`, start_ms: item.start, end_ms: item.end })),
	];

	const [summary, trend, heatmap, breakdown, cashflow, djiwapay, attendance, feed, ecosystem, web, actions] =
		await Promise.all([
			settle(async () => {
				const rows = await adminProtectedRpc<SalesRangeRow[]>("sales_summary", { p_ranges: summaryRanges });
				const byKey = new Map(rows.map((row) => [row.key, row]));
				const empty: SalesRangeRow = { key: "", orders: 0, revenue: 0 };
				return {
					selected: byKey.get("selected") ?? empty,
					previous: range.previous ? (byKey.get("previous") ?? { key: "previous", orders: 0, revenue: 0 }) : null,
					comparison: comparisonRanges.map((item) => {
						const row = byKey.get(`cmp:${item.key}`) ?? empty;
						return { key: item.key, label: item.label, orders: row.orders, revenue: row.revenue };
					}),
				};
			}),
			settle(async () => {
				const points = await adminProtectedRpc<TrendPoint[]>("sales_trend", {
					p_start: range.start,
					p_end: range.end,
					p_bucket: range.trendBucket,
				});
				return buildTrendSeries(range, points, now);
			}),
			settle(() =>
				adminProtectedRpc<HeatmapPayload>("sales_heatmap", { p_start: range.start, p_end: range.end }),
			),
			settle(() =>
				adminProtectedRpc<BreakdownPayload>("sales_breakdown", { p_start: range.start, p_end: range.end }),
			),
			settle(() =>
				adminProtectedRpc<CashflowPayload>("cashflow_summary", { p_start: range.start, p_end: range.end }),
			),
			settle(() =>
				adminProtectedRpc<DjiwaPayPayload>("djiwapay_overview", { p_start: range.start, p_end: range.end }),
			),
			settle(() =>
				adminProtectedRpc<AttendancePayload>("attendance_today", { p_start: today.start, p_end: today.end }),
			),
			settle(() => adminProtectedRpc<FeedEvent[]>("activity_feed", { p_limit: 10 })),
			settle(() =>
				adminProtectedRpc<EcosystemCard[]>("ecosystem_summary", { p_start: range.start, p_end: range.end }),
			),
			settle(() =>
				adminProtectedRpc<WebTrafficPayload>("web_traffic", { p_start: range.start, p_end: range.end }),
			),
			settle(() => adminProtectedRpc<ActionsPayload>("actions_summary", { p_now: now })),
		]);

	return {
		range,
		summary,
		trend,
		heatmap,
		breakdown,
		cashflow,
		djiwapay,
		attendance,
		feed,
		ecosystem,
		web,
		actions,
	};
}

/**
 * Hook dashboard: memuat ulang saat periode berubah, saat tab kembali terlihat, saat
 * polling cadangan (15 dtk), dan setelah perubahan tabel (realtime, di-debounce).
 * Data periode sebelumnya tetap tampil sampai data baru tiba (tidak berkedip).
 */
export function useAdminOverview(period: DashboardPeriodKey) {
	const [state, setState] = useState<AdminOverviewState>({ data: null, status: "loading", error: null, updatedAt: null });
	const [nonce, setNonce] = useState(0);
	const requestRef = useRef(0);
	const inFlightRef = useRef<{ period: DashboardPeriodKey; id: number } | null>(null);

	const load = useCallback(async () => {
		// Polling and realtime must not invalidate a slower request for the same period.
		if (inFlightRef.current?.period === period) return;
		const requestId = ++requestRef.current;
		inFlightRef.current = { period, id: requestId };
		try {
			const data = await loadAdminOverview(period, Date.now());
			if (requestId !== requestRef.current) return;
			setState({ data, status: "ready", error: null, updatedAt: Date.now() });
		} catch (error) {
			if (requestId !== requestRef.current) return;
			const message = error instanceof Error ? error.message : "Gagal memuat dashboard";
			setState((current) => ({ ...current, status: current.data ? "ready" : "error", error: message }));
		} finally {
			if (inFlightRef.current?.id === requestId) inFlightRef.current = null;
		}
	}, [period]);

	useEffect(() => {
		void load();
	}, [load, nonce]);

	useEffect(() => {
		if (!hasSupabaseConfig) return;
		const supabase = createClient();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const scheduleReload = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				void load();
			}, REALTIME_DEBOUNCE_MS);
		};
		let channel = supabase.channel(`admin-overview:${Math.random().toString(36).slice(2)}`);
		for (const { schema, table } of REALTIME_TABLES) {
			channel = channel.on("postgres_changes", { event: "*", schema, table }, scheduleReload);
		}
		channel.subscribe();
		const stopPolling = pollWhenVisible(() => {
			void load();
		}, POLL_MS);
		return () => {
			if (timer) clearTimeout(timer);
			stopPolling();
			void supabase.removeChannel(channel);
		};
	}, [load]);

	const reload = useCallback(() => setNonce((value) => value + 1), []);
	return { state, reload };
}
