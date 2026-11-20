import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { requestAdminConfirm } from "./confirm";
import { generateSchedule, addDays, mondayOf, validateConsecutive, WEEKDAY_NAMES, type GeneratorShift, type GeneratorStaff } from "../../lib/karyawan/schedule-generator";
import { wibParts } from "../../lib/karyawan/analytics";
import { Btn, Chips, Drawer, KpiStrip, Note, Page, PageHead, Panel, ProgressList, Segmented, SectionTitle, StatusTag } from "./kit";
import { useSchedules, type ScheduleRecord, type ScheduleRowInput } from "./data";
import { fmtDate } from "./team";
import { useLeave } from "./data";

type StaffUser = { _id: string; name: string; roleName: string };
const OFF = "OFF";

function shiftTone(name: string, status?: string) {
	const n = name.toLowerCase();
	if (status === "off" || n === "off") return "bg-[#ececf0] text-[#8e8e93]";
	if (n.includes("pagi")) return "bg-[#eaf3ff] text-[#2f5d9e]";
	if (n.includes("sore") || n.includes("siang")) return "bg-[#fdf3d8] text-[#7a4b00]";
	if (n.includes("malam")) return "bg-[#ece8fb] text-[#5b3fc4]";
	return "bg-[#e8f5ee] text-[#166534]";
}

function hoursOf(start: string | null, end: string | null) {
	if (!start || !end) return 8;
	const [sh, sm] = start.split(":").map(Number);
	const [eh, em] = end.split(":").map(Number);
	let h = eh + em / 60 - (sh + sm / 60);
	if (h <= 0) h += 24;
	return h;
}

const shortDay = (iso: string) => `${WEEKDAY_NAMES[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7].slice(0, 3)} ${iso.slice(8)}`;

