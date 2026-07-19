import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { formatCurrencyIDR } from "@/lib/export-utils";
import {
	formatDateWIB,
	formatTimeWIB,
	isSameDayWIB,
	getCurrentTotalMinutesWIB,
} from "@/lib/wib-utils";
import {
	useHybridCurrentMonthProgress,
	useHybridSiteSettings,
	useHybridStaffUsers,
} from "@/hooks/use-hybrid-pos-data";
import { useHybridStaffStatsToday } from "@/hooks/use-hybrid-attendance-data";
import { useYumiAuth } from "@/hooks/useYumiAuth";

import { HomeSearchBar } from "@/components/home/home-search-bar";
import { HomeHeroOperational } from "@/components/home/home-hero-operational";
import { HomeClockOutBanner } from "@/components/home/home-clockout-banner";
import { HomeQuickActions } from "@/components/home/home-quick-actions";
import { HomeServiceGrid } from "@/components/home/home-service-grid";
import { HomeStickyStrip } from "@/components/home/home-sticky-strip";
import { HomeRepeatUsage } from "@/components/home/home-repeat-usage";
import { HomeBottomNav } from "@/components/home/home-bottom-nav";
import { HomeTodaysPulse } from "@/components/home/home-todays-pulse";
import { HomeRevenueChart } from "@/components/home/home-revenue-chart";
import { HomeOnDutyCrew } from "@/components/home/home-on-duty-crew";
import { LeaderboardPanel } from "@/routes/admin/-components/leaderboard-panel";

export const Route = createLazyFileRoute("/home")({
	component: HomePage,
});

