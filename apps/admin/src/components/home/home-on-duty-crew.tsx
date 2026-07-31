import { useMemo } from "react";
import { UserCheck, Clock, CheckCircle2, Coffee, CookingPot, User } from "lucide-react";
import { useHybridCrewProduction } from "@/hooks/use-hybrid-crew-data";
import {
	useHybridStaffUsers,
	useHybridShiftReportRows,
} from "@/hooks/use-hybrid-pos-data";
import { isSameDayWIB } from "@/lib/wib-utils";

function GroupRoleIcon({ groupType }: { groupType: string }) {
	if (groupType === "barista") return <Coffee aria-hidden="true" className="h-3 w-3" />;
	if (groupType === "kitchen") return <CookingPot aria-hidden="true" className="h-3 w-3" />;
	return <User aria-hidden="true" className="h-3 w-3" />;
}

export function HomeOnDutyCrew() {
	const crewStats = useHybridCrewProduction();
	const allStaff = useHybridStaffUsers();
	const shiftRows = useHybridShiftReportRows();

	// Ambil nama karyawan yang masuk shift hari ini
	const onDutyNames = useMemo(() => {
		if (!shiftRows) return new Set<string>();
		const todayShifts = shiftRows.filter((s: any) =>
			isSameDayWIB(s.startTime, Date.now()),
		);
		const names = new Set<string>();
		for (const shift of todayShifts) {
			const team = (shift.teamMembers || "")
				.split(",")
				.map((n: string) => n.trim())
				.filter(Boolean);
			for (const n of team) names.add(n.toLowerCase());
		}
		return names;
	}, [shiftRows]);

	// Merge crew stats dengan staff data untuk dapat role
	const crew = useMemo(() => {
		if (!crewStats) return null;
		return crewStats
			.filter((c) => onDutyNames.has(c.name.toLowerCase())) // hanya yang on-duty hari ini
			.map((c) => {
				const user = allStaff?.find(
					(u: any) =>
						u.name?.toLowerCase() === c.name.toLowerCase(),
				);
				return {
					...c,
					role:
						user?.roleName ||
						(c.groupType === "barista"
							? "Barista"
							: c.groupType === "kitchen"
								? "Kitchen"
								: "Staff"),
					avatar: c.name.charAt(0).toUpperCase(),
				};
			});
	}, [crewStats, allStaff, onDutyNames]);

	if (crew === null) {
		return <div className="h-24 rounded-xl shimmer-bg" />;
	}

	if (crew.length === 0) {
		return (
			<div className="rounded-xl border border-border bg-card p-4 text-center">
				<p className="text-xs text-muted-foreground">
					Belum ada aktivitas produksi hari ini
				</p>
				<p className="text-[11px] text-muted-foreground/60 mt-1">
					Data dari bot Telegram akan muncul setelah karyawan tap
					“Dibuat” / “Selesai”
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-border bg-card p-3">
			<h3 className="text-xs font-bold mb-2 flex items-center gap-1.5">
				<UserCheck className="h-3.5 w-3.5 text-primary" />
				On-Duty Crew — Produksi Hari Ini
			</h3>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
				{crew.map((member) => {
					return (
						<div
							key={member.name}
							className="flex flex-col rounded-lg border border-border bg-muted/20 p-2.5"
						>
							<div className="flex items-center gap-2">
								<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
									{member.avatar}
								</div>
								<div className="min-w-0">
									<p className="text-[11px] font-bold text-foreground truncate">
										{member.name}
									</p>
									<p className="flex items-center gap-1 text-[10px] text-muted-foreground">
										<GroupRoleIcon groupType={member.groupType} /> {member.role}
									</p>
								</div>
							</div>
							<div className="mt-2 flex items-center justify-between gap-2">
								<div className="flex items-center gap-1 text-[11px] text-amber-600">
									<Clock className="h-3 w-3" />
									<span className="font-bold">
										{member.dibuat}
									</span>
									<span className="text-muted-foreground">
										dibuat
									</span>
								</div>
								<div className="flex items-center gap-1 text-[11px] text-emerald-600">
									<CheckCircle2 className="h-3 w-3" />
									<span className="font-bold">
										{member.selesai}
									</span>
									<span className="text-muted-foreground">
										selesai
									</span>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
