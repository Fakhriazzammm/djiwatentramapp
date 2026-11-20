import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { profileCompleteness } from "@/lib/karyawan-analytics";
import { Btn, Chips, DataTable, Empty, KpiStrip, Page, PageHead, Panel, ProgressList, SourceError, StatusTag } from "../kit";
import { num, useDirectory, type DirectoryRow } from "../data";
import { contractInfo, contractStatusLabels, employmentLabel, fmtDate, teamStats, type ContractInfo } from "../team";

type Tab = "kontrak" | "dokumen" | "onboarding";
type Filter = "all" | "expiring" | "nopdf";

function Timeline({ items }: { items: { row: DirectoryRow; info: ContractInfo }[] }) {
	const visible = items.filter((x) => x.info.daysLeft !== null && x.info.daysLeft >= 0 && x.info.daysLeft <= 90);
	return (
		<div className="relative mx-2 mb-8 mt-14 h-[2px] bg-[#cfcfd6]" role="img" aria-label="Garis waktu kontrak 90 hari">
			{[0, 45, 90].map((d) => <span key={d} className="absolute top-2 -translate-x-1/2 font-mono text-[10px] text-[#666672]" style={{ left: `${(d / 90) * 100}%` }}>{d === 0 ? "HARI INI" : `+${d} HARI`}</span>)}
			{visible.map((x, i) => (
				<motion.div key={x.row._id} className="absolute bottom-0 w-[2px] bg-[#d69e2e]" style={{ left: `${((x.info.daysLeft ?? 0) / 90) * 100}%`, height: 28 + (i % 3) * 14 }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.1 * i }}>
					<span className="absolute bottom-full left-1/2 mb-1 w-[84px] -translate-x-1/2 text-center font-mono text-[10px] leading-tight">{x.row.name.split(" ")[0]}<br /><span className="text-[#666672]">{fmtDate(x.info.endDate).replace(/ \d{4}$/, "")}</span></span>
				</motion.div>
			))}
			{visible.length === 0 ? <div className="absolute inset-x-0 -top-10 text-center text-[12px] text-[#666672]">Tidak ada kontrak berakhir dalam 90 hari.</div> : null}
		</div>
	);
}

