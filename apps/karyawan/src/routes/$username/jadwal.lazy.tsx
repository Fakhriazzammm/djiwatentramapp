import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { PersonalSchedule } from "@yumipos/web-shared/components/attendance/PersonalSchedule";
import { useStaffProfile } from "../$username.lazy";
import { Calendar } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createLazyFileRoute("/$username/jadwal")({
	component: JadwalPage,
});

const MONTHS = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function JadwalPage() {
	const { staff } = useStaffProfile();
	const now = new Date();
	const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
	const [selectedYear, setSelectedYear] = useState(now.getFullYear());

	return (
		<div className="space-y-4">
			{/* Period Selector */}
			<div className="flex items-center justify-between gap-2 px-2">
				<div className="flex items-center gap-1.5">
					<Calendar className="h-3 w-3 text-primary" />
					<span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Periode</span>
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

			{/* Personal Schedule */}
			{staff && (
				<PersonalSchedule
					userId={staff._id}
					userName={staff.name}
					userRole={staff.roleName}
					month={selectedMonth}
					year={selectedYear}
				/>
			)}
		</div>
	);
}
