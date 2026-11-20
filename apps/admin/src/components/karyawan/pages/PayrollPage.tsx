import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useHybridPayrollReport } from "@/hooks/use-hybrid-attendance-data";
import { useHybridPayrollRunItems, useHybridPayrollRuns } from "@/hooks/use-hybrid-payroll-data";
import { Btn, DataTable, KpiStrip, Note, Page, PageHead, Panel, ProgressList, SectionTitle, SourceError, StatusTag } from "../kit";
import { rupiah } from "../data";

type Row = {
	_id: string;
	name: string;
	roleName: string;
	daysWorked: number;
	totalHours: number;
	sessionCount: number;
	monthlyFixedSalary: number;
	totalShiftSalary: number;
	totalAllowance: number;
	overtimeBonusPerHour: number;
	totalOvertimeBonus: number;
	totalTargetBonus: number;
	totalPenalty: number;
	netSalary: number;
};

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STAGES = ["Draf", "Tinjau", "Setujui", "Bayar"] as const;

function stageOf(status: unknown): number {
	const s = String(status ?? "").toLowerCase();
	if (/paid|dibayar|disbursed|completed/.test(s)) return 3;
	if (/approved|final|disetujui|posted/.test(s)) return 2;
	if (/review|ditinjau|pending|processing/.test(s)) return 1;
	return 0;
}

