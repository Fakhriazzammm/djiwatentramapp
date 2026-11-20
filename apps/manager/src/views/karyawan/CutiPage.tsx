import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { requestAdminConfirm } from "./confirm";
import { addDays, WEEKDAY_NAMES } from "../../lib/karyawan/schedule-generator";
import { wibParts } from "../../lib/karyawan/analytics";
import { Btn, Chips, Empty, Feed, KpiStrip, Page, PageHead, Panel, ProgressList, SearchBox, SourceError, StatusTag } from "./kit";
import { agoText, useCoverPlan, useLeave, type CoverCandidate, type LeaveRow } from "./data";
import { fmtDate, initials } from "./team";

type Tab = "pending" | "approved" | "rejected";
const TYPE: Record<string, string> = { izin: "Izin", cuti: "Cuti", sakit: "Sakit", other: "Lainnya" };
const ANNUAL = 12;

function daysBetween(a: string, b: string) {
	return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

function CoverPanel({ row }: { row: LeaveRow }) {
	const { days, error, busy, assign, remove } = useCoverPlan(row.id);
	const [pick, setPick] = useState<Record<string, string>>({});
	const needs = (days ?? []).filter((d) => d.state === "needs" && !d.past);
	const covered = (days ?? []).filter((d) => d.state === "covered").length;
	const submit = async (date: string) => {
		const who = pick[date];
		if (!who) return;
		const ok = await requestAdminConfirm({ title: "Tugaskan pengganti?", message: `Shift ${row.user_name ?? "karyawan"} tanggal ${fmtDate(date)} akan diisi rekan terpilih, dan ${row.user_name ?? "karyawan"} menjadi libur di hari itu. Keduanya diberi tahu.`, confirmText: "Tugaskan", variant: "info" });
		if (!ok) return;
		const r = await assign(date, who);
		if (r.ok) toast.success(r.message);
		else toast.error(r.message);
	};
	return (
		<div className="border-t border-[#efeff2] px-4 py-4">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#2f5d9e]">Pengganti shift</div>
				{days ? <StatusTag tone={needs.length ? "warn" : "ok"}>{needs.length ? `${needs.length} shift belum terisi` : covered ? "Semua terisi" : "Tidak ada shift"}</StatusTag> : null}
			</div>
			{error ? <p className="text-[12px] text-[#b42318]">{error}</p> : days === null ? <div className="h-14 animate-pulse bg-[#ececf0]" /> : days.filter((d) => d.state === "needs" || d.state === "covered").length === 0 ? (
				<p className="text-[12px] text-[#666672]">Tidak ada shift kerja pada tanggal ini yang perlu diisi.</p>
			) : (
				<ul className="space-y-2">
					{days.filter((d) => d.state === "needs" || d.state === "covered").map((d) => (
						<li key={d.date} className="border border-[#e4e4e8] bg-white p-3 text-[13px]">
							<div className="flex items-center justify-between gap-2"><span className="font-medium">{fmtDate(d.date)}</span><span className="font-mono text-[10px] text-[#666672]">{d.shift?.name} {d.shift?.start}–{d.shift?.end}</span></div>
							{d.state === "covered" ? (
								<div className="mt-2 flex items-center justify-between gap-2"><span>Diganti <b className="font-medium">{d.coverName}</b></span>{!d.past ? <Btn small danger disabled={busy === d.date} onClick={() => void remove(d.date).then((ok) => ok ? toast.success("Penugasan dibatalkan, jadwal kembali seperti semula") : toast.error("Gagal membatalkan"))}>Batalkan</Btn> : null}</div>
							) : d.past ? <p className="mt-2 text-[12px] text-[#666672]">Tanggal sudah lewat.</p> : (d.candidates ?? []).length === 0 ? (
								<p className="mt-2 text-[12px] text-[#7a4b00]">Tidak ada rekan yang libur dan tersedia di tanggal ini. Atur manual di Jadwal.</p>
							) : (
								<div className="mt-2 flex gap-2">
									<select aria-label={`Pengganti ${fmtDate(d.date)}`} className="h-9 min-w-0 flex-1 border border-[#d8d8de] bg-white px-2 text-[13px]" value={pick[d.date] ?? ""} onChange={(e) => setPick({ ...pick, [d.date]: e.target.value })}>
										<option value="">Pilih rekan pengganti</option>
										{(d.candidates as CoverCandidate[]).map((c) => <option key={c.userId} value={c.userId}>{c.name}{c.sameRole ? " · sejabatan" : ""} · {c.weekShifts} shift minggu ini</option>)}
									</select>
									<Btn small primary disabled={!pick[d.date] || busy === d.date} onClick={() => void submit(d.date)}>Tugaskan</Btn>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function LeaveDetail({ row, onDecide, busy, usedDays }: { row: LeaveRow; onDecide: (action: "approve" | "reject") => void; busy: boolean; usedDays: number }) {
	const start = row.start_date.slice(0, 10);
	const end = row.end_date.slice(0, 10);
	const length = daysBetween(start, end);
	const pending = (row.status ?? "pending") === "pending";
	return (
		<div>
			<div className="flex items-center justify-between gap-3 px-4 py-3.5"><div className="min-w-0"><div className="truncate text-[15px] font-semibold">{row.user_name ?? "Tanpa nama"}</div><div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{TYPE[row.leave_type] ?? row.leave_type}</div></div><StatusTag tone={pending ? "warn" : row.status === "approved" ? "ok" : "bad"}>{pending ? "Menunggu" : row.status === "approved" ? "Disetujui" : "Ditolak"}</StatusTag></div>
			<dl className="divide-y divide-[#efeff2] border-t border-[#efeff2] text-[13px]">
				<div className="flex justify-between gap-3 px-4 py-3"><dt className="text-[#666672]">Tanggal</dt><dd className="text-right font-medium">{fmtDate(start)} – {fmtDate(end)} ({length} hari)</dd></div>
				<div className="flex justify-between gap-3 px-4 py-3"><dt className="text-[#666672]">Alasan</dt><dd className="min-w-0 break-words text-right">{row.reason || "—"}</dd></div>
				{row.leave_type === "cuti" ? <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-[#666672]">Cuti tahun ini</dt><dd className="font-medium">{usedDays} hari terpakai · sisa {Math.max(0, ANNUAL - usedDays - (pending ? length : 0))} dari {ANNUAL}</dd></div> : null}
				{row.review_notes ? <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-[#666672]">Catatan</dt><dd>{row.review_notes}</dd></div> : null}
			</dl>
			{row.status !== "rejected" && row.status !== "cancelled" ? <CoverPanel row={row} /> : null}
			{pending ? <div className="flex gap-2 border-t border-[#efeff2] p-4"><Btn danger disabled={busy} onClick={() => onDecide("reject")}>Tolak</Btn><div className="flex-1"><Btn primary disabled={busy} onClick={() => onDecide("approve")}>{busy ? "Memproses…" : "Setujui"}</Btn></div></div> : null}
		</div>
	);
}

export default function CutiPage() {
	const { rows, swaps, error, busy, decide, reload } = useLeave();
	const [tab, setTab] = useState<Tab>("pending");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const all = rows ?? [];
	const list = useMemo(() => {
		const q = query.trim().toLowerCase();
		return all.filter((r) => (r.status ?? "pending") === tab && (!q || `${r.user_name ?? ""} ${r.reason} ${TYPE[r.leave_type] ?? ""}`.toLowerCase().includes(q))).sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
	}, [all, tab, query]);
	const current = list.find((r) => r.id === selectedId) ?? list[0];
	const count = (s: string) => all.filter((r) => (r.status ?? "pending") === s).length;
	const year = wibParts(Date.now()).year;
	const used = (userId: string) => all.filter((r) => r.user_id === userId && r.status === "approved" && r.leave_type === "cuti" && r.start_date.startsWith(String(year))).reduce((s, r) => s + daysBetween(r.start_date.slice(0, 10), r.end_date.slice(0, 10)), 0);

	const handle = async (row: LeaveRow, action: "approve" | "reject") => {
		const ok = await requestAdminConfirm({ title: action === "approve" ? "Setujui pengajuan?" : "Tolak pengajuan?", message: `${action === "approve" ? "Menyetujui" : "Menolak"} ${TYPE[row.leave_type] ?? "pengajuan"} ${row.user_name ?? ""} ${fmtDate(row.start_date)} – ${fmtDate(row.end_date)}.`, confirmText: action === "approve" ? "Setujui" : "Tolak", variant: action === "approve" ? "info" : "danger" });
		if (!ok) return;
		const done = await decide(row.id, action);
		if (done) {
			toast.success(action === "approve" ? "Disetujui. Karyawan diberi tahu." : "Ditolak. Karyawan diberi tahu.");
			setSelectedId(null);
		}
	};

	// Kalender bulan ini
	const now = wibParts(Date.now());
	const first = `${now.year}-${String(now.month + 1).padStart(2, "0")}-01`;
	const startOffset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
	const daysInMonth = new Date(Date.UTC(now.year, now.month + 1, 0)).getUTCDate();
	const calendar = Array.from({ length: daysInMonth }, (_, i) => addDays(first, i));
	const onDay = (d: string) => all.filter((r) => r.status !== "rejected" && r.status !== "cancelled" && r.start_date.slice(0, 10) <= d && r.end_date.slice(0, 10) >= d);
	const monthLeaves = all.filter((r) => r.status === "approved" && r.start_date.startsWith(`${now.year}-${String(now.month + 1).padStart(2, "0")}`)).length;

	const byType = ["cuti", "sakit", "izin", "other"].map((t) => ({ t, n: all.filter((r) => r.leave_type === t).length }));
	const typeTotal = Math.max(1, all.length);
	const balances = [...new Set(all.filter((r) => r.leave_type === "cuti").map((r) => r.user_id))].map((id) => ({ id, name: all.find((r) => r.user_id === id)?.user_name ?? "Karyawan", used: used(id) }));
	const history = [...all].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 6).map((r) => ({ source: TYPE[r.leave_type] ?? r.leave_type, tone: r.status === "approved" ? ("green" as const) : r.status === "rejected" ? ("red" as const) : ("amber" as const), text: `${r.user_name ?? "Karyawan"} · ${fmtDate(r.start_date)}–${fmtDate(r.end_date)}`, time: r.created_at ? agoText(new Date(r.created_at).getTime()) : "" }));

	return (
		<Page>
			<PageHead title="Cuti & Izin" subtitle={`${count("pending")} menunggu · ${count("approved")} disetujui`} actions={<Btn onClick={reload}>Muat ulang</Btn>} />
			{error ? <SourceError message={error} /> : null}
			<KpiStrip items={[
				{ label: "Menunggu", value: rows ? count("pending") : null, sub: count("pending") ? "perlu keputusan" : "tidak ada antrean" },
				{ label: "Disetujui", value: rows ? count("approved") : null, sub: `${monthLeaves} mulai bulan ini` },
				{ label: "Ditolak", value: rows ? count("rejected") : null },
				{ label: "Sedang cuti hari ini", value: rows ? all.filter((r) => r.status === "approved" && r.start_date.slice(0, 10) <= wibParts(Date.now()).date && r.end_date.slice(0, 10) >= wibParts(Date.now()).date).length : null },
			]} />
			<div className="flex flex-wrap items-center gap-3"><Chips value={tab} onChange={(v) => { setTab(v); setSelectedId(null); }} options={[{ value: "pending", label: `Menunggu ${count("pending")}` }, { value: "approved", label: `Disetujui ${count("approved")}` }, { value: "rejected", label: `Ditolak ${count("rejected")}` }]} /><SearchBox value={query} onChange={setQuery} placeholder="Cari nama atau alasan" /></div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
				<Panel title="Antrean">
					{rows === undefined && !error ? <div className="h-40 animate-pulse bg-[#ececf0]" /> : list.length === 0 ? <Empty>{tab === "pending" ? "Semua pengajuan sudah diputuskan." : "Tidak ada data."}</Empty> : (
						<ul className="-mx-1 divide-y divide-[#efeff2]">
							<AnimatePresence initial={false}>
								{list.map((r) => (
									<motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }}>
										<button type="button" onClick={() => setSelectedId(r.id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#fafafb] ${current?.id === r.id ? "bg-[#f1f6ff] shadow-[inset_3px_0_0_#2f6fdf]" : ""}`}>
											<span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#111114] font-mono text-[11px] font-semibold text-white">{initials(r.user_name ?? "?")}</span>
											<span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{r.user_name ?? "Tanpa nama"}</span><span className="block font-mono text-[10px] text-[#666672]">{TYPE[r.leave_type] ?? r.leave_type} · {fmtDate(r.start_date)}</span></span>
											{r.created_at ? <span className="font-mono text-[10px] text-[#9a9aa5]">{agoText(new Date(r.created_at).getTime())}</span> : null}
										</button>
									</motion.li>
								))}
							</AnimatePresence>
						</ul>
					)}
				</Panel>
				<Panel title="Keputusan" tone="red">
					<AnimatePresence mode="wait">
						{current ? <motion.div key={current.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="-mx-4 -mb-4"><LeaveDetail row={current} busy={busy === current.id} usedDays={used(current.user_id)} onDecide={(a) => void handle(current, a)} /></motion.div> : <Empty>Pilih pengajuan di antrean.</Empty>}
					</AnimatePresence>
				</Panel>
			</div>

			<Panel title={<>Kalender cuti · {new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(`${first}T00:00:00Z`))}</>}>
				<div className="overflow-x-auto"><div className="grid min-w-[620px] grid-cols-7 gap-px border border-[#e4e4e8] bg-[#e4e4e8]">
					{WEEKDAY_NAMES.map((d) => <div key={d} className="bg-[#fafafb] py-2 text-center font-mono text-[10px] uppercase text-[#666672]">{d.slice(0, 3)}</div>)}
					{Array.from({ length: startOffset }).map((_, i) => <div key={`b${i}`} className="bg-white" />)}
					{calendar.map((d) => {
						const items = onDay(d);
						return (
							<div key={d} className={`min-h-[64px] bg-white p-1.5 ${d === wibParts(Date.now()).date ? "shadow-[inset_0_0_0_2px_#2f6fdf]" : ""}`}>
								<div className="font-mono text-[10px] text-[#666672]">{Number(d.slice(8))}</div>
								{items.slice(0, 2).map((r) => <div key={r.id} title={`${r.user_name} · ${TYPE[r.leave_type]}`} className={`mt-1 truncate px-1 py-0.5 font-mono text-[9px] ${r.leave_type === "sakit" ? "bg-[#fdecea] text-[#b42318]" : "bg-[#fdf3d8] text-[#7a4b00]"}`}>{(r.user_name ?? "?").split(" ")[0]}</div>)}
								{items.length > 2 ? <div className="mt-1 font-mono text-[9px] text-[#666672]">+{items.length - 2}</div> : null}
							</div>
						);
					})}
				</div></div>
			</Panel>

			<Panel title="Tukar & pengganti shift" right={<StatusTag tone={swaps.some((x) => x.status === "pending") ? "warn" : "ok"}>{swaps.filter((x) => x.status === "pending").length} menunggu rekan</StatusTag>}>
				{swaps.length === 0 ? <Empty>Belum ada permintaan tukar atau pengganti shift dari karyawan.</Empty> : (
					<ul className="divide-y divide-[#efeff2] text-[13px]">
						{swaps.slice(0, 8).map((x) => (
							<li key={x.id} className="flex items-center gap-3 py-2.5"><div className="min-w-0 flex-1"><div className="truncate font-medium">{x.user_name ?? "Karyawan"} · {x.leave_type === "pengganti_shift" ? "minta digantikan" : "tukar shift"} {x.metadata?.partner_name ? `dengan ${x.metadata.partner_name}` : ""}</div><div className="font-mono text-[10px] text-[#666672]">{fmtDate(x.start_date)} · {x.reason}</div></div><StatusTag tone={x.status === "approved" ? "ok" : x.status === "pending" ? "warn" : "mute"}>{x.status === "approved" ? "Selesai" : x.status === "pending" ? "Menunggu rekan" : x.status === "rejected" ? "Ditolak rekan" : "Dibatalkan"}</StatusTag></li>
						))}
					</ul>
				)}
			</Panel>

			<div className="grid gap-3 lg:grid-cols-3">
				<Panel title="Jenis pengajuan" tone="red"><ProgressList rows={byType.map(({ t, n }) => ({ label: TYPE[t], value: `${n} · ${Math.round((n / typeTotal) * 100)}%`, ratio: n / typeTotal, tone: t === "sakit" ? "red" : "blue" }))} /></Panel>
				<Panel title={`Cuti terpakai ${year}`} tone="red">{balances.length ? <ProgressList rows={balances.map((b) => ({ label: b.name, value: `${b.used} dari ${ANNUAL} hari`, ratio: Math.min(1, b.used / ANNUAL), tone: b.used >= ANNUAL ? "red" : b.used >= 9 ? "amber" : "green" }))} /> : <Empty>Belum ada cuti disetujui.</Empty>}<p className="mt-3 font-mono text-[10px] text-[#666672]">Jatah standar {ANNUAL} hari per tahun.</p></Panel>
				<Panel title="Riwayat terbaru"><Feed items={history} empty="Belum ada pengajuan." /></Panel>
			</div>
		</Page>
	);
}