export default function JadwalPage() {
	const todayIso = wibParts(Date.now()).date;
	const [weekStart, setWeekStart] = useState(mondayOf(todayIso));
	const weekEnd = addDays(weekStart, 6);
	const sched = useSchedules(weekStart, weekEnd);
	const prevWeek = useSchedules(addDays(weekStart, -7), addDays(weekStart, -1));
	const users: StaffUser[] = sched.staff.map((u) => ({ _id: u.id, name: u.name, roleName: u.roleName }));
	const templates = sched.shifts.map((t) => ({ name: t.name, openTime: t.openTime ?? undefined, closeTime: t.closeTime ?? undefined }));
	const leave = useLeave();

	const [genOpen, setGenOpen] = useState(false);
	const [edit, setEdit] = useState<{ user: StaffUser; date: string; current?: ScheduleRecord } | null>(null);

	const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
	const cells = useMemo(() => {
		const map = new Map<string, ScheduleRecord>();
		for (const s of sched.schedules ?? []) if (s.date >= weekStart && s.date <= weekEnd) map.set(`${s.userId}|${s.date}`, s);
		return map;
	}, [sched.schedules, weekStart, weekEnd]);

	const loading = sched.loading;
	const working = (userId: string, date: string) => {
		const s = cells.get(`${userId}|${date}`);
		return s && s.status !== "off" && s.shiftName.toUpperCase() !== OFF && s.status !== "cancelled" ? s : null;
	};

	const approvedLeaves = (leave.rows ?? []).filter((r) => r.status === "approved");
	const conflicts = useMemo(() => {
		const out: { user: string; date: string }[] = [];
		for (const u of users) for (const d of days) {
			if (!working(u._id, d)) continue;
			if (approvedLeaves.some((l) => l.user_id === u._id && l.start_date.slice(0, 10) <= d && l.end_date.slice(0, 10) >= d)) out.push({ user: u.name, date: d });
		}
		return out;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [users, days, cells, approvedLeaves.length]);

	const perDay = days.map((d) => users.filter((u) => working(u._id, d)).length);
	const minPerDay = Math.max(1, Math.ceil(users.length * 0.5));
	const thin = days.filter((_, i) => perDay[i] < minPerDay);
	const load = users.map((u) => ({ u, hours: days.reduce((sum, d) => { const s = working(u._id, d); return s ? sum + hoursOf(s.startTime?.slice(0, 5) ?? null, s.endTime?.slice(0, 5) ?? null) : sum; }, 0) }));
	const staffIds = new Set(users.map((u) => u._id));
	const visibleCells = [...cells.values()].filter((s) => staffIds.has(s.userId));
	const scheduled = visibleCells.filter((s) => s.status !== "off" && s.shiftName.toUpperCase() !== OFF).length;
	const offCount = visibleCells.length - scheduled;

	const copyLastWeek = async () => {
		const prevStart = addDays(weekStart, -7);
		const source = (prevWeek.schedules ?? []).filter((s) => staffIds.has(s.userId));
		if (source.length === 0) {
			toast.info(`Tidak ada jadwal pada minggu ${fmtDate(prevStart)} untuk disalin.`);
			return;
		}
		const ok = await requestAdminConfirm({ title: "Salin jadwal minggu lalu?", message: `${source.length} jadwal minggu ${fmtDate(prevStart)} akan menggantikan jadwal minggu ini.`, confirmText: "Salin" });
		if (!ok) return;
		const inputs: ScheduleRowInput[] = source.filter((s) => !s.raw?.coveredBy && !s.raw?.coverFor).map((s) => ({ userId: s.userId, date: addDays(s.date, 7), shiftName: s.shiftName, startTime: s.startTime?.slice(0, 5) ?? null, endTime: s.endTime?.slice(0, 5) ?? null, status: s.status === "off" ? "off" : "scheduled" }));
		try {
			await sched.bulkReplace(inputs, [...new Set(inputs.map((i) => i.userId))], weekStart, weekEnd);
			toast.success(`${inputs.length} jadwal disalin`);
		} catch { toast.error("Jadwal belum bisa disalin."); }
	};

	const applyCell = async (choice: string) => {
		if (!edit) return;
		const { user, date } = edit;
		try {
			if (choice === "__clear") await sched.clearCell(user._id, date);
			else if (choice === OFF) await sched.saveCell({ userId: user._id, date, shiftName: OFF, status: "off" });
			else {
				const t = templates.find((x) => x.name === choice);
				await sched.saveCell({ userId: user._id, date, shiftName: choice, startTime: t?.openTime ?? null, endTime: t?.closeTime ?? null, status: "scheduled" });
			}
			toast.success("Jadwal diperbarui");
			setEdit(null);
		} catch {
			toast.error("Jadwal belum bisa disimpan.");
		}
	};

	return (
		<Page>
			<PageHead
				title="Jadwal"
				subtitle={`Minggu ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}. Klik sel untuk mengganti shift.`}
				actions={<>
					<Btn onClick={() => setWeekStart(addDays(weekStart, -7))} title="Minggu sebelumnya">‹</Btn>
					<Btn onClick={() => setWeekStart(mondayOf(todayIso))}>Minggu ini</Btn>
					<Btn onClick={() => setWeekStart(addDays(weekStart, 7))} title="Minggu berikutnya">›</Btn>
					<Btn onClick={() => void copyLastWeek()}>Salin minggu lalu</Btn>
					<Btn primary onClick={() => setGenOpen((v) => !v)}>{genOpen ? "Tutup generator" : "Generate jadwal otomatis"}</Btn>
				</>}
			/>

			<AnimatePresence initial={false}>
				{genOpen ? (
					<motion.div key="gen" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35 }} className="overflow-hidden">
						<Generator users={users} templates={templates} defaultStart={weekStart} onDone={() => setGenOpen(false)} bulkReplace={sched.bulkReplace} />
					</motion.div>
				) : null}
			</AnimatePresence>

			{conflicts.length > 0 ? <Note>{conflicts.length} bentrok: {conflicts.slice(0, 3).map((c) => `${c.user} (${fmtDate(c.date)})`).join(", ")} dijadwalkan masuk padahal cuti disetujui.</Note> : null}
			{thin.length > 0 && users.length > 0 ? <Note tone="info">{thin.length} hari kurang dari {minPerDay} orang masuk: {thin.map((d) => shortDay(d)).join(", ")}.</Note> : null}

			<KpiStrip items={[
				{ label: "Karyawan aktif", value: users.length },
				{ label: "Shift terjadwal", value: loading ? null : scheduled, sub: `${offCount} hari libur` },
				{ label: "Bentrok cuti", value: conflicts.length, sub: conflicts.length ? "perlu diperbaiki" : "tidak ada bentrok" },
				{ label: "Rata-rata jam / orang", value: users.length ? `${Math.round(load.reduce((s, x) => s + x.hours, 0) / users.length)} jam` : "—", sub: "batas 40 jam" },
			]} />

			<SectionTitle color="#111114" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">{users.length} karyawan × 7 hari</span>}>Grid minggu ini</SectionTitle>
			<div className="overflow-x-auto border border-[#e4e4e8] bg-white">
				<table className="w-full min-w-[820px] text-[12px]">
					<thead className="bg-[#fafafb]"><tr><th className="px-4 py-3 text-left font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[#666672]">Karyawan</th>{days.map((d) => <th key={d} className={`px-2 py-3 text-center font-mono text-[10px] font-normal uppercase tracking-[0.1em] ${d === todayIso ? "bg-[#f1f6ff] text-[#2f5d9e]" : "text-[#666672]"}`}>{shortDay(d)}</th>)}</tr></thead>
					<tbody>
						{users.map((u) => (
							<tr key={u._id} className="border-t border-[#efeff2]">
								<td className="px-4 py-2"><div className="font-medium">{u.name}</div><div className="font-mono text-[10px] text-[#666672]">{u.roleName}</div></td>
								{days.map((d) => {
									const s = cells.get(`${u._id}|${d}`);
									const conflict = conflicts.some((c) => c.user === u.name && c.date === d);
									return (
										<td key={d} className="p-1.5">
											<motion.button type="button" whileTap={{ scale: 0.95 }} title={s?.raw?.coveredBy ? "Libur: shift diganti rekan (izin/sakit)" : s?.raw?.coverFor ? "Pengganti shift rekan yang izin/sakit" : undefined} onClick={() => setEdit({ user: u, date: d, current: s })} className={`block w-full px-1 py-2.5 text-center font-mono text-[10px] font-medium uppercase tracking-[0.04em] ${s ? shiftTone(s.shiftName, s.status) : "border border-dashed border-[#d8d8de] text-[#b0b0ba]"} ${conflict ? "outline outline-[1.5px] outline-dashed outline-[#d92d20]" : ""}`}>
												{s ? (s.status === "off" || s.shiftName.toUpperCase() === OFF ? (s.raw?.coveredBy ? "Diganti" : "Libur") : s.raw?.coverFor ? `${s.shiftName} ↺` : s.shiftName) : "+"}
											</motion.button>
										</td>
									);
								})}
							</tr>
						))}
						{users.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-[#666672]">{loading ? "Memuat jadwal…" : "Belum ada karyawan aktif."}</td></tr> : null}
					</tbody>
				</table>
			</div>

			<div className="grid gap-3 lg:grid-cols-2">
				<Panel title="Cakupan per hari" tone="red"><ProgressList rows={days.map((d, i) => ({ label: shortDay(d), value: `${perDay[i]} / ${minPerDay} orang`, ratio: Math.min(1, perDay[i] / Math.max(1, minPerDay)), tone: perDay[i] >= minPerDay ? "green" : "red" }))} /></Panel>
				<Panel title="Beban jam per orang" tone="red"><ProgressList rows={load.map(({ u, hours }) => ({ label: u.name, value: `${Math.round(hours)} jam`, ratio: Math.min(1, hours / 40), tone: hours >= 40 ? "amber" : "green" }))} /></Panel>
			</div>

			<Drawer open={Boolean(edit)} onClose={() => setEdit(null)} title="Ubah jadwal">
				{edit ? (
					<div className="space-y-4">
						<div><div className="text-[16px] font-semibold">{edit.user.name}</div><div className="text-[12px] text-[#666672]">{fmtDate(edit.date)}</div></div>
						<div className="grid gap-2">
							{templates.map((t) => <Btn key={t.name} onClick={() => void applyCell(t.name)}>{t.name}{t.openTime ? ` · ${t.openTime}–${t.closeTime ?? "?"}` : ""}</Btn>)}
							<Btn onClick={() => void applyCell(OFF)}>Libur</Btn>
							{edit.current ? <Btn danger onClick={() => void applyCell("__clear")}>Kosongkan sel</Btn> : null}
						</div>
					</div>
				) : null}
			</Drawer>
		</Page>
	);
}

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const addMonthsYm = (ym: string, n: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const lastDayOf = (ym: string) => `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
const monthsSpan = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + 1;

type GenProps = {
	users: StaffUser[];
	templates: { name: string; openTime?: string; closeTime?: string }[];
	defaultStart: string;
	onDone: () => void;
	bulkReplace: (inputs: ScheduleRowInput[], userIds: string[], start: string, end: string) => Promise<{ inserted: number; deleted: number }>;
};

function Generator({ users, templates, defaultStart, onDone, bulkReplace }: GenProps) {
	const [chosen, setChosen] = useState<Record<string, boolean>>(() => Object.fromEntries(users.map((u) => [u._id, true])));
	const [daysOff, setDaysOff] = useState<Record<string, 1 | 2>>({});
	const [minStaff, setMinStaff] = useState<Record<string, number>>({});
	const today = wibParts(Date.now()).date;
	const [fromMonth, setFromMonth] = useState(addMonthsYm(today.slice(0, 7), 1));
	const [toMonth, setToMonth] = useState(addMonthsYm(today.slice(0, 7), 1));
	// Bulan berjalan dimulai dari hari ini agar jadwal yang sudah lewat tidak ikut tertimpa.
	const first = `${fromMonth}-01`;
	const start = first < today ? today : first;
	const endDate = lastDayOf(toMonth);
	const span = monthsSpan(fromMonth, toMonth);
	const rangeOk = span >= 1 && span <= 6 && endDate >= start;
	const rangeLabel = fromMonth === toMonth ? monthLabel(fromMonth) : `${monthLabel(fromMonth)} – ${monthLabel(toMonth)}`;
	const [rotate, setRotate] = useState(false);
	const [weekend, setWeekend] = useState(true);
	const [defaultOff, setDefaultOff] = useState<"1" | "2">("2");
	const [busy, setBusy] = useState(false);

	const staff: GeneratorStaff[] = users.filter((u) => chosen[u._id] ?? true).map((u) => ({ id: u._id, name: u.name, roleName: u.roleName, daysOff: daysOff[u._id] ?? (Number(defaultOff) as 1 | 2) }));
	const shifts: GeneratorShift[] = templates.map((t) => ({ name: t.name, start: t.openTime ?? null, end: t.closeTime ?? null, minStaff: minStaff[t.name] ?? 1 }));
	const result = useMemo(() => (rangeOk && staff.length && shifts.length ? generateSchedule({ startDate: start, endDate, staff, shifts, rotateWeekly: rotate, preferWeekend: weekend }) : null), [rangeOk, staff.length, shifts.length, start, endDate, rotate, weekend, JSON.stringify(staff), JSON.stringify(shifts)]); // eslint-disable-line react-hooks/exhaustive-deps
	const firstWeek = result ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(start), i)) : [];
	const totalRows = result?.rows.length ?? 0;
	const allValid = result ? staff.every((p) => validateConsecutive(result.rows, p.id).ok) : true;
	const uncovered = result?.warnings.length ?? 0;

	const apply = async () => {
		if (!result) return;
		const first = start;
		const last = endDate;
		const ok = await requestAdminConfirm({ title: "Terapkan jadwal otomatis?", message: `${staff.length} karyawan, ${rangeLabel} (${fmtDate(first)} – ${fmtDate(last)}). Jadwal lama pada rentang ini untuk karyawan terpilih akan diganti.`, confirmText: "Terapkan", variant: "info" });
		if (!ok) return;
		setBusy(true);
		try {
			const inputs: ScheduleRowInput[] = result.rows.map((r) => ({ userId: r.userId, date: r.date, shiftName: r.shiftName, startTime: r.startTime, endTime: r.endTime, status: r.status, note: "Dibuat otomatis" }));
			const res = await bulkReplace(inputs, staff.map((s) => s.id), first, last);
			toast.success(`${res.inserted} jadwal dibuat, ${res.deleted} jadwal lama diganti`);
			onDone();
		} catch {
			toast.error("Jadwal belum bisa diterapkan.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Panel title="Generator jadwal otomatis" tone="blue" right={<StatusTag tone={allValid ? "ok" : "bad"}>{allValid ? "Libur & masuk berjejer" : "Aturan berjejer dilanggar"}</StatusTag>}>
			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
				<div className="space-y-4">
					<div>
						<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Aturan</div>
						<ul className="space-y-1 text-[12px] text-[#444450]">
							<li>• Libur 1 atau 2 hari per minggu per orang.</li>
							<li>• Hari libur berjejer, sehingga hari masuk juga berjejer (mis. Senin–Jumat masuk, Sabtu–Minggu libur).</li>
							<li>• Libur diatur agar jumlah orang masuk per hari seimbang.</li>
						</ul>
					</div>
					<div className="space-y-2">
						<div className="grid grid-cols-2 gap-3">
							<label className="block text-[12px]"><span className="mb-1 block font-mono text-[10px] uppercase text-[#666672]">Dari bulan</span><input type="month" aria-label="Dari bulan" value={fromMonth} onChange={(e) => { if (!e.target.value) return; setFromMonth(e.target.value); if (e.target.value > toMonth) setToMonth(e.target.value); }} className="h-10 w-full border border-[#d8d8de] px-2" /></label>
							<label className="block text-[12px]"><span className="mb-1 block font-mono text-[10px] uppercase text-[#666672]">Sampai bulan</span><input type="month" aria-label="Sampai bulan" min={fromMonth} value={toMonth} onChange={(e) => e.target.value && setToMonth(e.target.value)} className="h-10 w-full border border-[#d8d8de] px-2" /></label>
						</div>
						<div className="flex flex-wrap gap-2">
							{[["Bulan ini", 0, 0], ["Bulan depan", 1, 1], ["2 bulan", 1, 2], ["3 bulan", 1, 3]].map(([label, from, to]) => <button key={String(label)} type="button" className="border border-[#d8d8de] bg-white px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] hover:bg-[#f5f5f7]" onClick={() => { const base = today.slice(0, 7); setFromMonth(addMonthsYm(base, Number(from))); setToMonth(addMonthsYm(base, Number(to) === 0 ? 0 : Number(from) + Number(to) - 1)); }}>{label}</button>)}
						</div>
						<p className="text-[12px] text-[#666672]">{rangeOk ? `${rangeLabel} · ${fmtDate(start)} – ${fmtDate(endDate)}${first < today ? " (mulai hari ini)" : ""} · ${totalRows} jadwal` : span > 6 ? "Maksimal 6 bulan sekali generate." : "Rentang bulan tidak valid."}</p>
					</div>
					<div><span className="mb-1 block font-mono text-[10px] uppercase text-[#666672]">Jatah libur default</span><Segmented id="kk-off" label="Libur default" value={defaultOff} onChange={(v) => { setDefaultOff(v); setDaysOff({}); }} options={[{ value: "1", label: "1 hari" }, { value: "2", label: "2 hari" }]} /></div>
					<Chips value={weekend ? "w" : "n"} onChange={(v) => setWeekend(v === "w")} options={[{ value: "w", label: "Utamakan libur akhir pekan" }, { value: "n", label: "Bebas hari" }]} />
					<Chips value={rotate ? "r" : "f"} onChange={(v) => setRotate(v === "r")} options={[{ value: "f", label: "Shift tetap" }, { value: "r", label: "Shift bergilir tiap minggu" }]} />
					<div>
						<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Minimal orang per shift per hari</div>
						{templates.length === 0 ? <p className="text-[12px] text-[#b42318]">Belum ada shift di pengaturan kehadiran. Tambahkan shift dulu.</p> : templates.map((t) => (
							<div key={t.name} className="flex items-center justify-between border-t border-[#efeff2] py-2 text-[13px]"><span>{t.name} <span className="font-mono text-[10px] text-[#666672]">{t.openTime}–{t.closeTime}</span></span><span className="flex items-center gap-2"><Btn small onClick={() => setMinStaff({ ...minStaff, [t.name]: Math.max(0, (minStaff[t.name] ?? 1) - 1) })}>−</Btn><b className="w-5 text-center tabular-nums">{minStaff[t.name] ?? 1}</b><Btn small onClick={() => setMinStaff({ ...minStaff, [t.name]: (minStaff[t.name] ?? 1) + 1 })}>+</Btn></span></div>
						))}
					</div>
					<div>
						<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Karyawan ({staff.length})</div>
						<ul className="max-h-[220px] overflow-y-auto border border-[#e4e4e8]">
							{users.map((u) => (
								<li key={u._id} className="flex items-center gap-3 border-b border-[#efeff2] px-3 py-2 text-[13px] last:border-0">
									<input type="checkbox" aria-label={`Ikutkan ${u.name}`} className="h-4 w-4 accent-[#111114]" checked={chosen[u._id] ?? true} onChange={(e) => setChosen({ ...chosen, [u._id]: e.target.checked })} />
									<span className="min-w-0 flex-1 truncate">{u.name}</span>
									<Segmented id={`kk-off-${u._id}`} label={`Libur ${u.name}`} value={String(daysOff[u._id] ?? defaultOff) as "1" | "2"} onChange={(v) => setDaysOff({ ...daysOff, [u._id]: Number(v) as 1 | 2 })} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }]} size="sm" />
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className="min-w-0 space-y-3">
					<div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Pratinjau minggu pertama</div>
					{result ? (
						<>
							<div className="overflow-x-auto border border-[#e4e4e8]">
								<table className="w-full min-w-[520px] text-[11px]">
									<thead className="bg-[#fafafb]"><tr><th className="px-3 py-2 text-left font-mono text-[10px] font-normal uppercase text-[#666672]">Karyawan</th>{WEEKDAY_NAMES.map((d) => <th key={d} className="px-1 py-2 text-center font-mono text-[10px] font-normal uppercase text-[#666672]">{d.slice(0, 3)}</th>)}</tr></thead>
									<tbody>
										{staff.map((p) => (
											<tr key={p.id} className="border-t border-[#efeff2]">
												<td className="px-3 py-1.5 font-medium">{p.name.split(" ")[0]}</td>
												{firstWeek.map((d, i) => {
													const row = result.rows.find((r) => r.userId === p.id && r.date === d);
													return <td key={d} className="p-1"><motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} className={`px-1 py-1.5 text-center font-mono text-[9px] uppercase ${row ? shiftTone(row.shiftName, row.status) : ""}`}>{row?.status === "off" ? "Libur" : row?.shiftName}</motion.div></td>;
												})}
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<ProgressList rows={WEEKDAY_NAMES.map((d, i) => ({ label: d, value: `${result.workingPerWeekday[i]} / ${staff.length} masuk`, ratio: result.workingPerWeekday[i] / Math.max(1, staff.length), tone: "blue" as const }))} />
							{uncovered > 0 ? <Note>{uncovered} slot shift kurang orang (mis. {result.warnings[0].shiftName} {fmtDate(result.warnings[0].date)}: butuh {result.warnings[0].needed}, ada {result.warnings[0].actual}). Kurangi minimal per shift atau ikutkan lebih banyak karyawan.</Note> : <Note tone="info">Semua shift terpenuhi sesuai minimal.</Note>}
							<div className="flex justify-end"><Btn primary disabled={busy || !allValid || !rangeOk} onClick={() => void apply()}>{busy ? "Menerapkan…" : `Terapkan ${rangeLabel}`}</Btn></div>
						</>
					) : <div className="bg-[#f6f6f9] p-6 text-center text-[12px] text-[#666672]">Pilih minimal satu karyawan dan pastikan shift sudah ada.</div>}
				</div>
			</div>
		</Panel>
	);
}