export default function DokumenPage() {
	const navigate = useNavigate();
	const dir = useDirectory();
	const [tab, setTab] = useState<Tab>("kontrak");
	const [filter, setFilter] = useState<Filter>("all");
	const rows = useMemo(() => dir.rows ?? [], [dir.rows]);
	const stats = useMemo(() => teamStats(dir.rows ?? []), [dir.rows]);
	const infos = useMemo(() => rows.map((row) => ({ row, info: contractInfo(row) })), [rows]);
	const contractRows = infos.filter((x) => x.info.hasContract || x.row.raw.employmentType);
	const list = contractRows.filter((x) => (filter === "expiring" ? x.info.daysLeft !== null && x.info.daysLeft <= 30 : filter === "nopdf" ? x.info.hasContract && !x.info.hasPdf : true));
	const expiring90 = infos.filter((x) => x.info.daysLeft !== null && x.info.daysLeft <= 90).sort((a, b) => (a.info.daysLeft ?? 0) - (b.info.daysLeft ?? 0));
	const contractPage = () => void navigate({ to: "/admin/operational-team/register/contract" });

	const docField = (fn: (r: DirectoryRow) => boolean) => (rows.length ? Math.round((rows.filter(fn).length / rows.length) * 100) : 0);
	const tone = (p: number): "green" | "amber" | "red" => (p >= 80 ? "green" : p >= 50 ? "amber" : "red");

	return (
		<Page>
			<PageHead title="Dokumen & Kontrak" subtitle={`${stats.contractCount} kontrak tercatat, ${Math.round((stats.pdfRatio / 100) * stats.contractCount)} dengan PDF.`} actions={<Btn primary onClick={contractPage}>Kelola kontrak</Btn>} />
			{dir.error ? <SourceError message={dir.error} /> : null}
			<KpiStrip items={[
				{ label: "Kontrak tercatat", value: dir.rows ? stats.contractCount : null, format: num },
				{ label: "Segera berakhir", value: dir.rows ? stats.expiring.length : null, sub: "≤ 30 hari" },
				{ label: "Tanpa PDF", value: dir.rows ? stats.noPdf.length : null, sub: stats.noPdf.length ? "perlu diunggah" : "semua ada PDF" },
				{ label: "Kontrak dengan PDF", value: dir.rows ? `${stats.pdfRatio}%` : null, sub: "dari semua kontrak" },
			]} />

			<Chips value={tab} onChange={setTab} options={[{ value: "kontrak", label: "Kontrak" }, { value: "dokumen", label: "Dokumen pribadi" }, { value: "onboarding", label: "Onboarding" }]} />

			{tab === "kontrak" ? (
				<>
					<Panel title={<>Garis waktu kontrak · 90 hari ke depan</>}><Timeline items={expiring90} /></Panel>
					<div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
						<Panel title="Perlu tindakan" tone="red" right={<StatusTag tone={stats.expiring.length + stats.noPdf.length ? "warn" : "ok"}>{stats.expiring.length + stats.noPdf.length}</StatusTag>}>
							{stats.expiring.length + stats.noPdf.length === 0 ? <Empty>Tidak ada kontrak yang perlu tindakan.</Empty> : (
								<ul className="divide-y divide-[#efeff2]">
									{stats.expiring.map((x) => (
										<li key={`e-${x.row._id}`} className="flex items-center gap-3 py-3 text-[13px]"><div className="min-w-0 flex-1"><div className="truncate font-medium">{x.row.name} · {employmentLabel(x.row.raw.employmentType)}</div><div className="text-[12px] text-[#666672]">Berakhir {fmtDate(x.info.endDate)}{x.info.estimated ? " (perkiraan)" : ""} · {x.info.daysLeft} hari lagi</div></div><StatusTag tone="warn">Segera berakhir</StatusTag><Btn small primary onClick={contractPage}>Perpanjang</Btn></li>
									))}
									{stats.noPdf.map((r) => (
										<li key={`p-${r._id}`} className="flex items-center gap-3 py-3 text-[13px]"><div className="min-w-0 flex-1"><div className="truncate font-medium">{r.name}</div><div className="text-[12px] text-[#666672]">{r.roleName}</div></div><StatusTag tone="bad">PDF belum ada</StatusTag><Btn small onClick={contractPage}>Unggah</Btn></li>
									))}
								</ul>
							)}
						</Panel>
						<Panel title="Kelengkapan dokumen" tone="red"><ProgressList rows={[
							{ label: "Kontrak dengan PDF", value: `${stats.pdfRatio}%`, ratio: stats.pdfRatio / 100, tone: tone(stats.pdfRatio) },
							{ label: "Nomor identitas", value: `${docField((r) => Boolean(r.raw.identityNumber))}%`, ratio: docField((r) => Boolean(r.raw.identityNumber)) / 100, tone: tone(docField((r) => Boolean(r.raw.identityNumber))) },
							{ label: "CV", value: `${docField((r) => Boolean(r.raw.cvUrl))}%`, ratio: docField((r) => Boolean(r.raw.cvUrl)) / 100, tone: tone(docField((r) => Boolean(r.raw.cvUrl))) },
							{ label: "Kontak darurat", value: `${docField((r) => Boolean(r.raw.emergencyContactPhone))}%`, ratio: docField((r) => Boolean(r.raw.emergencyContactPhone)) / 100, tone: tone(docField((r) => Boolean(r.raw.emergencyContactPhone))) },
						]} /></Panel>
					</div>
					<Chips value={filter} onChange={setFilter} options={[{ value: "all", label: "Semua" }, { value: "expiring", label: `Segera berakhir ${stats.expiring.length}` }, { value: "nopdf", label: `Tanpa PDF ${stats.noPdf.length}` }]} />
					<DataTable
						rows={list}
						rowKey={(x) => x.row._id}
						empty="Tidak ada kontrak yang cocok."
						columns={[
							{ key: "n", header: "Karyawan", render: (x) => <div><div className="font-medium">{x.row.name}</div><div className="font-mono text-[10px] text-[#666672]">{x.row.roleName}</div></div> },
							{ key: "t", header: "Tipe", render: (x) => employmentLabel(x.row.raw.employmentType) },
							{ key: "s", header: "Mulai", render: (x) => fmtDate(x.row.raw.startDate) },
							{ key: "e", header: "Berakhir", render: (x) => (x.info.permanent ? "Tanpa batas" : `${fmtDate(x.info.endDate)}${x.info.estimated ? " *" : ""}`) },
							{ key: "st", header: "Status", render: (x) => (!x.info.hasContract ? <StatusTag tone="bad">Belum ada kontrak</StatusTag> : x.info.status === "resigned" || x.info.status === "ended" ? <StatusTag tone="mute">{contractStatusLabels[x.info.status]}</StatusTag> : x.info.daysLeft !== null && x.info.daysLeft <= 30 ? <StatusTag tone="warn">{x.info.daysLeft < 0 ? "Melewati tanggal akhir" : "Segera berakhir"}</StatusTag> : x.info.status === "active" ? <StatusTag tone="ok">Aktif</StatusTag> : <StatusTag tone="mute">Belum aktif</StatusTag>) },
							{ key: "pdf", header: "PDF", render: (x) => { const c = (x.row.raw.contracts ?? []).find((k) => k.pdfUrl); return c?.pdfUrl ? <a href={c.pdfUrl} target="_blank" rel="noreferrer" className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#2f6fdf] underline">Buka</a> : <span className="text-[#9a9aa5]">—</span>; } },
						]}
					/>
					<p className="font-mono text-[10px] text-[#666672]">* Tanggal berakhir diperkirakan 12 bulan dari tanggal mulai bila durasi kontrak belum tercatat.</p>
				</>
			) : null}

			{tab === "dokumen" ? (
				<DataTable
					rows={rows}
					rowKey={(r) => r._id}
					columns={[
						{ key: "n", header: "Karyawan", render: (r) => <div><div className="font-medium">{r.name}</div><div className="font-mono text-[10px] text-[#666672]">{r.roleName}</div></div> },
						{ key: "id", header: "Identitas", render: (r) => (r.raw.identityNumber ? <StatusTag tone="ok">Ada</StatusTag> : <StatusTag tone="bad">Belum</StatusTag>) },
						{ key: "cv", header: "CV", render: (r) => (r.raw.cvUrl ? <a href={r.raw.cvUrl} target="_blank" rel="noreferrer" className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#2f6fdf] underline">Buka</a> : <StatusTag tone="bad">Belum</StatusTag>) },
						{ key: "em", header: "Kontak darurat", render: (r) => (r.raw.emergencyContactPhone ? <StatusTag tone="ok">Ada</StatusTag> : <StatusTag tone="bad">Belum</StatusTag>) },
					]}
				/>
			) : null}

			{tab === "onboarding" ? (
				<div className="grid gap-3 lg:grid-cols-2">
					{rows.map((r) => {
						const c = profileCompleteness(r);
						const info = contractInfo(r);
						const steps = [["Akun dibuat", true], ["Profil dasar", Boolean(r.raw.phone && r.raw.address)], ["Identitas", Boolean(r.raw.identityNumber)], ["Kontrak", info.hasContract], ["PDF kontrak", info.hasPdf], ["Gaji diatur", Number(r.raw.monthlySalary ?? 0) > 0]] as const;
						const done = steps.filter((s) => s[1]).length;
						return (
							<Panel key={r._id} title={r.name} right={<span className="font-mono text-[10px] text-[#666672]">{done}/{steps.length} · {c.percent}%</span>}>
								<ul>
									{steps.map(([label, ok]) => <li key={label} className="flex items-center gap-3 border-t border-[#efeff2] py-2 text-[13px] first:border-0"><span className={`flex h-4 w-4 items-center justify-center text-[10px] text-white ${ok ? "bg-[#16a34a]" : "border border-[#cfcfd6] bg-white"}`}>{ok ? "✓" : ""}</span><span className={ok ? "text-[#666672] line-through" : ""}>{label}</span></li>)}
								</ul>
								<div className="mt-3 flex justify-end"><Btn small onClick={() => void navigate({ to: "/admin/rekrutmen/onboarding" })}>Buka onboarding</Btn></div>
							</Panel>
						);
					})}
				</div>
			) : null}
		</Page>
	);
}
