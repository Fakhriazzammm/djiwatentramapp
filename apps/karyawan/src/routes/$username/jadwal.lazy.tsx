import { createLazyFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStaffProfile } from "../$username.lazy";
import { useHybridStaffLogs } from "@yumipos/web-shared";
import { PersonalSchedule } from "@yumipos/web-shared/components/attendance/PersonalSchedule";
import { History, CalendarDays } from "lucide-react";

export const Route = createLazyFileRoute("/$username/jadwal")({
	component: JadwalPage,
});

const MONTHS = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function JadwalPage() {
	const { staff, isUnlocked, refreshKey } = useStaffProfile();
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());

	const logs = useHybridStaffLogs(
		isUnlocked && staff
			? { userId: staff._id, month: selectedMonth, year: selectedYear, refreshTrigger: refreshKey }
			: undefined
	);

	return (
		<div className="space-y-4">
			{/* Kalender Jadwal Shift */}
			{staff && (
				<div className="space-y-2">
					<div className="flex items-center gap-1.5 px-2">
						<CalendarDays className="h-3 w-3 text-primary" />
						<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Jadwal Shift</span>
					</div>
					<div className="rounded-xl border bg-card/80 p-2">
						<PersonalSchedule userId={staff._id} userName={staff.name} userRole={staff.roleName} month={new Date().getMonth() + 1} year={new Date().getFullYear()} />
					</div>
				</div>
			)}

			{/* Log Kehadiran */}
			<div className="flex items-center justify-between gap-2 px-2">
				<div className="flex items-center gap-1.5">
					<History className="h-3 w-3 text-primary" />
					<span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Periode</span>
				</div>
				<div className="flex items-center gap-1.5">
					<select 
						className="bg-transparent text-xs font-black focus:outline-none py-0.5"
						value={selectedMonth}
						onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
					>
						{MONTHS.map((m, i) => (
							<option key={m} value={i + 1}>{m}</option>
						))}
					</select>
					<select 
						className="bg-transparent text-xs font-black focus:outline-none py-0.5"
						value={selectedYear}
						onChange={(e) => setSelectedYear(parseInt(e.target.value))}
					>
						{[2024, 2025, 2026].map(y => (
							<option key={y} value={y}>{y}</option>
						))}
					</select>
				</div>
			</div>

			{/* Log Kehadiran List */}
			<div className="rounded-xl border bg-card overflow-hidden">
				{!logs || logs.length === 0 ? (
					<div className="p-8 text-center text-xs text-muted-foreground">
						Tidak ada data absensi untuk periode ini.
					</div>
				) : (
					<div className="divide-y divide-border">
						{logs.map((log: any) => (
							<div key={log._id} className="flex items-center justify-between p-3 text-sm">
								<div className="flex items-center gap-2.5">
									<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-[10px] font-bold flex-col leading-tight shrink-0">
										<span>{new Date(log.timestamp).getDate()}</span>
										<span className="text-[10px] opacity-60">{MONTHS[new Date(log.timestamp).getMonth()].substring(0, 3).toUpperCase()}</span>
									</div>
									<div>
										<p className="font-bold capitalize text-xs">{log.type === "check_in" ? "Masuk" : "Keluar"}</p>
										<p className="text-[10px] text-muted-foreground mt-0.5">
											{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
										</p>
									</div>
								</div>
								<div className="text-right">
									<div className={`flex items-center gap-1.5 font-bold text-[10px] ${log.type === "check_in" ? "text-emerald-600" : "text-orange-600"}`}>
										<div className={`h-1.5 w-1.5 rounded-full ${log.type === "check_in" ? "bg-emerald-500" : "bg-orange-500"}`} />
										{log.type === "check_in" ? "MASUK" : "KELUAR"}
									</div>
									{log.notes && <p className="text-[11px] text-muted-foreground truncate max-w-[80px] mt-0.5">{log.notes}</p>}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