export default function PayrollPage() {
	const navigate = useNavigate();
	const now = new Date();
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [year, setYear] = useState(now.getFullYear());
	const [raise, setRaise] = useState(0);
	const [extraOt, setExtraOt] = useState(0);
	const report = useHybridPayrollReport({ month, year }) as { rows?: Row[] } | null | undefined;
	const runs = useHybridPayrollRuns() as { id?: string; run_date?: string; status?: string; total_net_pay?: number | string; total_employees?: number }[] | null | undefined;
	const rows = report?.rows ?? [];

	const run = useMemo(() => (runs ?? []).find((r) => r.run_date && Number(r.run_date.slice(0, 4)) === year && Number(r.run_date.slice(5, 7)) === month), [runs, month, year]);
	const stage = run ? stageOf(run.status) : 0;
	const runItems = useHybridPayrollRunItems(run?.id) as { user_id: string; user_name?: string; net_pay: number | string; total_shifts?: number; deductions?: number | string }[] | null | undefined;

	const total = rows.reduce((s, r) => s + (r.netSalary ?? 0), 0);
	const paid = rows.filter((r) => r.netSalary > 0);
	const zero = rows.length - paid.length;
	const overtime = rows.reduce((s, r) => s + (r.totalOvertimeBonus ?? 0), 0);
	const penalty = rows.reduce((s, r) => s + (r.totalPenalty ?? 0), 0);
	const simulated = paid.reduce((s, r) => s + r.netSalary * (1 + raise / 100) + extraOt * (r.overtimeBonusPerHour || 10000), 0);
	const comp = {
		pokok: rows.reduce((s, r) => s + (r.monthlyFixedSalary ?? 0), 0),
		shift: rows.reduce((s, r) => s + (r.totalShiftSalary ?? 0), 0),
		tunjangan: rows.reduce((s, r) => s + (r.totalAllowance ?? 0), 0),
		lembur: overtime,
		bonus: rows.reduce((s, r) => s + (r.totalTargetBonus ?? 0), 0),
	};
	const compTotal = Math.max(1, Object.values(comp).reduce((a, b) => a + b, 0));
	const suspect = rows.filter((r) => r.daysWorked > 0 && r.totalHours / r.daysWorked > 16);
	const step = (d: number) => {
		const next = new Date(year, month - 1 + d, 1);
		setMonth(next.getMonth() + 1);
		setYear(next.getFullYear());
	};
	const primary = ["Tinjau payroll", "Setujui payroll", "Bayar payroll", "Lihat slip gaji"][stage];

	return (
		<Page>
			<PageHead title={`Payroll ${MONTHS[month - 1]} ${year}`} subtitle="Perhitungan gaji dari kontrak, absensi, dan lembur. Persetujuan dan pembayaran dijalankan di mesin payroll." actions={<><Btn onClick={() => step(-1)} title="Bulan sebelumnya">‹</Btn><Btn onClick={() => step(1)} title="Bulan berikutnya">›</Btn><Btn onClick={() => void navigate({ to: "/admin/operational-team/payroll/slip" })}>Slip gaji</Btn><Btn primary onClick={() => void navigate({ to: stage === 3 ? "/admin/operational-team/payroll/slip" : "/admin/operational-team/payroll" })}>{primary}</Btn></>} />

			<div className="grid grid-cols-4 gap-px border border-[#e4e4e8] bg-[#e4e4e8]" role="list" aria-label="Tahap payroll">
				{STAGES.map((label, i) => (
					<motion.div key={label} role="listitem" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={`px-4 py-3.5 font-mono text-[11px] uppercase tracking-[0.1em] ${i === stage ? "bg-[#111114] text-white" : i < stage ? "bg-white text-[#166534]" : "bg-white text-[#9a9aa5]"}`}>{i < stage ? "✓ " : ""}{label}</motion.div>
				))}
			</div>
			{!run ? <Note tone="info">Belum ada payroll run untuk {MONTHS[month - 1]} {year}. Angka di bawah dihitung langsung dari absensi dan aturan gaji.</Note> : null}
			{report === null ? <SourceError message="Laporan payroll tidak dapat dimuat" /> : null}

			<KpiStrip items={[
				{ label: "Total gaji bersih", value: report ? total : null, format: rupiah, sub: `${paid.length} karyawan bergaji` },
				{ label: "Baris Rp 0", value: report ? zero : null, sub: zero ? "belum ada data gaji / absensi" : "semua terisi" },
				{ label: "Total lembur", value: report ? overtime : null, format: rupiah, sub: `potongan ${rupiah(penalty)}` },
				{ label: "Rata-rata per karyawan", value: report ? (paid.length ? total / paid.length : 0) : null, format: rupiah, sub: `${rows.length} baris payroll` },
			]} />

			{run ? (
				<Panel title="Payroll run vs perhitungan absensi" tone="blue" right={<StatusTag tone={Math.abs(Number(run.total_net_pay ?? 0) - total) < 1 ? "ok" : "warn"}>{Math.abs(Number(run.total_net_pay ?? 0) - total) < 1 ? "Sama" : "Berbeda"}</StatusTag>}>
					<div className="grid gap-px border border-[#e4e4e8] bg-[#e4e4e8] sm:grid-cols-3">
						<div className="bg-white p-3"><div className="font-mono text-[10px] uppercase text-[#666672]">Payroll run ({run.status})</div><div className="font-display text-[20px] tabular-nums">{rupiah(Number(run.total_net_pay ?? 0))}</div><div className="font-mono text-[10px] text-[#666672]">{run.total_employees ?? 0} karyawan</div></div>
						<div className="bg-white p-3"><div className="font-mono text-[10px] uppercase text-[#666672]">Hitung dari absensi + jadwal</div><div className="font-display text-[20px] tabular-nums">{rupiah(total)}</div><div className="font-mono text-[10px] text-[#666672]">{paid.length} karyawan</div></div>
						<div className="bg-white p-3"><div className="font-mono text-[10px] uppercase text-[#666672]">Selisih</div><div className="font-display text-[20px] tabular-nums">{rupiah(Math.abs(total - Number(run.total_net_pay ?? 0)))}</div><div className="font-mono text-[10px] text-[#666672]">{total >= Number(run.total_net_pay ?? 0) ? "perhitungan lebih besar" : "run lebih besar"}</div></div>
					</div>
					{runItems && runItems.length ? <p className="mt-3 text-[12px] text-[#666672]">Run berisi {runItems.length} karyawan: {runItems.slice(0, 4).map((i) => `${i.user_name ?? i.user_id} (${rupiah(Number(i.net_pay))})`).join(", ")}{runItems.length > 4 ? "…" : ""}. Karyawan yang belum masuk run dihitung lewat absensi dan jadwal di bawah.</p> : null}
				</Panel>
			) : null}

			{suspect.length > 0 ? <Note>{suspect.length} karyawan memiliki jam kerja tidak wajar (lebih dari 16 jam per hari kerja): {suspect.slice(0, 3).map((r) => r.name).join(", ")}. Kemungkinan check-in belum ditutup, sehingga lembur membengkak. Rapikan di halaman Kehadiran sebelum menyetujui.</Note> : null}

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
				<Panel title="Komposisi gaji" tone="red"><ProgressList rows={[{ label: "Gaji pokok bulanan", value: rupiah(comp.pokok), ratio: comp.pokok / compTotal }, { label: "Gaji per shift", value: rupiah(comp.shift), ratio: comp.shift / compTotal }, { label: "Tunjangan harian", value: rupiah(comp.tunjangan), ratio: comp.tunjangan / compTotal, tone: "green" }, { label: "Lembur", value: rupiah(comp.lembur), ratio: comp.lembur / compTotal, tone: "amber" }, { label: "Bonus target", value: rupiah(comp.bonus), ratio: comp.bonus / compTotal, tone: "green" }]} /></Panel>
				<Panel title="Simulator" tone="blue" right={<StatusTag tone="info">coba skenario</StatusTag>}>
					<div className="space-y-4">
						<label className="block"><div className="mb-1 flex justify-between font-mono text-[10px] uppercase text-[#666672]"><span>Kenaikan gaji</span><b>{raise}%</b></div><input type="range" min={0} max={20} value={raise} onChange={(e) => setRaise(Number(e.target.value))} className="w-full accent-[#111114]" /></label>
						<label className="block"><div className="mb-1 flex justify-between font-mono text-[10px] uppercase text-[#666672]"><span>Tambahan lembur / orang</span><b>{extraOt} jam</b></div><input type="range" min={0} max={40} value={extraOt} onChange={(e) => setExtraOt(Number(e.target.value))} className="w-full accent-[#111114]" /></label>
						<div className="border-t border-[#efeff2] pt-3"><div className="font-mono text-[10px] uppercase text-[#666672]">Total setelah simulasi</div><motion.div key={Math.round(simulated)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="font-display text-[28px] tabular-nums">{rupiah(simulated)}</motion.div><div className="font-mono text-[10px] text-[#666672]">selisih {simulated - total >= 0 ? "+" : "−"}{rupiah(Math.abs(simulated - total))}</div></div>
					</div>
				</Panel>
			</div>

			<SectionTitle color="#111114" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{rows.length} baris payroll</span>}>Rincian per karyawan</SectionTitle>
			{report === undefined ? <div className="h-56 animate-pulse bg-[#ececf0]" /> : (
				<DataTable
					rows={rows}
					rowKey={(r) => r._id}
					columns={[
						{ key: "name", header: "Karyawan", render: (r) => <div><div className="font-medium">{r.name}</div><div className="font-mono text-[10px] text-[#666672]">{r.roleName}</div></div> },
						{ key: "days", header: "Hari", align: "right", render: (r) => r.daysWorked },
						{ key: "hours", header: "Jam", align: "right", render: (r) => <span className={r.daysWorked > 0 && r.totalHours / r.daysWorked > 16 ? "font-semibold text-[#d92d20]" : ""}>{r.totalHours.toFixed(1)}</span> },
						{ key: "base", header: "Pokok + shift", align: "right", render: (r) => rupiah(r.monthlyFixedSalary + r.totalShiftSalary) },
						{ key: "ot", header: "Lembur", align: "right", render: (r) => rupiah(r.totalOvertimeBonus) },
						{ key: "net", header: "Bersih", align: "right", render: (r) => <b>{rupiah(r.netSalary)}</b> },
						{ key: "st", header: "Status", render: (r) => (r.netSalary <= 0 ? <StatusTag tone="bad">Belum ada gaji</StatusTag> : r.daysWorked > 0 && r.totalHours / r.daysWorked > 16 ? <StatusTag tone="warn">Jam tidak wajar</StatusTag> : <StatusTag tone="ok">Siap</StatusTag>) },
					]}
				/>
			)}
		</Page>
	);
}