function HomePage() {
	const navigate = useNavigate();
	const { user, role: userRole } = useYumiAuth();
	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Yumi POS";
	const [refreshCount, setRefreshCount] = useState(0);
	// Force refresh stats saat navigasi balik dari /attendance setelah clock-out
	// Karena pos_attendance_logs view membaca legacy_mirror.documents yg gak trigger realtime
	useEffect(() => {
		if (sessionStorage.getItem("__attendance_clockout__")) {
			sessionStorage.removeItem("__attendance_clockout__");
			setRefreshCount(Date.now());
		}
	}, []);
	const statsToday = useHybridStaffStatsToday(user?._id, refreshCount);
	const monthProgress = useHybridCurrentMonthProgress();
	const [currentTime, setCurrentTime] = useState(new Date());
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		const timer = setInterval(() => {
			setCurrentTime(new Date());
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	const activeShiftInfo = useMemo(() => {
		if (!settings?.shiftSettings?.shiftSchedules) return null;

		const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

		return settings.shiftSettings.shiftSchedules.find((s: any) => {
			if (!s.openTime || !s.closeTime) return false;
			const [openH, openM] = s.openTime.split(':').map(Number);
			const [closeH, closeM] = s.closeTime.split(':').map(Number);
			const openTotal = openH * 60 + openM;
			const closeTotal = closeH * 60 + closeM;
			if (closeTotal < openTotal) { // Overnight shift
				return currentMinutes >= openTotal || currentMinutes <= closeTotal;
			}
			return currentMinutes >= openTotal && currentMinutes <= closeTotal;
		});
	}, [settings]);

	const dateText = useMemo(() => {
		const datePart = new Intl.DateTimeFormat("id-ID", {
			weekday: "long",
			day: "numeric",
			month: "long",
			timeZone: "Asia/Jakarta",
		}).format(currentTime);

		const timePart = currentTime.toLocaleTimeString("id-ID", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZone: "Asia/Jakarta",
		});

		return `${datePart} • ${timePart}`;
	}, [currentTime]);

	const greeting = useMemo(() => {
		const hour = currentTime.getHours();
		if (hour < 11) return "Semangat Pagi";
		if (hour < 15) return "Selamat Siang";
		if (hour < 18) return "Selamat Sore";
		return "Selamat Malam";
	}, [currentTime]);

	const hasFaceDescriptor = !!user?.hasFace;
	const workDurationLabel = `${statsToday?.totalHours ?? 0}j ${statsToday?.totalMinutes ?? 0}m`;

	const shiftPct = useMemo(() => {
		if (!monthProgress?.shiftTarget || monthProgress.shiftTarget <= 0) return null;
		return Math.round((monthProgress.shiftCollected / monthProgress.shiftTarget) * 100);
	}, [monthProgress]);

	const firstName = useMemo(() => user?.name?.split(" ")[0] ?? user?.name ?? "", [user?.name]);
	const primaryActionTitle = !hasFaceDescriptor
		? "Daftarkan Wajah"
		: statsToday?.isWorking
			? "Absen Keluar"
			: "Absen Masuk";

	const handlePrimaryAttendanceAction = () => {
		navigate({ to: "/attendance" as any });
	};

	const handleAvatarClick = () => {
		const to = user?.slug ? (`/${user.slug}` as any) : ("/attendance" as any);
		navigate({ to });
	};

	const hasWorking = !!statsToday?.isWorking;

	const activeShiftName = activeShiftInfo?.name ?? "—";
	const activeShiftTime =
		activeShiftInfo?.openTime && activeShiftInfo?.closeTime
			? `${activeShiftInfo.openTime}–${activeShiftInfo.closeTime}`
			: "";

	return (
		<div className="app-page min-h-app text-foreground pb-safe-with-nav">
			<div className="mx-auto w-full max-w-md px-4 pb-8 pt-4 md:max-w-4xl">
				{/* 1. Search Bar */}
				<HomeSearchBar
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					userSlug={user?.slug}
					userName={user?.name}
				/>

				{/* 2. Hero Operational */}
				<HomeHeroOperational
					greeting={greeting}
					firstName={firstName}
					storeName={storeName}
					dateText={dateText}
					isWorking={hasWorking}
					hasFaceDescriptor={hasFaceDescriptor}
					workDurationLabel={workDurationLabel}
					shiftPct={shiftPct}
					activeShiftName={activeShiftName}
					activeShiftTime={activeShiftTime}
					userRoleName={userRole?.name || "Staff"}
					primaryActionTitle={primaryActionTitle}
					isProcessing={false}
					onPrimaryAction={handlePrimaryAttendanceAction}
					onAvatarClick={handleAvatarClick}
				/>

				{/* 2b. Clock-Out Reminder */}
				<HomeClockOutBanner
					userId={user?._id}
				/>

				{/* 3. Today's Pulse */}
				<section className="mb-4">
					<HomeTodaysPulse />
				</section>

				{/* 4. Revenue Chart */}
				<section className="mb-4">
					<HomeRevenueChart />
				</section>

				{/* 5. On-Duty Crew */}
				<section className="mb-4">
					<HomeOnDutyCrew />
				</section>

				{/* 6. Quick Actions */}
				<section className="mb-4">
					<HomeQuickActions userSlug={user?.slug} />
				</section>

				{/* 7. Service Grid */}
				<section className="mb-4">
					<div className="flex items-center gap-2 mb-3">
						<h2 className="app-overline">Fitur Lainnya</h2>
					</div>
					<HomeServiceGrid permissions={userRole?.permissions} />
				</section>

				{/* 8. Contextual Strip */}
				<div className="mb-4">
					<HomeStickyStrip
						hasFaceDescriptor={hasFaceDescriptor}
						isWorking={statsToday?.isWorking}
					/>
				</div>

				{/* 9. Repeat Usage */}
				<div className="mb-4">
					<HomeRepeatUsage />
				</div>

				{/* 10. Leaderboard Bonus Shift */}
				<section className="mb-4">
					<LeaderboardPanel />
				</section>

				{/* 11. Footer */}
				<div className="text-center text-[11px] font-semibold text-muted-foreground pb-4">
					Tap satu tombol untuk langsung pindah ke halaman kerja.
				</div>
			</div>

			{/* Mobile Bottom Nav */}
			<HomeBottomNav />
		</div>
	);
}
