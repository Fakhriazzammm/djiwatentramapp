import { useNavigate } from "./nav";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { profileCompleteness } from "../../lib/karyawan/analytics";
import { Btn, Chips, DataTable, Drawer, Empty, KpiStrip, LineChart, Page, PageHead, Panel, ProgressList, SearchBox, SectionTitle, Segmented, SourceError, StatusTag } from "./kit";
import { num, rupiah, useAttendanceAnalysis, useDirectory, type DirectoryRow } from "./data";
import { contractInfo, employmentLabel, fmtDate, initials, teamStats } from "./team";

type Filter = "all" | "active" | "incomplete" | "expiring" | "inactive";
type View = "tabel" | "kartu";
type Tab = "profil" | "kontrak" | "kehadiran" | "gaji";

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
	return <span aria-hidden="true" className="flex shrink-0 items-center justify-center bg-[#111114] font-mono text-[11px] font-semibold text-white" style={{ width: size, height: size }}>{initials(name)}</span>;
}

function csvCell(v: unknown) {
	return `"${String(v ?? "").replaceAll('"', '""')}"`;
}

export default function DataKaryawanPage() {
	const navigate = useNavigate();
	const dir = useDirectory();
	const month = useAttendanceAnalysis("this_month");
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [view, setView] = useState<View>("tabel");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [open, setOpen] = useState<DirectoryRow | null>(null);
	const [tab, setTab] = useState<Tab>("profil");

	const rows = dir.rows ?? [];
	const stats = useMemo(() => teamStats(rows), [rows]);
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((r) => {
			const comp = profileCompleteness(r).percent;
			if (filter === "active" && !r.isActive) return false;
			if (filter === "inactive" && r.isActive) return false;
			if (filter === "incomplete" && comp >= 90) return false;
			if (filter === "expiring") {
				const left = contractInfo(r).daysLeft;
				if (left === null || left > 30) return false;
			}
			return !q || `${r.name} ${r.username} ${r.roleName} ${r.raw.phone ?? ""}`.toLowerCase().includes(q);
		});
	}, [rows, filter, query]);

	const toggle = (id: string) => setSelected((prev) => {
		const next = new Set(prev);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	});

	const exportCsv = () => {
		const list = selected.size ? rows.filter((r) => selected.has(r._id)) : filtered;
		const head = ["Nama", "Email", "Jabatan", "Status", "No HP", "Tipe kerja", "Mulai kerja", "Kelengkapan"];
		const body = list.map((r) => [r.name, r.username, r.roleName, r.isActive ? "Aktif" : "Nonaktif", r.raw.phone ?? "", employmentLabel(r.raw.employmentType), r.raw.startDate ?? "", `${profileCompleteness(r).percent}%`]);
		const csv = [head, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
		const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `data-karyawan-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success(`${list.length} karyawan diekspor`);
	};

	const filters: { value: Filter; label: string }[] = [
		{ value: "all", label: `Semua ${stats.total}` },
		{ value: "active", label: `Aktif ${stats.active}` },
		{ value: "inactive", label: `Nonaktif ${stats.inactive}` },
		{ value: "incomplete", label: `Belum lengkap ${stats.incomplete}` },
		{ value: "expiring", label: `Kontrak berakhir ${stats.expiring.length}` },
	];

	return (
		<Page>
			<PageHead title="Data Karyawan" subtitle={`${stats.total} akun. Klik baris untuk profil lengkap dengan analisis kehadiran dan gaji.`} actions={<><Btn onClick={exportCsv}>Ekspor CSV</Btn><Btn primary onClick={() => void navigate({ to: "/admin/operational-team/register" })}>+ Tambah karyawan</Btn></>} />
			{dir.error ? <SourceError message={dir.error} /> : null}
			<KpiStrip cols={5} items={[
				{ label: "Total akun", value: dir.rows ? stats.total : null, format: num },
				{ label: "Aktif", value: dir.rows ? stats.active : null, format: num, sub: `${stats.inactive} nonaktif` },
				{ label: "Data belum lengkap", value: dir.rows ? stats.incomplete : null, format: num, sub: `rata-rata ${stats.avgCompleteness}%` },
				{ label: "Rata-rata masa kerja", value: dir.rows ? (stats.avgTenureMonths === null ? "—" : `${stats.avgTenureMonths} bln`) : null },
				{ label: "Kontrak dengan PDF", value: dir.rows ? `${stats.pdfRatio}%` : null, sub: `${stats.contractCount} kontrak` },
			]} />

			<div className="grid gap-3 lg:grid-cols-3">
				<Panel title="Tipe kerja" tone="red"><ProgressList rows={stats.byType.length ? stats.byType.map((t) => ({ label: t.label, value: `${t.count} · ${Math.round((t.count / Math.max(1, stats.active)) * 100)}%`, ratio: t.count / Math.max(1, stats.active) })) : [{ label: "Belum ada data tipe kerja", value: "0", ratio: 0 }]} /></Panel>
				<Panel title="Kelengkapan per bidang" tone="red"><ProgressList rows={stats.fields.map((f) => ({ label: f.label, value: `${f.percent}%`, ratio: f.percent / 100, tone: f.percent >= 80 ? "green" : f.percent >= 50 ? "amber" : "red" }))} /></Panel>
				<Panel title="Masa kerja" tone="red"><ProgressList rows={stats.tenureBuckets.map((b) => ({ label: b.label, value: `${b.count} orang`, ratio: b.count / Math.max(1, stats.active), tone: "blue" }))} /></Panel>
			</div>

			<SectionTitle color="#111114" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{filtered.length} dari {stats.total} ditampilkan</span>}>Daftar karyawan</SectionTitle>
			<div className="flex flex-wrap items-center gap-3">
				<SearchBox value={query} onChange={setQuery} placeholder="Cari nama, email, jabatan, No HP" />
				<Chips value={filter} onChange={setFilter} options={filters} />
				<div className="ml-auto"><Segmented id="kk-view" label="Tampilan" value={view} onChange={setView} options={[{ value: "tabel", label: "Tabel" }, { value: "kartu", label: "Kartu" }]} /></div>
			</div>

			<AnimatePresence>
				{selected.size > 0 ? (
					<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-wrap items-center gap-3 bg-[#111114] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white">
						<b>{selected.size} dipilih</b>
						<button type="button" className="border border-white/40 px-2.5 py-1.5 hover:bg-white/10" onClick={exportCsv}>Ekspor</button>
						<button type="button" className="border border-white/40 px-2.5 py-1.5 hover:bg-white/10" onClick={() => setSelected(new Set())}>Batal</button>
					</motion.div>
				) : null}
			</AnimatePresence>

			{dir.loading ? <div className="h-64 animate-pulse bg-[#ececf0]" /> : view === "tabel" ? (
				<DataTable
					rows={filtered}
					rowKey={(r) => r._id}
					empty="Tidak ada karyawan yang cocok dengan filter."
					onRow={(r) => { setOpen(r); setTab("profil"); }}
					columns={[
						{ key: "sel", header: "", render: (r) => <input type="checkbox" aria-label={`Pilih ${r.name}`} checked={selected.has(r._id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r._id)} className="h-4 w-4 accent-[#111114]" /> },
						{ key: "name", header: "Karyawan", render: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} /><div className="min-w-0"><div className="truncate font-medium">{r.name}</div><div className="truncate font-mono text-[10px] text-[#666672]">{r.username}</div></div></div> },
						{ key: "role", header: "Jabatan", render: (r) => <div><div>{r.raw.jabatan || r.roleName || "—"}</div>{r.raw.jabatan && r.raw.jabatan !== r.roleName ? <div className="font-mono text-[10px] text-[#666672]">{r.roleName}</div> : null}</div> },
						{ key: "type", header: "Tipe kerja", render: (r) => employmentLabel(r.raw.employmentType) },
						{ key: "status", header: "Status", render: (r) => { const i = contractInfo(r); return !r.isActive ? <StatusTag tone="mute">Nonaktif</StatusTag> : i.daysLeft !== null && i.daysLeft <= 30 ? <StatusTag tone="warn">Berakhir {fmtDate(i.endDate)}</StatusTag> : <StatusTag tone="ok">Aktif</StatusTag>; } },
						{ key: "ontime", header: "Ketepatan", align: "right", render: (r) => { const s = month.analysis?.byUser[r._id]; return s ? `${s.onTimePct}%` : "—"; } },
						{ key: "comp", header: "Kelengkapan data", render: (r) => { const c = profileCompleteness(r).percent; return <div className="flex min-w-[140px] items-center gap-2"><div className="h-[6px] flex-1 bg-[#ececf0]"><motion.div className="h-full" style={{ background: c < 80 ? "#d69e2e" : "#2f6fdf" }} initial={{ width: 0 }} animate={{ width: `${c}%` }} transition={{ duration: 0.7 }} /></div><span className="font-mono text-[10px] text-[#666672]">{c}%</span></div>; } },
					]}
				/>
			) : filtered.length === 0 ? <Empty>Tidak ada karyawan yang cocok dengan filter.</Empty> : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{filtered.map((r, i) => {
						const c = profileCompleteness(r).percent;
						return (
							<motion.button key={r._id} type="button" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} whileHover={{ y: -2 }} onClick={() => { setOpen(r); setTab("profil"); }} className="border border-[#e4e4e8] bg-white p-4 text-left hover:border-[#cfcfd6]">
								<div className="flex items-center gap-3"><Avatar name={r.name} size={40} /><div className="min-w-0"><div className="truncate text-[14px] font-semibold">{r.name}</div><div className="truncate text-[12px] text-[#666672]">{r.raw.jabatan || r.roleName}</div></div></div>
								<div className="mt-3 flex items-center justify-between"><StatusTag tone={r.isActive ? "ok" : "mute"}>{r.isActive ? "Aktif" : "Nonaktif"}</StatusTag><span className="font-mono text-[10px] text-[#666672]">Data {c}%</span></div>
								<div className="mt-3 h-[6px] bg-[#ececf0]"><motion.div className="h-full bg-[#2f6fdf]" initial={{ width: 0 }} animate={{ width: `${c}%` }} transition={{ duration: 0.7 }} /></div>
							</motion.button>
						);
					})}
				</div>
			)}

			<Drawer open={Boolean(open)} onClose={() => setOpen(null)} title="Profil karyawan">
				{open ? <Profile row={open} tab={tab} onTab={setTab} stat={month.analysis?.byUser[open._id]} series={month.analysis ? { labels: month.analysis.labels, values: month.analysis.seriesPresent } : null} /> : null}
			</Drawer>
		</Page>
	);
}

function Profile({ row, tab, onTab, stat, series }: { row: DirectoryRow; tab: Tab; onTab: (t: Tab) => void; stat?: { days: number; hours: number; late: number; onTimePct: number; sessions: number; unclosed: number }; series: { labels: string[]; values: number[] } | null }) {
	const comp = profileCompleteness(row);
	const info = contractInfo(row);
	const salary = Number(row.raw.monthlySalary ?? 0);
	return (
		<div>
			<div className="mb-4 flex items-center gap-3"><Avatar name={row.name} size={52} /><div className="min-w-0"><div className="truncate font-display text-[20px]">{row.name}</div><div className="text-[13px] text-[#666672]">{row.raw.jabatan || row.roleName}</div></div></div>
			<div className="mb-4"><Chips value={tab} onChange={onTab} options={[{ value: "profil", label: "Profil" }, { value: "kontrak", label: "Kontrak" }, { value: "kehadiran", label: "Kehadiran" }, { value: "gaji", label: "Gaji" }]} /></div>
			<AnimatePresence mode="wait">
				<motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
					{tab === "profil" ? (
						<>
							<dl className="divide-y divide-[#efeff2] border border-[#e4e4e8] text-[13px]">
								{[["Email", row.username], ["No HP", row.raw.phone], ["Tipe kerja", employmentLabel(row.raw.employmentType)], ["Mulai kerja", fmtDate(row.raw.startDate)], ["Lokasi", row.raw.location], ["Kontak darurat", row.raw.emergencyContactName ? `${row.raw.emergencyContactName} · ${row.raw.emergencyContactPhone ?? ""}` : null]].map(([k, v]) => (
									<div key={String(k)} className="flex justify-between gap-4 px-3 py-2.5"><dt className="text-[#666672]">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v || "—"}</dd></div>
								))}
							</dl>
							<div><div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase text-[#666672]"><span>Kelengkapan data</span><span>{comp.percent}%</span></div><div className="h-[7px] bg-[#ececf0]"><motion.div className="h-full bg-[#2f6fdf]" initial={{ width: 0 }} animate={{ width: `${comp.percent}%` }} /></div>{comp.missing.length ? <p className="mt-2 text-[12px] text-[#666672]">Belum ada: {comp.missing.join(", ")}.</p> : null}</div>
						</>
					) : null}
					{tab === "kontrak" ? (
						<>
							<dl className="divide-y divide-[#efeff2] border border-[#e4e4e8] text-[13px]">
								<div className="flex justify-between px-3 py-2.5"><dt className="text-[#666672]">Status</dt><dd>{!info.hasContract ? <StatusTag tone="bad">Belum ada kontrak</StatusTag> : info.permanent ? <StatusTag tone="ok">Tetap</StatusTag> : info.daysLeft !== null && info.daysLeft <= 30 ? <StatusTag tone="warn">Berakhir dalam {info.daysLeft} hari</StatusTag> : <StatusTag tone="ok">Aktif</StatusTag>}</dd></div>
								<div className="flex justify-between px-3 py-2.5"><dt className="text-[#666672]">Berakhir</dt><dd className="font-medium">{info.permanent ? "Tanpa batas" : `${fmtDate(info.endDate)}${info.estimated ? " (perkiraan)" : ""}`}</dd></div>
							</dl>
							{(row.raw.contracts ?? []).map((c) => (
								<div key={c.id} className="flex items-center justify-between gap-3 border border-[#e4e4e8] p-3 text-[13px]"><div className="min-w-0"><div className="font-medium">{c.registrationNumber ?? "Tanpa nomor"}</div><div className="text-[12px] text-[#666672]">{c.status}</div></div>{c.pdfUrl ? <a className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#2f6fdf] underline" href={c.pdfUrl} target="_blank" rel="noreferrer">Buka PDF</a> : <StatusTag tone="bad">PDF belum ada</StatusTag>}</div>
							))}
						</>
					) : null}
					{tab === "kehadiran" ? (
						stat ? (
							<>
								<ProgressList rows={[{ label: "Ketepatan waktu", value: `${stat.onTimePct}%`, ratio: stat.onTimePct / 100, tone: stat.onTimePct >= 90 ? "green" : "amber" }, { label: "Terlambat", value: `${stat.late} kali`, ratio: Math.min(1, stat.late / 5), tone: stat.late > 2 ? "red" : "amber" }, { label: "Hari hadir bulan ini", value: `${stat.days} hari`, ratio: Math.min(1, stat.days / 26), tone: "blue" }]} />
								<p className="text-[12px] text-[#666672]">Jam kerja tertutup: {stat.hours.toFixed(1)} jam{stat.unclosed ? ` · ${stat.unclosed} sesi belum ditutup tidak dihitung` : ""}.</p>
								{series && series.labels.length ? <LineChart redrawKey={row._id} height={130} labels={series.labels} series={[{ name: "Tim hadir/hari", values: series.values, color: "#2f6fdf" }]} /> : null}
							</>
						) : <Empty>Belum ada absensi bulan ini.</Empty>
					) : null}
					{tab === "gaji" ? (
						<dl className="divide-y divide-[#efeff2] border border-[#e4e4e8] text-[13px]">
							<div className="flex justify-between px-3 py-2.5"><dt className="text-[#666672]">Gaji bulanan (kontrak)</dt><dd className="font-medium">{salary > 0 ? rupiah(salary) : "Belum diisi"}</dd></div>
							<div className="px-3 py-2.5 text-[12px] text-[#666672]">Rincian per periode (pokok, lembur, potongan) ada di halaman Payroll.</div>
						</dl>
					) : null}
				</motion.div>
			</AnimatePresence>
			<p className="mt-5 text-[12px] text-[#666672]">Ubah data karyawan dilakukan di Admin.</p>
		</div>
	);
}
