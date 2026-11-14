import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useHybridPayslips, useHybridStaffLogs, useHybridStaffStats } from "@yumipos/web-shared";
import { DsBar, DsChart, DsGroup, DsGroupLabel, DsIcon, DsIconButton, DsPageTitle, DsPills, DsRow, DsTag, DsTiles } from "@yumipos/web-shared/components/ds";
import { Eye, EyeOff } from "lucide-react";
import { useStaffProfile } from "../$username.lazy";
import { rupiah, useLatestRunItem } from "@/components/karyawan/use-staff-data";

export const Route = createLazyFileRoute("/$username/gaji")({
	component: GajiPage,
});

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SLIP: Record<string, ["ok" | "warn" | "info" | "danger" | undefined, string]> = { generated: ["info", "Slip dibuat"], sent: ["ok", "Terkirim"], acknowledged: ["ok", "Diterima"], disputed: ["danger", "Dispute"] };

function GajiPage() {
	const { staff, navigate, username, isUnlocked, refreshKey } = useStaffProfile();
	const now = new Date();
	const month = now.getMonth() + 1, year = now.getFullYear();
	const [hide, setHide] = useState(() => typeof window !== "undefined" && localStorage.getItem("saldo_visible") === "false");
	const [sel, setSel] = useState<string>("now");

	const run = useLatestRunItem(staff?._id);
	const stats = useHybridStaffStats(isUnlocked && staff ? { userId: staff._id, month, year, refreshTrigger: refreshKey } : undefined);
	const logs = useHybridStaffLogs(isUnlocked && staff ? { userId: staff._id, month, year, refreshTrigger: refreshKey } : undefined);
	const slips = useHybridPayslips(isUnlocked && staff ? { userId: staff._id } : undefined);
	const slipList: any[] = (Array.isArray(slips) ? slips : []).filter((p) => p.status !== "draft");
	const mask = (v: string) => (hide ? "••••••" : v);
	const go = (to: string) => navigate({ to: `/$username/${to}` as any, params: { username } });

	// Shifts per week (real check-ins this month)
	const weekly = useMemo(() => {
		const w = [0, 0, 0, 0, 0];
		for (const l of Array.isArray(logs) ? logs : []) if (l.type === "check_in") w[Math.min(4, Math.floor((new Date(l.timestamp + 7 * 3600_000).getUTCDate() - 1) / 7))]++;
		return w;
	}, [logs]);

	const picked = sel === "now" ? null : slipList.find((p) => p.id === sel);
	const net = picked ? Number(picked.net_pay ?? 0) : run ? run.net_pay || run.gross_pay : 0;
	const rows: [string, string, number][] = run ? [
		["Gaji pokok", "Tetap bulanan", run.fixed_salary],
		["Gaji shift", `${run.total_shifts} shift`, run.shift_pay],
		["Tunjangan", `${run.attendance_days} hari hadir`, run.daily_allowance_total],
		["Lembur", `${Number(run.overtime_hours ?? 0).toFixed(1)} jam`, run.overtime_pay],
		["Bonus target", run.bonus_pay ? "Tercapai" : "Belum ada", run.bonus_pay],
		["Potongan", run.deductions ? "Denda / potongan" : "Tidak ada", -run.deductions],
	] : [];

	return (
		<div>
			<DsPageTitle right={<DsIconButton aria-label={hide ? "Tampilkan" : "Sembunyikan"} onClick={() => setHide((v) => { localStorage.setItem("saldo_visible", String(v)); return !v; })}>{hide ? <EyeOff size={19} /> : <Eye size={19} />}</DsIconButton>}>Gaji</DsPageTitle>
			<DsPills
				value={sel}
				onChange={setSel}
				items={[["now", `${MONTHS_ID[month - 1]} ${year}`], ...slipList.slice(0, 5).map((p): [string, string] => [p.id, String(p.period_name ?? "Slip")])]}
			/>

			<div style={{ padding: "18px 4px 8px" }}>
				<div className="ds-sub">{picked ? "Gaji bersih" : "Gaji berjalan · diperbarui tiap absen keluar"}</div>
				<div className="ds-display">{!picked && run === undefined ? "…" : mask(rupiah(net))}</div>
				<div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
					{picked ? <DsTag tone={SLIP[picked.status]?.[0]}>{SLIP[picked.status]?.[1] ?? picked.status}</DsTag> : <DsTag tone="info">Berjalan</DsTag>}
					{!picked && !!run?.bonus_pay && <DsTag tone="ok">+{rupiah(run.bonus_pay)} bonus</DsTag>}
				</div>
			</div>

			{!picked && (
				<>
					<DsGroup white>
						<div style={{ display: "flex", justifyContent: "space-between" }}><b>Shift per minggu</b><span className="ds-sub">{MONTHS_ID[month - 1]}</span></div>
						<div style={{ marginTop: 10 }}><DsChart bars={weekly.map((v, i) => ({ label: `M${i + 1}`, value: v, display: String(v), muted: i === Math.floor((now.getDate() - 1) / 7) }))} /></div>
					</DsGroup>

					<DsGroupLabel>Rincian</DsGroupLabel>
					<DsGroup>
						{run === null && <div className="ds-sub" style={{ padding: "8px 0" }}>Belum ada perhitungan gaji bulan ini. Muncul setelah absen keluar pertama.</div>}
						{rows.map(([t, s, v]) => (
							<DsRow key={t} title={t} sub={s} trail={<b style={{ color: v < 0 ? "var(--ds-danger)" : v ? "var(--ds-ink)" : "var(--ds-faint)" }}>{mask(v ? rupiah(Math.abs(v)) : "—")}</b>} />
						))}
					</DsGroup>

					<DsGroupLabel action={<button type="button" onClick={() => go("leaderboard")}>Leaderboard</button>}>Kehadiran</DsGroupLabel>
					<DsGroup>
						<DsTiles items={[{ value: stats?.sessionCount ?? 0, label: "Shift" }, { value: `${stats?.attendanceRate ?? 0}%`, label: "Hadir" }, { value: stats?.daysWorked ?? 0, label: "Hari" }]} />
						<div style={{ marginTop: 14 }}><DsBar value={Number(stats?.attendanceRate ?? 0)} /></div>
					</DsGroup>
				</>
			)}

			{picked && (
				<DsGroup>
					<DsRow icon={<DsIcon name="employee-payslip" />} title={`Slip ${picked.period_name ?? ""}`} sub={picked.sent_at ? `Dikirim ${new Date(picked.sent_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : "Tersedia"} chevron onClick={() => go("slip-gaji")} />
				</DsGroup>
			)}

			<DsGroupLabel>Slip gaji</DsGroupLabel>
			<DsGroup>
				{slipList.length === 0 && <div className="ds-sub" style={{ padding: "8px 0" }}>Belum ada slip. Kamu akan diberi tahu saat Manager mengirimnya.</div>}
				{slipList.slice(0, 6).map((p) => (
					<DsRow key={p.id} icon={<DsIcon name="employee-payslip" />} title={String(p.period_name ?? "Slip")} sub={p.sent_at ? `Dikirim ${new Date(p.sent_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}` : "Tersedia"} trail={<DsTag tone={SLIP[p.status]?.[0]}>{SLIP[p.status]?.[1] ?? p.status}</DsTag>} onClick={() => go("slip-gaji")} />
				))}
			</DsGroup>
		</div>
	);
}
