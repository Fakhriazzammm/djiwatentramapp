import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { requestAdminConfirm } from "./confirm";
import { Btn, KpiStrip, Note, Page, PageHead, Panel, ProgressList, SectionTitle, SourceError, StatusTag } from "./kit";
import { rupiah, usePayroll, type PayrollRow } from "./data";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STAGES = ["Berjalan", "Slip dibuat", "Slip terkirim", "Diterima"] as const;
const KIND: Record<string, string> = { bonus: "Bonus", lembur: "Lembur", denda: "Denda", potongan: "Potongan" };
const SLIP: Record<string, [string, "ok" | "info" | "warn" | "bad" | "mute"]> = { generated: ["Slip dibuat", "info"], sent: ["Terkirim", "ok"], acknowledged: ["Diterima", "ok"], disputed: ["Dispute", "bad"] };
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export default function PayrollPage() {
	const now = new Date(Date.now() + 7 * 3600_000);
	const [year, setYear] = useState(now.getUTCFullYear());
	const [month, setMonth] = useState(now.getUTCMonth() + 1);
	const [raise, setRaise] = useState(0);
	const [extraOt, setExtraOt] = useState(0);
	const [open, setOpen] = useState<string | null>(null);
	const [form, setForm] = useState({ kind: "bonus", amount: "", note: "" });
	const [busy, setBusy] = useState(false);
	const { data, loading, error, reload } = usePayroll(key(year, month));
	const rows = data?.rows ?? [];

	const total = rows.reduce((s, r) => s + r.net, 0);
	const gross = rows.reduce((s, r) => s + r.gross, 0);
	const bonus = rows.reduce((s, r) => s + r.bonus, 0);
	const deductions = rows.reduce((s, r) => s + r.deductions, 0);
	const overtime = rows.reduce((s, r) => s + r.overtime, 0);
	const paid = rows.filter((r) => r.net > 0);
	const zero = rows.length - paid.length;
	const sent = rows.filter((r) => r.slip && r.slip.status !== "generated").length;
	const created = rows.filter((r) => r.slip).length;
	const ack = rows.filter((r) => r.slip?.status === "acknowledged").length;
	const stage = rows.length === 0 ? 0 : ack === rows.length ? 3 : sent > 0 ? 2 : created > 0 ? 1 : 0;
	const simulated = paid.reduce((s, r) => s + r.net * (1 + raise / 100) + extraOt * (r.rules.overtimeRate || 10000), 0);
	const comp = useMemo(() => ({ pokok: rows.reduce((s, r) => s + r.fixed, 0), shift: rows.reduce((s, r) => s + r.shiftPay + r.hourlyPay, 0), tunjangan: rows.reduce((s, r) => s + r.allowance, 0), lembur: overtime, bonus }), [rows, overtime, bonus]);
	const compTotal = Math.max(1, Object.values(comp).reduce((a, b) => a + b, 0));
	const suspect = rows.filter((r) => r.days > 0 && r.hours / r.days > 16);
	const step = (d: number) => { const next = new Date(Date.UTC(year, month - 1 + d, 1)); setYear(next.getUTCFullYear()); setMonth(next.getUTCMonth() + 1); };

	const addAdj = async (r: PayrollRow) => {
		const amount = Number(form.amount.replace(/\D/g, ""));
		if (!(amount > 0)) { toast.error("Isi nominal"); return; }
		setBusy(true);
		try { await api("/api/manager/payroll/adjustments", { method: "POST", body: { userId: r.userId, period: key(year, month), kind: form.kind, amount, note: form.note } }); setForm({ ...form, amount: "", note: "" }); toast.success("Penyesuaian disimpan"); reload(); }
		catch (e) { const c = (e as { code?: string }).code; toast.error(c === "ABOVE_LIMIT" ? `Di atas batas Manager (${rupiah(data?.policy.adjustmentLimit ?? 0)}). Minta Owner.` : c === "SLIP_SENT" ? "Slip sudah terkirim, tidak bisa diubah" : "Penyesuaian belum tersimpan"); }
		finally { setBusy(false); }
	};
	const delAdj = async (id: string) => { try { await api(`/api/manager/payroll/adjustments/${id}`, { method: "DELETE" }); reload(); } catch { toast.error("Gagal menghapus"); } };
	const slip = async (r: PayrollRow, action: "create" | "send") => {
		if (action === "send" && !(await requestAdminConfirm({ title: "Kirim slip?", message: `Slip ${r.name} (${rupiah(r.net)}) dikirim ke aplikasi Karyawan dan terkunci.` }))) return;
		setBusy(true);
		try { await api("/api/manager/payroll/slips", { method: "POST", body: { userId: r.userId, period: key(year, month), action } }); toast.success(action === "send" ? `Slip ${r.name} terkirim` : "Slip disimpan"); reload(); }
		catch { toast.error("Slip belum tersimpan (mungkin sudah terkirim)"); } finally { setBusy(false); }
	};

	return (
		<Page>
			<PageHead title={`Payroll ${MONTHS[month - 1]} ${year}`} subtitle="Dihitung langsung dari absensi, jadwal, aturan peran, dan target penjualan. Slip dikirim ke aplikasi Karyawan." actions={<><Btn onClick={() => step(-1)} title="Bulan sebelumnya">‹</Btn><Btn onClick={() => step(1)} title="Bulan berikutnya">›</Btn></>} />
			<div className="grid grid-cols-4 gap-px border border-[#e4e4e8] bg-[#e4e4e8]" role="list" aria-label="Tahap slip">
				{STAGES.map((label, i) => (
					<motion.div key={label} role="listitem" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={`px-4 py-3.5 font-mono text-[11px] uppercase tracking-[0.1em] ${i === stage ? "bg-[#111114] text-white" : i < stage ? "bg-white text-[#166534]" : "bg-white text-[#9a9aa5]"}`}>{i < stage ? "✓ " : ""}{label}</motion.div>
				))}
			</div>
			{error ? <SourceError message="Payroll tidak dapat dimuat" /> : null}
			<KpiStrip items={[
				{ label: "Total gaji bersih", value: data ? total : null, format: rupiah, sub: `${paid.length} karyawan bergaji` },
				{ label: "Gaji kotor", value: data ? gross : null, format: rupiah, sub: `potongan ${rupiah(deductions)}` },
				{ label: "Total bonus", value: data ? bonus : null, format: rupiah, sub: data?.monthTarget ? `target ${rupiah(data.monthTarget)}` : "tanpa target bulan ini" },
				{ label: "Slip terkirim", value: data ? `${sent}/${rows.length}` : null, sub: `${zero} baris Rp 0` },
			]} />
			{suspect.length > 0 ? <Note>{suspect.length} karyawan memiliki jam kerja tidak wajar (lebih dari 16 jam per hari kerja): {suspect.slice(0, 3).map((r) => r.name).join(", ")}. Kemungkinan check-in belum ditutup.</Note> : null}

			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
				<Panel title="Komposisi gaji" tone="red"><ProgressList rows={[{ label: "Gaji pokok bulanan", value: rupiah(comp.pokok), ratio: comp.pokok / compTotal }, { label: "Gaji per shift / jam", value: rupiah(comp.shift), ratio: comp.shift / compTotal }, { label: "Tunjangan harian", value: rupiah(comp.tunjangan), ratio: comp.tunjangan / compTotal, tone: "green" }, { label: "Lembur", value: rupiah(comp.lembur), ratio: comp.lembur / compTotal, tone: "amber" }, { label: "Bonus", value: rupiah(comp.bonus), ratio: comp.bonus / compTotal, tone: "green" }]} /></Panel>
				<Panel title="Simulator" tone="blue" right={<StatusTag tone="info">coba skenario</StatusTag>}>
					<div className="space-y-4">
						<label className="block"><div className="mb-1 flex justify-between font-mono text-[10px] uppercase text-[#666672]"><span>Kenaikan gaji</span><b>{raise}%</b></div><input type="range" min={0} max={20} value={raise} onChange={(e) => setRaise(Number(e.target.value))} className="w-full accent-[#111114]" /></label>
						<label className="block"><div className="mb-1 flex justify-between font-mono text-[10px] uppercase text-[#666672]"><span>Tambahan lembur / orang</span><b>{extraOt} jam</b></div><input type="range" min={0} max={40} value={extraOt} onChange={(e) => setExtraOt(Number(e.target.value))} className="w-full accent-[#111114]" /></label>
						<div className="border-t border-[#efeff2] pt-3"><div className="font-mono text-[10px] uppercase text-[#666672]">Total setelah simulasi</div><motion.div key={Math.round(simulated)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="font-display text-[28px] tabular-nums">{rupiah(simulated)}</motion.div><div className="font-mono text-[10px] text-[#666672]">selisih {simulated - total >= 0 ? "+" : "−"}{rupiah(Math.abs(simulated - total))}</div></div>
					</div>
				</Panel>
			</div>

			<SectionTitle color="#111114" right={<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">klik baris untuk rincian, penyesuaian, dan slip</span>}>Rincian per karyawan</SectionTitle>
			{loading ? <div className="h-56 animate-pulse bg-[#ececf0]" /> : (
				<div className="overflow-x-auto border border-[#e4e4e8] bg-white">
					<table className="w-full min-w-[820px] text-left text-[13px]">
						<thead className="bg-[#fafafb]"><tr>{["Karyawan", "Shift", "Jam", "Pokok + shift", "Tunjangan", "Lembur", "Bonus", "Potongan", "Bersih", "Slip"].map((h, i) => <th key={h} className={`px-4 py-3 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[#666672] ${i >= 3 && i <= 8 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
						<tbody>
							{rows.map((r) => (
								<Fragment key={r.userId}>
									<tr className="cursor-pointer border-t border-[#efeff2] hover:bg-[#fafafb]" onClick={() => setOpen(open === r.userId ? null : r.userId)}>
										<td className="px-4 py-3"><div className="font-medium">{r.name}</div><div className="font-mono text-[10px] text-[#666672]">{r.role}</div></td>
										<td className="px-4 py-3 tabular-nums">{r.shifts}</td>
										<td className={`px-4 py-3 tabular-nums ${r.days > 0 && r.hours / r.days > 16 ? "font-semibold text-[#d92d20]" : ""}`}>{r.hours.toFixed(1)}</td>
										<td className="px-4 py-3 text-right tabular-nums">{rupiah(r.fixed + r.shiftPay + r.hourlyPay)}</td>
										<td className="px-4 py-3 text-right tabular-nums">{rupiah(r.allowance)}</td>
										<td className="px-4 py-3 text-right tabular-nums">{rupiah(r.overtime)}</td>
										<td className="px-4 py-3 text-right tabular-nums text-[#16a34a]">{r.bonus ? `+${rupiah(r.bonus)}` : "—"}</td>
										<td className="px-4 py-3 text-right tabular-nums text-[#d92d20]">{r.deductions ? `−${rupiah(r.deductions)}` : "—"}</td>
										<td className="px-4 py-3 text-right tabular-nums"><b>{rupiah(r.net)}</b></td>
										<td className="px-4 py-3">{r.slip ? <StatusTag tone={SLIP[r.slip.status]?.[1] ?? "info"}>{SLIP[r.slip.status]?.[0] ?? r.slip.status}</StatusTag> : <StatusTag tone="mute">Berjalan</StatusTag>}</td>
									</tr>
									<AnimatePresence initial={false}>
										{open === r.userId ? (
											<tr key={`${r.userId}-d`}><td colSpan={10} className="bg-[#fafafb] p-0">
												<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
													<div className="grid gap-6 p-4 md:grid-cols-2">
														<div>
															<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Rincian · aturan peran {r.role}</div>
															<dl className="divide-y divide-[#efeff2] border border-[#e4e4e8] bg-white text-[13px]">
																{[["Gaji pokok bulanan", rupiah(r.fixed)], [`${r.shifts} shift × ${rupiah(r.rules.shiftRate)}`, rupiah(r.shiftPay)], [`${r.days} hari hadir × ${rupiah(r.rules.allowance)}`, rupiah(r.allowance)], [`Lembur ${r.overtimeHours.toFixed(1)} jam (di atas ${data?.policy.stdHours ?? 8} jam/hari)`, rupiah(r.overtime)], [`Bonus target (${r.rules.basis === "monthly" ? "bulanan" : r.rules.basis === "shift" ? "per shift" : "tidak ada"})`, rupiah(r.bonusAuto)], ["Kotor", rupiah(r.gross)]].map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-3 py-2"><dt className="text-[#666672]">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
															</dl>
															<div className="mt-3 flex flex-wrap gap-2">
																{(!r.slip || r.slip.status === "generated") ? <><Btn small disabled={busy} onClick={() => void slip(r, "create")}>{r.slip ? "Perbarui slip" : "Buat slip"}</Btn><Btn small primary disabled={busy} onClick={() => void slip(r, "send")}>Kirim slip</Btn></> : <span className="text-[12px] text-[#666672]">Slip sudah dikirim, terkunci.</span>}
															</div>
														</div>
														<div>
															<div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#666672]">Penyesuaian (bonus, lembur, denda, potongan)</div>
															{r.adjustments.length === 0 ? <p className="text-[12px] text-[#666672]">Belum ada penyesuaian.</p> : r.adjustments.map((a) => <div key={a.id} className="flex items-center justify-between gap-2 border-b border-[#efeff2] py-1.5 text-[13px]"><span><StatusTag tone={a.kind === "denda" || a.kind === "potongan" ? "bad" : "ok"}>{KIND[a.kind] ?? a.kind}</StatusTag> {rupiah(a.amount)} <span className="text-[#666672]">{a.note}</span></span>{(!r.slip || r.slip.status === "generated") ? <button type="button" aria-label="Hapus penyesuaian" className="text-[#d92d20]" onClick={() => void delAdj(a.id)}>✕</button> : null}</div>)}
															{(!r.slip || r.slip.status === "generated") ? (
																<div className="mt-3 flex flex-wrap gap-2">
																	<select aria-label="Jenis penyesuaian" className="h-9 border border-[#d8d8de] bg-white px-2 text-[13px]" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
													<input aria-label="Nominal" className="h-9 w-28 border border-[#d8d8de] bg-white px-2 text-[13px]" inputMode="numeric" placeholder="Nominal Rp" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
													<input aria-label="Catatan" className="h-9 min-w-[120px] flex-1 border border-[#d8d8de] bg-white px-2 text-[13px]" placeholder="Catatan" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
																	<Btn small primary disabled={busy} onClick={() => void addAdj(r)}>Tambah</Btn>
																</div>
															) : null}
															<p className="mt-2 font-mono text-[10px] text-[#666672]">Batas penyesuaian Manager {rupiah(data?.policy.adjustmentLimit ?? 0)}.</p>
														</div>
													</div>
												</motion.div>
											</td></tr>
										) : null}
									</AnimatePresence>
								</Fragment>
							))}
							{rows.length === 0 ? <tr><td colSpan={10} className="p-6 text-center text-[#666672]">Belum ada karyawan aktif.</td></tr> : null}
						</tbody>
					</table>
				</div>
			)}
		</Page>
	);
}
