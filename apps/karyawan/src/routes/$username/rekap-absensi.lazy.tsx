import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useStaffProfile } from "../$username.lazy";
import { Skeleton, useHybridStaffLogs, useHybridStaffStats, useHybridSiteSettings } from "@yumipos/web-shared";
import { Calendar, Clock, AlertTriangle, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createLazyFileRoute("/$username/rekap-absensi")({
	component: RekapAbsensiPage,
});

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(amount);
};

const MONTHS = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatTime(ts: number): string {
	const d = new Date(ts + 7 * 3600_000);
	return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function formatDate(ts: number): string {
	const d = new Date(ts + 7 * 3600_000);
	return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

interface AttendanceSession {
	date: number;
	shiftName: string;
	checkIn: number;
	checkOut: number | null;
	penaltyAmount: number;
}

function buildSessions(logs: any[] | null): AttendanceSession[] {
	if (!logs || logs.length === 0) return [];

	// Sort ascending for pairing
	const asc = [...logs].sort((a: any, b: any) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));

	const sessions: AttendanceSession[] = [];
	for (let i = 0; i < asc.length; i++) {
		const entry = asc[i] as any;
		if (entry.type === "check_in") {
			const checkOut = (i + 1 < asc.length && asc[i + 1].type === "check_out") ? Number(asc[i + 1].timestamp ?? 0) : null;
			sessions.push({
				date: Number(entry.timestamp ?? 0),
				shiftName: entry.shiftName || entry.shift_name || "—",
				checkIn: Number(entry.timestamp ?? 0),
				checkOut,
				penaltyAmount: Number(entry.penaltyAmount ?? entry.penalty_amount ?? 0),
			});
			if (checkOut !== null) i++; // skip the paired check_out
		}
	}
	// Reverse to descending for display
	return sessions.reverse();
}

function RekapAbsensiPage() {
	const { staff, isUnlocked } = useStaffProfile();
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());

	const logs = useHybridStaffLogs(
		isUnlocked && staff
			? { userId: staff._id, month: selectedMonth, year: selectedYear }
			: (undefined as any)
	);
	const stats = useHybridStaffStats(
		isUnlocked && staff
			? { userId: staff._id, month: selectedMonth, year: selectedYear }
			: (undefined as any)
	);
	const settings = useHybridSiteSettings() as any;

	const sessions = useMemo(() => buildSessions(logs), [logs]);

	const totalLate = useMemo(() => sessions.filter((s) => s.penaltyAmount > 0).length, [sessions]);
	const onTimeRate = sessions.length > 0
		? Math.round(((sessions.length - totalLate) / sessions.length) * 100)
		: 0;

	const years = useMemo(() => {
		const current = now.getFullYear();
		const list = [];
		for (let y = current - 3; y <= current; y++) list.push(y);
		return list;
	}, []);

	const isLoading = !logs;

	return (
		<div className="space-y-3">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card text-primary shadow-sm">
					<Calendar className="h-4 w-4" />
				</div>
				<h1 className="text-lg font-bold tracking-tight">Rekap Absensi</h1>
			</div>

			{/* Period selector */}
			<div className="flex gap-2">
				<select
					value={selectedMonth}
					onChange={(e) => setSelectedMonth(Number(e.target.value))}
					aria-label="Pilih bulan rekap"
					className="karyawan-control border bg-card px-3 text-xs font-semibold"
				>
					{MONTHS.map((m, i) => (
						<option key={i} value={i + 1}>{m}</option>
					))}
				</select>
				<select
					value={selectedYear}
					onChange={(e) => setSelectedYear(Number(e.target.value))}
					aria-label="Pilih tahun rekap"
					className="karyawan-control border bg-card px-3 text-xs font-semibold"
				>
					{years.map((y) => (
						<option key={y} value={y}>{y}</option>
					))}
				</select>
			</div>

			{/* Stats cards */}
			<div className="grid grid-cols-2 gap-2">
				<StatsCard
					icon={<CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
					label="Hari Kerja"
					value={stats ? `${stats.daysWorked ?? 0}` : "—"}
				/>
				<StatsCard
					icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
					label="Keterlambatan"
					value={`${totalLate}`}
				/>
				<StatsCard
					icon={<Clock className="h-3.5 w-3.5 text-blue-500" />}
					label="Total Durasi"
					value={stats ? `${stats.totalHours ?? 0} jam` : "—"}
				/>
				<StatsCard
					icon={<TrendingUp className="h-3.5 w-3.5 text-violet-500" />}
					label="On-Time Rate"
					value={`${onTimeRate}%`}
				/>
			</div>

			{/* Log table */}
			<div className="karyawan-card overflow-hidden border">
				{isLoading ? (
					<div className="p-4 space-y-2">
						{Array.from({ length: 5 }).map((_, i) => (
							<Skeleton key={i} className="h-6 rounded-lg" />
						))}
					</div>
				) : sessions.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<XCircle className="h-8 w-8 text-muted-foreground/40 mb-2" />
						<p className="text-[11px] text-muted-foreground">Belum ada data absensi untuk bulan ini</p>
					</div>
				) : (
					<div className="overflow-x-auto" role="region" aria-label="Tabel rekap absensi" tabIndex={0}>
					<table className="min-w-[640px] w-full text-xs">
						<thead>
							<tr className="border-b bg-muted/50 text-left text-[10px] font-semibold text-muted-foreground">
								<th className="px-3 py-2">Tanggal</th>
								<th className="px-3 py-2">Shift</th>
								<th className="px-3 py-2">Check-in</th>
								<th className="px-3 py-2">Check-out</th>
								<th className="px-3 py-2">Status</th>
								<th className="px-3 py-2 text-right">Denda</th>
							</tr>
						</thead>
						<tbody>
							{sessions.map((s, i) => (
								<motion.tr
									key={i}
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: i * 0.02 }}
									className="border-b last:border-0 hover:bg-muted/30"
								>
									<td className="px-3 py-2 font-medium">{formatDate(s.date)}</td>
									<td className="px-3 py-2">{s.shiftName}</td>
									<td className="px-3 py-2 tabular-nums">{formatTime(s.checkIn)}</td>
									<td className="px-3 py-2 tabular-nums">{s.checkOut ? formatTime(s.checkOut) : "—"}</td>
									<td className="px-3 py-2">
										{s.penaltyAmount > 0 ? (
											<span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
												Terlambat
											</span>
										) : (
											<span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
												On Time
											</span>
										)}
									</td>
									<td className="px-3 py-2 text-right tabular-nums font-semibold">
										{s.penaltyAmount > 0 ? (
											<span className="text-red-600">{formatCurrency(s.penaltyAmount)}</span>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</td>
								</motion.tr>
							))}
						</tbody>
					</table>
					</div>
				)}
			</div>
		</div>
	);
}

function StatsCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<div className="karyawan-card border bg-card p-4">
			<div className="flex items-center gap-1.5 mb-1">
				{icon}
				<span className="text-[10px] text-muted-foreground">{label}</span>
			</div>
			<p className="text-sm font-bold tabular-nums">{value}</p>
		</div>
	);
}
