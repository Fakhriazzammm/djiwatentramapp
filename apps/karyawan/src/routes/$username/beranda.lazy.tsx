import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useHybridStaffStats, useHybridSiteSettings } from "@yumipos/web-shared";
import { useStaffProfile } from "../$username.lazy";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { motion } from "framer-motion";
import { Camera } from "lucide-react";
import { SmartBanner } from "@/components/karyawan/SmartBanner";
import { MenuGrid } from "@/components/karyawan/MenuGrid";

export const Route = createLazyFileRoute("/$username/beranda")({
	component: BerandaPage,
});

function BerandaPage() {
	const { staff, navigate, username } = useStaffProfile();
	const now = new Date();

	const greeting = useMemo(() => {
		const hour = now.getHours();
		if (hour < 11) return "Selamat Pagi";
		if (hour < 15) return "Selamat Siang";
		if (hour < 18) return "Selamat Sore";
		return "Selamat Malam";
	}, [now]);

	const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
	const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

	const settings = useHybridSiteSettings() as any;
	const storeName = settings?.storeName || "TENTREM KOFFIE";

	const stats = useHybridStaffStats(
		staff
			? { userId: staff._id, month: now.getMonth() + 1, year: now.getFullYear() }
			: undefined
	);

	return (
		<div className="space-y-5">
			{/* ─── Header: Logo + Greeting + Avatar ─── */}
			<motion.div
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				className="flex items-start justify-between"
			>
				<div className="flex items-center gap-2.5 min-w-0">
					{/* Logo Djiwa Tentram */}
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200">
						<span className="text-lg">🌳</span>
					</div>
					<div className="min-w-0">
						<p className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">
							{storeName}
						</p>
						<p className="text-xs font-medium text-muted-foreground truncate">
							{greeting}, ({timeStr})
						</p>
						<h1 className="text-sm font-black tracking-tight truncate">
							{staff?.name || "—"}
						</h1>
						<p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
							{staff?.roleName || "Karyawan"}
						</p>
					</div>
				</div>
				<div className="shrink-0 flex flex-col items-end gap-0.5">
					{staff?.photoUrl ? (
						<img
							src={staff.photoUrl}
							alt={staff.name}
							className="h-10 w-10 rounded-xl object-cover shadow-sm border-2 border-border"
						/>
					) : (
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-base font-black text-primary border-2 border-border">
							{staff?.name?.charAt(0) || "?"}
						</div>
					)}
					<span className="text-[8px] text-muted-foreground/60 font-medium">{dateStr}</span>
				</div>
			</motion.div>

			{/* ─── Smart Banner ─── */}
			<SmartBanner />

			{/* ─── Quick Stats ─── */}
			<div className="grid grid-cols-3 gap-2">
				<div className="rounded-xl border bg-card px-2 py-2 text-center">
					<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Shift</p>
					<p className="text-sm font-black">{stats?.sessionCount ?? 0}</p>
				</div>
				<div className="rounded-xl border bg-card px-2 py-2 text-center">
					<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Hadir</p>
					<p className="text-sm font-black">{stats?.attendanceRate ?? 0}<span className="text-[7px] font-normal text-muted-foreground">%</span></p>
				</div>
				<div className="rounded-xl border bg-card px-2 py-2 text-center">
					<p className="text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70">Hari</p>
					<p className="text-sm font-black">{stats?.daysWorked ?? 0}</p>
				</div>
			</div>

			{/* ─── Menu ─── */}
			<div>
				<h2 className="text-xs font-black uppercase tracking-wider text-foreground mb-3">
					Menu
				</h2>
				<MenuGrid baseRoute={username} />
			</div>

			{/* ─── Quick Action CTA ─── */}
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.3 }}
			>
				<Button
					className="h-11 w-full rounded-xl text-xs font-black shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"
					onClick={() => navigate({ to: "/$username/absensi" as any, params: { username } })}
				>
					<Camera className="h-4 w-4" />
					ABSENSI SEKARANG
				</Button>
			</motion.div>
		</div>
	);
}
