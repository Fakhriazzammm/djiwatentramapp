import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHybridStaffStats, useHybridSiteSettings } from "@yumipos/web-shared";
import { useStaffProfile } from "../$username.lazy";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { motion } from "framer-motion";
import { Camera, Clock } from "lucide-react";

export const Route = createLazyFileRoute("/$username/beranda")({
	component: BerandaPage,
});

function BerandaPage() {
	const { staff, navigate, refreshKey, username } = useStaffProfile();
	const now = new Date();

	const greeting = useMemo(() => {
		const hour = now.getHours();
		if (hour < 11) return "Semangat Pagi";
		if (hour < 15) return "Selamat Siang";
		if (hour < 18) return "Selamat Sore";
		return "Selamat Malam";
	}, [now]);

	const dateText = useMemo(() => {
		const datePart = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
		const timePart = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
		return `${datePart} • ${timePart}`;
	}, [now]);

	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";

	const stats = useHybridStaffStats(
		staff
			? { userId: staff._id, month: now.getMonth() + 1, year: now.getFullYear(), refreshTrigger: refreshKey }
			: undefined
	);

	return (
		<div className="space-y-4">
			{/* Hero Card */}
			<div className="app-card glass-strong relative overflow-hidden">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_30%)]" />
				<div className="flex items-center gap-3 px-3 pt-3 pb-2">
					<button
						type="button"
						onClick={() => navigate({ to: "/$username/absensi" as any, params: { username } })}
						className="relative shrink-0 active:scale-95 transition-transform"
					>
						{staff.photoUrl ? (
							<img src={staff.photoUrl} alt={staff.name} className="h-12 w-12 rounded-xl object-cover shadow-md" />
						) : (
							<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky-400 text-lg font-black text-white shadow-md">
								{staff.name?.charAt(0)?.toUpperCase()}
							</div>
						)}
					</button>
					<div className="flex-1 min-w-0">
						<p className="text-[8px] font-bold uppercase tracking-[0.18em] text-primary/60 leading-none">{storeName}</p>
						<h2 className="text-sm font-black tracking-tight text-foreground leading-tight truncate mt-0.5">
							{greeting}, {staff.name?.split(" ")[0] ?? staff.name}
						</h2>
						<div className="flex items-center gap-1.5 mt-0.5">
							<span className="rounded-full border border-primary/20 bg-primary/10 px-1.5 py-[1px] text-[7px] font-black uppercase tracking-[0.12em] text-primary">{staff.roleName || "Staff"}</span>
							{stats?.attendanceRate !== undefined && (
								<span className="rounded-full bg-emerald-500/15 px-1.5 py-[1px] text-[7px] font-black text-emerald-600 uppercase tracking-[0.12em]">{stats.attendanceRate}% hadir</span>
							)}
						</div>
					</div>
				</div>
				<div className="px-3 pb-3">
					<p className="text-[8px] text-muted-foreground/60 font-medium">{dateText}</p>
					<div className="mt-1.5 grid grid-cols-3 divide-x divide-border/40 rounded-xl border border-border/50 bg-background/60 shadow-sm overflow-hidden">
						<div className="px-2 py-1.5 text-center">
							<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Shift</p>
							<p className="text-xs font-black">{stats?.sessionCount ?? 0}</p>
						</div>
						<div className="px-2 py-1.5 text-center">
							<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Hadir</p>
							<p className="text-xs font-black">{stats?.attendanceRate ?? 0}<span className="text-[7px] font-normal text-muted-foreground">%</span></p>
						</div>
						<div className="px-2 py-1.5 text-center">
							<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Hari</p>
							<p className="text-xs font-black">{stats?.daysWorked ?? 0}</p>
						</div>
					</div>
				</div>
				<div className="pb-3 px-3">
					<Button
						className="w-full h-9 rounded-xl text-[10px] font-black shadow-sm flex items-center justify-center gap-1.5"
						onClick={() => navigate({ to: "/$username/absensi" as any, params: { username } })}
					>
						<Camera className="h-3.5 w-3.5" />
						ABSENSI SEKARANG
					</Button>
				</div>
			</div>

			{/* Quick Action Float */}
			<div className="fixed bottom-16 left-0 right-0 px-4 pointer-events-none">
				<Button
					className="pointer-events-auto h-11 w-full max-w-2xl mx-auto rounded-xl text-xs font-black shadow-xl shadow-primary/30 flex items-center justify-center gap-1.5"
					onClick={() => navigate({ to: "/$username/absensi" as any, params: { username } })}
				>
					<Camera className="h-4 w-4" />
					ABSENSI SEKARANG
				</Button>
			</div>
		</div>
	);
}
