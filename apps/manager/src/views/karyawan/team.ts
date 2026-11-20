import { profileCompleteness, monthsSince } from "../../lib/karyawan/analytics";
import type { DirectoryContract, DirectoryRow, EmploymentContractStatus } from "./data";

export const EMPLOYMENT_LABEL: Record<string, string> = {
	full_time: "Penuh waktu",
	part_time: "Paruh waktu",
	freelance: "Freelance",
	probation: "Percobaan",
};

export const employmentLabel = (type?: string | null) => (type ? (EMPLOYMENT_LABEL[type] ?? type) : "—");

export const contractStatusLabels: Record<EmploymentContractStatus, string> = {
	active: "Aktif",
	resigned: "Resign",
	ended: "Kontrak berakhir",
};

export function getContractStatus(contract?: DirectoryContract): EmploymentContractStatus | null {
	if (contract?.employmentStatus) return contract.employmentStatus;
	switch (contract?.status) {
		case "active":
		case "signed":
		case "renewed":
			return "active";
		case "resigned":
			return "resigned";
		case "expired":
		case "ended":
			return "ended";
		default:
			return null;
	}
}

export type ContractInfo = {
	/** Tanggal berakhir yyyy-MM-dd, atau null bila kontrak tetap / tidak diketahui. */
	endDate: string | null;
	estimated: boolean;
	daysLeft: number | null;
	hasPdf: boolean;
	permanent: boolean;
	hasContract: boolean;
	status: EmploymentContractStatus | null;
};

export function contractInfo(row: DirectoryRow, now = Date.now()): ContractInfo {
	const contracts = row.raw.contracts ?? [];
	const hasContract = contracts.length > 0;
	const hasPdf = contracts.some((c) => Boolean(c.pdfUrl));
	const start = row.raw.startDate ? new Date(row.raw.startDate) : null;
	const type = row.raw.employmentType ?? "";
	const duration = Number(row.raw.contractDuration ?? 0);
	let endDate: string | null = null;
	let estimated = false;
	let permanent = false;
	const explicitEnd = row.raw.contractEndDate ? String(row.raw.contractEndDate).slice(0, 10) : null;
	if (explicitEnd && !Number.isNaN(new Date(explicitEnd).getTime())) {
		endDate = explicitEnd;
	} else if (start && !Number.isNaN(start.getTime())) {
		if (duration > 0) {
			const end = new Date(start);
			end.setMonth(end.getMonth() + duration);
			endDate = end.toISOString().slice(0, 10);
		} else if (hasContract && type !== "full_time" && type !== "") {
			const end = new Date(start);
			end.setMonth(end.getMonth() + 12);
			endDate = end.toISOString().slice(0, 10);
			estimated = true;
		} else if (type === "full_time") {
			permanent = true;
		}
	}
	const status = getContractStatus(contracts[0]);
	const daysLeft = status !== "resigned" && status !== "ended" && endDate ? Math.ceil((new Date(endDate).getTime() - now) / 86_400_000) : null;
	return { endDate, estimated, daysLeft, hasPdf, permanent, hasContract, status };
}

export type TeamStats = {
	total: number;
	active: number;
	inactive: number;
	incomplete: number;
	avgCompleteness: number;
	avgTenureMonths: number | null;
	byType: { label: string; count: number }[];
	tenureBuckets: { label: string; count: number }[];
	fields: { label: string; percent: number }[];
	expiring: { row: DirectoryRow; info: ContractInfo }[];
	noPdf: DirectoryRow[];
	pdfRatio: number;
	contractCount: number;
};

export function teamStats(rows: DirectoryRow[], now = Date.now()): TeamStats {
	const active = rows.filter((r) => r.isActive);
	const comps = active.map((r) => profileCompleteness(r).percent);
	const tenures = active.map((r) => monthsSince(r.raw.startDate, now)).filter((v): v is number => v !== null);
	const typeCount = new Map<string, number>();
	for (const r of active) typeCount.set(employmentLabel(r.raw.employmentType), (typeCount.get(employmentLabel(r.raw.employmentType)) ?? 0) + 1);
	const pct = (fn: (r: DirectoryRow) => boolean) => (active.length ? Math.round((active.filter(fn).length / active.length) * 100) : 0);
	const infos = active.map((row) => ({ row, info: contractInfo(row, now) }));
	const withContract = infos.filter((x) => x.info.hasContract);
	return {
		total: rows.length,
		active: active.length,
		inactive: rows.length - active.length,
		incomplete: active.filter((r) => profileCompleteness(r).percent < 90).length,
		avgCompleteness: comps.length ? Math.round(comps.reduce((a, b) => a + b, 0) / comps.length) : 0,
		avgTenureMonths: tenures.length ? Math.round((tenures.reduce((a, b) => a + b, 0) / tenures.length) * 10) / 10 : null,
		byType: [...typeCount].map(([label, count]) => ({ label, count })),
		tenureBuckets: [
			{ label: "< 6 bulan", count: tenures.filter((t) => t < 6).length },
			{ label: "6–12 bulan", count: tenures.filter((t) => t >= 6 && t < 12).length },
			{ label: "> 12 bulan", count: tenures.filter((t) => t >= 12).length },
		],
		fields: [
			{ label: "Profil dasar (HP, identitas, alamat)", percent: pct((r) => Boolean(r.raw.phone && r.raw.identityNumber && r.raw.address)) },
			{ label: "Kontrak dengan PDF", percent: pct((r) => contractInfo(r, now).hasPdf) },
			{ label: "Gaji bulanan", percent: pct((r) => Number(r.raw.monthlySalary ?? 0) > 0) },
			{ label: "Kontak darurat", percent: pct((r) => Boolean(r.raw.emergencyContactPhone)) },
		],
		expiring: infos.filter((x) => x.info.daysLeft !== null && x.info.daysLeft <= 30).sort((a, b) => (a.info.daysLeft ?? 0) - (b.info.daysLeft ?? 0)),
		noPdf: active.filter((r) => contractInfo(r, now).hasContract && !contractInfo(r, now).hasPdf),
		pdfRatio: withContract.length ? Math.round((withContract.filter((x) => x.info.hasPdf).length / withContract.length) * 100) : 0,
		contractCount: withContract.length,
	};
}

export const fmtDate = (value?: string | null) => {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(d);
};

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
