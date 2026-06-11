import { useState, useMemo, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Clock,
	Users,
	TrendingUp,
	CalendarClock,
	UserCheck,
	ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/client";
import {
	useHybridShiftStatus,
	useHybridDashboardStats,
} from "@/hooks/use-hybrid-pos-data";
import {
	useHybridCurrentlyInStore,
	useHybridPublicUsers,
} from "@/hooks/use-hybrid-attendance-data";

// ─── HELPERS ───

function formatDuration(startTime: number, endTime?: number): string {
	const end = endTime ?? Date.now();
	const ms = end - startTime;
	const hours = Math.floor(ms / (1000 * 60 * 60));
	const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
	return `${hours}j ${minutes}m`;
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString("id-ID", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("id-ID", {
		style: "currency",
		currency: "IDR",
		minimumFractionDigits: 0,
	}).format(amount);
}

function getInitial(name: string): string {
	return name?.charAt(0)?.toUpperCase() ?? "?";
}

// ─── CARD SHELL ───

function CardShell({
	title,
	icon: Icon,
	children,
}: {
	title: string;
	icon: React.ElementType;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-xllll border border-border bg-card p-4 md:p-6 shadow-sm">
			<div className="mb-4 flex items-center gap-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Icon className="h-4 w-4" />
				</div>
				<h3 className="text-sm font-bold uppercase tracking-wider">{title}</h3>
			</div>
			{children}
		</div>
	);
}

// ─── REALTIME STATUS SECTION ───

function RealtimeStatusSection({
	shiftStatus,
	currentlyIn,
	dashboardStats,
}: {
	shiftStatus: any;
	currentlyIn: any[] | undefined;
	dashboardStats: any;
}) {
	if (!shiftStatus || !currentlyIn || !dashboardStats) {
		return (
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{[1, 2, 3, 4].map((i) => (
					<div key={i} className="rounded-xllll border bg-card p-4">
						<Skeleton className="mb-2 h-3 w-20" />
						<Skeleton className="mb-1 h-7 w-32" />
						<Skeleton className="h-3 w-24" />
					</div>
				))}
			</div>
		);
	}

	const ongoing = shiftStatus?.ongoingShift;
	const staffCount = currentlyIn?.length ?? 0;
	const isOpen = shiftStatus?.isOpen ?? false;

	const cards = [
		{
			icon: Clock,
			label: "Shift Aktif",
			value: ongoing?.shiftName ?? "—",
			sub: ongoing
				? `${ongoing.cashierName} · ${formatDuration(ongoing.startTime)}`
				: "Tidak ada shift aktif",
			color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30",
		},
		{
			icon: Users,
			label: "Staf di Toko",
			value: `${staffCount} orang`,
			sub: staffCount > 0 ? "Sedang bekerja" : "Belum ada yang masuk",
			color: "text-blue-600 bg-blue-100 dark:bg-blue-950/30",
		},
		{
			icon: CalendarClock,
			label: "Status Toko",
			value: isOpen ? "BUKA" : "TUTUP",
			sub: isOpen
				? `Sejak ${formatTime(ongoing?.startTime)}`
				: shiftStatus?.latestAkhir
					? `Tutup sejak ${formatTime(shiftStatus.latestAkhir)}`
					: "—",
			color: isOpen
				? "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30"
				: "text-red-600 bg-red-100 dark:bg-red-950/30",
		},
		{
			icon: TrendingUp,
			label: "Revenue Hari Ini",
			value: formatCurrency(dashboardStats?.todayRevenue ?? 0),
			sub: `${dashboardStats?.todayOrders ?? 0} pesanan`,
			color: "text-amber-600 bg-amber-100 dark:bg-amber-950/30",
		},
	];

	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			{cards.map((card) => (
				<div
					key={card.label}
					className="rounded-xllll border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md"
				>
					<div className="mb-3 flex items-center gap-2">
						<div
							className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.color}`}
						>
							<card.icon className="h-4 w-4" />
						</div>
						<span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
							{card.label}
						</span>
					</div>
					<p className="text-lg font-black tracking-tight">{card.value}</p>
					<p className="mt-0.5 text-[11px] text-muted-foreground">{card.sub}</p>
				</div>
			))}
		</div>
	);
}

// ─── STAFF ATTENDANCE SECTION ───

function StaffRow({
	name,
	role,
	status,
	timestamp,
}: {
	name: string;
	role?: string;
	status: "check_in" | "absent";
	timestamp?: number;
}) {
	const hoursAgo = timestamp
		? Math.round((Date.now() - timestamp) / (1000 * 60 * 60))
		: null;
	return (
		<div className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50">
			<div
				className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
					status === "check_in"
						? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
						: "bg-muted text-muted-foreground"
				}`}
			>
				{getInitial(name)}
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold">{name}</p>
				{role && <p className="text-[10px] text-muted-foreground">{role}</p>}
			</div>
			<div className="shrink-0 text-right">
				{status === "check_in" ? (
					<>
						<p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
							Sedang Bekerja
						</p>
						{hoursAgo !== null && (
							<p className="text-[10px] text-muted-foreground">
								{hoursAgo}j yang lalu
							</p>
						)}
					</>
				) : (
					<p className="text-xs text-muted-foreground">Belum Masuk</p>
				)}
			</div>
		</div>
	);
}

function StaffAttendanceSection({
	currentlyIn,
	allStaff,
	absentStaff,
}: {
	currentlyIn: any[] | undefined;
	allStaff: any[] | undefined;
	absentStaff: any[];
}) {
	if (!currentlyIn || !allStaff) {
		return (
			<CardShell title="Kehadiran Hari Ini" icon={UserCheck}>
				{[1, 2, 3].map((i) => (
					<div key={i} className="flex items-center gap-3 py-2">
						<Skeleton className="h-8 w-8 rounded-full" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3 w-20" />
						</div>
					</div>
				))}
			</CardShell>
		);
	}

	return (
		<CardShell title="Kehadiran Hari Ini" icon={UserCheck}>
			{/* Staf yang sedang di toko */}
			<div className="space-y-2">
				{currentlyIn.length === 0 && (
					<p className="py-4 text-center text-sm text-muted-foreground">
						Belum ada staf yang masuk hari ini
					</p>
				)}
				{currentlyIn.slice(0, 8).map((staff: any) => (
					<StaffRow
						key={staff._id}
						name={staff.name}
						status="check_in"
						timestamp={staff.checkInTime}
					/>
				))}
			</div>

			{/* Staf yang belum masuk */}
			{absentStaff.length > 0 && (
				<>
					<div className="border-border my-2 border-t pt-3">
						<p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
							Belum Masuk ({absentStaff.length})
						</p>
						{absentStaff.slice(0, 3).map((staff: any) => (
							<StaffRow
								key={staff._id}
								name={staff.name}
								role={staff.roleName}
								status="absent"
							/>
						))}
						{absentStaff.length > 3 && (
							<p className="pt-1 text-center text-xs text-muted-foreground">
								+{absentStaff.length - 3} lainnya
							</p>
						)}
					</div>
				</>
			)}
		</CardShell>
	);
}

// ─── STAFF PERFORMANCE SECTION ───

function StaffPerformanceSection({
	allStaff,
	month,
	year,
}: {
	allStaff: any[] | undefined;
	month: number;
	year: number;
}) {
	const topStaff = useMemo(() => allStaff?.slice(0, 5) ?? [], [allStaff]);
	const [staffStats, setStaffStats] = useState<Record<string, any>>({});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		const startOfMonth = new Date(year, month - 1, 1).getTime();
		const endOfMonth = new Date(year, month, 1).getTime();

		const promises = topStaff.map(async (staff: any) => {
			try {
				const supabase = createClient();
				const { data } = await supabase
					.from("pos_attendance_logs")
					.select("*")
					.eq("userId", staff._id)
					.gte("timestamp", startOfMonth)
					.lt("timestamp", endOfMonth)
					.order("timestamp", { ascending: true });

				const logs = data ?? [];
				const uniqueDays = new Set<string>();
				let totalMs = 0;

				for (let i = 0; i < logs.length; i++) {
					const entry = logs[i] as any;
					if (entry.type === "check_in") {
						uniqueDays.add(new Date(entry.timestamp).toDateString());
						if (i + 1 < logs.length && (logs[i + 1] as any).type === "check_out") {
							totalMs += (logs[i + 1] as any).timestamp - entry.timestamp;
							i++;
						}
					}
				}

				const daysInMonth = new Date(year, month, 0).getDate();
				return {
					userId: staff._id,
					totalHours: Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10,
					daysWorked: uniqueDays.size,
					attendanceRate: Math.min(
						100,
						Math.round((uniqueDays.size / daysInMonth) * 100)
					),
				};
			} catch {
				return null;
			}
		});

		Promise.all(promises).then((results) => {
			if (!cancelled) {
				const map: Record<string, any> = {};
				results
					.filter(Boolean)
					.forEach((r: any) => {
						map[r.userId] = r;
					});
				setStaffStats(map);
				setLoading(false);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [topStaff, month, year]);

	const ranked = useMemo(
		() =>
			topStaff
				.map((s: any) => ({ ...s, stats: staffStats[s._id] }))
				.filter((s: any) => s.stats)
				.sort(
					(a: any, b: any) =>
						(b.stats?.totalHours ?? 0) - (a.stats?.totalHours ?? 0)
				),
		[topStaff, staffStats]
	);

	return (
		<CardShell title="Performa Bulan Ini" icon={TrendingUp}>
			{loading ? (
				[1, 2, 3].map((i) => (
					<div key={i} className="flex items-center gap-3 py-2">
						<Skeleton className="h-6 w-6 rounded-full" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-2 w-full" />
						</div>
					</div>
				))
			) : ranked.length === 0 ? (
				<p className="py-4 text-center text-sm text-muted-foreground">
					Belum ada data absensi bulan ini
				</p>
			) : (
				<div className="space-y-3">
					{ranked.map((staff: any, idx: number) => {
						const maxHours = ranked[0]?.stats?.totalHours ?? 1;
						const barPct = Math.min(
							100,
							(staff.stats.totalHours / maxHours) * 100
						);
						return (
							<div key={staff._id}>
								<div className="mb-1 flex items-center justify-between">
									<div className="flex min-w-0 items-center gap-2">
										<span className="shrink-0 text-xs font-bold text-muted-foreground">
											#{idx + 1}
										</span>
										<p className="truncate text-sm font-semibold">{staff.name}</p>
									</div>
									<p className="shrink-0 text-xs font-bold tabular-nums">
										{staff.stats.totalHours}j · {staff.stats.attendanceRate}%
									</p>
								</div>
								<div className="h-1.5 w-full rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-all"
										style={{ width: `${barPct}%` }}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}

			<div className="border-border mt-4 border-t pt-3">
				<Link
					className="flex items-center justify-center gap-1 text-xs font-semibold text-primary hover:underline"
					to="/admin/operational-team/attendance"
				>
					Lihat Semua <ArrowUpRight className="h-3 w-3" />
				</Link>
			</div>
		</CardShell>
	);
}

// ─── SHIFT SUMMARY SECTION ───

function InfoItem({
	label,
	value,
	highlight,
}: {
	label: string;
	value: string;
	highlight?: boolean;
}) {
	return (
		<div className="space-y-1">
			<p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
				{label}
			</p>
			<p className={`text-sm font-semibold ${highlight ? "text-emerald-600" : ""}`}>
				{value}
			</p>
		</div>
	);
}

function ShiftSummarySection({ shiftStatus }: { shiftStatus: any }) {
	const allShifts = shiftStatus?.allShifts ?? [];
	const latestShift = allShifts[0];

	if (!shiftStatus) {
		return <Skeleton className="h-32 w-full rounded-xllll" />;
	}

	return (
		<section className="rounded-xllll border border-border bg-card p-4 shadow-sm md:p-6">
			<div className="mb-4 flex items-center gap-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Clock className="h-4 w-4" />
				</div>
				<h3 className="text-sm font-bold uppercase tracking-wider">
					Ringkasan Shift
				</h3>
			</div>

			{!latestShift ? (
				<p className="py-4 text-center text-sm text-muted-foreground">
					Belum ada data shift
				</p>
			) : (
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					<InfoItem
						label="Shift"
						value={`${latestShift.shiftName} · ${latestShift.cashierName}`}
					/>
					<InfoItem
						label="Revenue"
						value={formatCurrency(latestShift.revenue ?? 0)}
					/>
					<InfoItem
						label="Cash"
						value={formatCurrency(latestShift.cashRevenue ?? 0)}
					/>
					<InfoItem
						label="QRIS"
						value={formatCurrency(latestShift.qrisRevenue ?? 0)}
					/>
					<InfoItem
						label="Durasi"
						value={
							latestShift.endTime
								? formatDuration(latestShift.startTime, latestShift.endTime)
								: "Masih berjalan"
						}
					/>
					<InfoItem
						label="Modal Kasir"
						value={formatCurrency(latestShift.modalAwal ?? 0)}
					/>
					<InfoItem
						label="Setoran Akhir"
						value={formatCurrency(latestShift.setoranAkhir ?? 0)}
					/>
					<InfoItem
						label="Status"
						value={latestShift.endTime ? "Selesai" : "Aktif"}
						highlight={!latestShift.endTime}
					/>
				</div>
			)}
		</section>
	);
}

// ─── MAIN DASHBOARD ───

export default function OperationalDashboard() {
	const shiftStatus = useHybridShiftStatus();
	const dashboardStats = useHybridDashboardStats();
	const currentlyIn = useHybridCurrentlyInStore();
	const allStaff = useHybridPublicUsers();

	const now = new Date();
	const thisMonth = now.getMonth() + 1;
	const thisYear = now.getFullYear();

	const absentStaff = useMemo(() => {
		if (!allStaff || !currentlyIn) return [];
		const inStoreIds = new Set(currentlyIn.map((s: any) => s._id));
		return allStaff.filter((s: any) => !inStoreIds.has(s._id));
	}, [allStaff, currentlyIn]);

	return (
		<div className="fade-in slide-in-from-bottom-4 animate-in space-y-6 duration-500">
			<RealtimeStatusSection
				shiftStatus={shiftStatus}
				currentlyIn={currentlyIn}
				dashboardStats={dashboardStats}
			/>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<StaffAttendanceSection
					currentlyIn={currentlyIn}
					allStaff={allStaff}
					absentStaff={absentStaff}
				/>
				<StaffPerformanceSection
					allStaff={allStaff}
					month={thisMonth}
					year={thisYear}
				/>
			</div>

			<ShiftSummarySection shiftStatus={shiftStatus} />
		</div>
	);
}
