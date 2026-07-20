import { useMemo } from "react";
import { TrendingUp, ShoppingCart, Users, Target } from "lucide-react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import { isSameDayWIB } from "@/lib/wib-utils";
import {
	useHybridShiftReportRows,
	useHybridCurrentMonthProgress,
	useHybridSiteSettings,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridStaffStatsToday } from "@/hooks/use-hybrid-attendance-data";

export function HomeTodaysPulse() {
	const shiftRows = useHybridShiftReportRows();
	const monthProgress = useHybridCurrentMonthProgress();
	const settings = useHybridSiteSettings();
	const todayStats = useHybridStaffStatsToday();

	const todayData = useMemo(() => {
		if (!shiftRows) return null;
		const todayShifts = shiftRows.filter((s: any) =>
			isSameDayWIB(s.startTime, Date.now()),
		);
		const revenue = todayShifts.reduce(
			(acc: number, s: any) => acc + (s.totalRevenue || 0),
			0,
		);
		const orders = todayShifts.reduce(
			(acc: number, s: any) => acc + (s.orderCount || 0),
			0,
		);
		const items = todayShifts.reduce(
			(acc: number, s: any) => acc + (s.totalItemsSold || 0),
			0,
		);
		return { revenue, orders, items };
	}, [shiftRows]);

	const shiftPct = useMemo(() => {
		if (!monthProgress?.shiftTarget || monthProgress.shiftTarget <= 0)
			return null;
		return Math.round(
			(monthProgress.shiftCollected / monthProgress.shiftTarget) * 100,
		);
	}, [monthProgress]);

	const activeShiftName = useMemo(() => {
		if (!settings?.shiftSettings?.shiftSchedules) return null;
		const now = new Date();
		const currentMinutes = now.getHours() * 60 + now.getMinutes();
		const active = settings.shiftSettings.shiftSchedules.find((s: any) => {
			if (!s.openTime || !s.closeTime) return false;
			const [openH, openM] = s.openTime.split(":").map(Number);
			const [closeH, closeM] = s.closeTime.split(":").map(Number);
			const openTotal = openH * 60 + openM;
			const closeTotal = closeH * 60 + closeM;
			if (closeTotal < openTotal) {
				return currentMinutes >= openTotal || currentMinutes <= closeTotal;
			}
			return currentMinutes >= openTotal && currentMinutes <= closeTotal;
		});
		return active?.name ?? null;
	}, [settings]);

	const cards = [
		{
			label: "Revenue",
			icon: <TrendingUp className="h-4 w-4" />,
			value: todayData ? formatCurrencyIDR(todayData.revenue) : "\u2014",
			sub: "Hari ini",
			color: "text-emerald-600",
			bg: "bg-emerald-500/5",
			border: "border-emerald-500/10",
		},
		{
			label: "Orders",
			icon: <ShoppingCart className="h-4 w-4" />,
			value: todayData ? `${todayData.orders}` : "\u2014",
			sub: todayData ? `${todayData.items} item` : "Total order",
			color: "text-blue-600",
			bg: "bg-blue-500/5",
			border: "border-blue-500/10",
		},
		{
			label: "On-Duty",
			icon: <Users className="h-4 w-4" />,
			value: activeShiftName ?? "\u2014",
			sub: todayStats?.isWorking ? "Kamu aktif" : "Shift aktif",
			color: "text-amber-600",
			bg: "bg-amber-500/5",
			border: "border-amber-500/10",
		},
		{
			label: "Target",
			icon: <Target className="h-4 w-4" />,
			value: shiftPct !== null ? `${shiftPct}%` : "\u2014",
			sub: "Bulan ini",
			color: "text-primary",
			bg: "bg-primary/5",
			border: "border-primary/10",
		},
	];

	if (!todayData) {
		return (
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						key={i}
						className="h-20 rounded-xl shimmer-bg"
					/>
				))}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{cards.map((card) => (
				<div
					key={card.label}
					className={`rounded-xl border ${card.border} ${card.bg} p-3 flex flex-col justify-between`}
				>
					<div className="flex items-center gap-1.5 mb-1">
						<div
							className={`p-1 rounded ${card.bg} ${card.color}`}
						>
							{card.icon}
						</div>
						<span className="text-[9px] font-bold uppercase tracking-tight text-muted-foreground">
							{card.label}
						</span>
					</div>
					<p className={`text-sm font-extrabold ${card.color}`}>
						{card.value}
					</p>
					<p className="text-[8px] text-muted-foreground">{card.sub}</p>
				</div>
			))}
		</div>
	);
}
