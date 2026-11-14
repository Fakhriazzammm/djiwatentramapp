import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Role } from "../lib/api";
import { Empty, Kpis, Panel, hm, rp } from "../ui";

type Attendance = {
  activeCashierShift: { shiftName?: string; cashierName?: string; startTime?: number } | null;
  total: number; present: number;
  staff: { userId: string; name: string; role: string; status: string; checkInAt?: number; checkOutAt?: number; leaveType?: string | null }[];
};
type Leave = { id: string; user_name: string | null; leave_type: string; start_date: string; end_date: string; reason: string | null; status: string; created_at: string };
type PayrollItem = { user_id: string; user_name: string | null; role_name: string | null; total_shifts: number; total_hours: string; gross_pay: string; deductions: string; net_pay: string };
type Period = { id: string; period_name: string; start_date: string; end_date: string; status: string };
type Data = {
  attendance: Attendance;
  leaves: Leave[];
  payroll: { periods: Period[]; periodId: string; items: PayrollItem[]; slips: { status: string; n: number }[] };
};
const LEAVE: Record<string, string> = { izin: "Izin", cuti: "Cuti", sakit: "Sakit", other: "Lainnya" };
const STAFF: Record<string, string> = { working: "Bekerja", done: "Selesai", leave: "Izin", absent: "Belum absen" };

type PRow = {
  userId: string; name: string; role: string; shifts: number; days: number; hours: number; overtimeHours: number; fixed: number; shiftPay: number; hourlyPay: number; allowance: number;
  overtime: number; bonus: number; bonusAuto: number; deductions: number; gross: number; net: number; live: boolean;
  adjustments: { id: string; kind: string; amount: number; note: string | null; by: string | null }[]; slip: { id: string; status: string } | null;
  rules: { shiftRate: number; allowance: number; fixed: number; overtimeRate: number; basis: string | null };
};
type Payroll = { period: string; rows: PRow[]; policy: { adjustmentLimit: number; stdHours: number }; monthTarget: number; monthRevenue: number };
const monthsBack = (n = 6) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.now() + 7 * 3600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
const monthLabel = (p: string) => new Date(`${p}-15T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const SLIP: Record<string, [string, string]> = { generated: ["Slip dibuat", "md"], sent: ["Terkirim", "ok"], acknowledged: ["Diterima", "ok"], disputed: ["Dispute", "hi"] };
const KIND: Record<string, string> = { bonus: "Bonus", lembur: "Lembur", denda: "Denda", potongan: "Potongan" };

export function TeamView({ role }: { role: Role }) {
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState("");
  const [pm, setPm] = useState(monthsBack()[0]);
  const [pay, setPay] = useState<Payroll | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: "bonus", amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const loadPay = useCallback(async (m = pm) => {
    try { setPay(await api<Payroll>(`/api/manager/payroll?period=${m}`)); } catch { toast.error("Gaji belum bisa dimuat"); }
  }, [pm]);
  useEffect(() => { setPay(null); void loadPay(pm); const id = setInterval(() => { if (document.visibilityState === "visible") void loadPay(pm); }, 60_000); return () => clearInterval(id); }, [pm, loadPay]);
  const addAdj = async (r: PRow) => {
    const amount = Number(form.amount.replace(/\D/g, ""));
    if (!(amount > 0)) { toast.error("Isi nominal"); return; }
    setBusy(true);
    try { await api("/api/manager/payroll/adjustments", { method: "POST", body: { userId: r.userId, period: pm, kind: form.kind, amount, note: form.note } }); setForm({ ...form, amount: "", note: "" }); toast.success("Penyesuaian dicatat"); await loadPay(); }
    catch (e) { const c = (e as { code?: string }).code; toast.error(c === "ABOVE_LIMIT" ? `Di atas batas Manager (${rp(pay?.policy.adjustmentLimit ?? 0)}). Minta Owner.` : c === "SLIP_SENT" ? "Slip sudah terkirim, tidak bisa diubah" : "Belum tersimpan"); } finally { setBusy(false); }
  };
  const delAdj = async (id: string) => { try { await api(`/api/manager/payroll/adjustments/${id}`, { method: "DELETE" }); await loadPay(); } catch { toast.error("Gagal menghapus"); } };
  const slip = async (r: PRow, action: "create" | "send") => {
    setBusy(true);
    try { await api("/api/manager/payroll/slips", { method: "POST", body: { userId: r.userId, period: pm, action } }); toast.success(action === "send" ? `Slip ${r.name} terkirim ke aplikasi Karyawan` : "Slip dibuat"); await loadPay(); }
    catch { toast.error("Slip belum tersimpan (mungkin sudah terkirim)"); } finally { setBusy(false); }
  };

  const load = useCallback(async (periodId = period) => {
    try { setData(await api<Data>(`/api/manager/team${periodId ? `?period=${encodeURIComponent(periodId)}` : ""}`)); }
    catch { toast.error("Tim belum bisa dimuat"); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (l: Leave, status: "approved" | "rejected") => {
    const note = status === "rejected" ? window.prompt("Alasan penolakan:") ?? "" : "";
    if (status === "rejected" && !note.trim()) return;
    try {
      await api(`/api/manager/team/leaves/${l.id}`, { method: "POST", body: { status, note } });
      toast.success(status === "approved" ? "Izin disetujui" : "Izin ditolak");
      void load();
    } catch { toast.error("Keputusan belum tersimpan"); }
  };

  if (!data) return <div className="empty">Memuat tim…</div>;
  const pending = data.leaves.filter((l) => l.status === "pending");
  const others = data.leaves.filter((l) => l.status !== "pending");
  const prow = pay?.rows ?? [];
  const gross = prow.reduce((a, i) => a + i.gross, 0);
  const net = prow.reduce((a, i) => a + i.net, 0);
  const bonus = prow.reduce((a, i) => a + i.bonus, 0);
  const sentN = prow.filter((r) => r.slip && r.slip.status !== "generated").length;

  return (
    <>
      <Kpis items={[
        { v: `${data.attendance.present}/${data.attendance.total}`, l: "Karyawan hadir" },
        { v: pending.length, l: "Izin menunggu" },
        { v: rp(gross), l: "Gaji kotor bulan ini" },
        { v: rp(bonus), l: "Total bonus" },
        { v: rp(net), l: "Gaji bersih" },
        { v: `${sentN}/${prow.length}`, l: "Slip terkirim" },
      ]} />
      <div className="work" style={{ gridTemplateColumns: "minmax(0,2.2fr) minmax(0,1fr)" }}>
        <div className="col">
          <Panel fill title="Gaji & bonus · semua karyawan" action={<select className="sel" value={pm} onChange={(e) => setPm(e.target.value)}>{monthsBack().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>}>
            <div className="sc"><div className="tw"><table>
              <thead><tr><th>Karyawan</th><th>Shift</th><th>Jam</th><th style={{ textAlign: "right" }}>Pokok + shift</th><th style={{ textAlign: "right" }}>Tunjangan</th><th style={{ textAlign: "right" }}>Lembur</th><th style={{ textAlign: "right" }}>Bonus</th><th style={{ textAlign: "right" }}>Potongan</th><th style={{ textAlign: "right" }}>Bersih</th><th>Slip</th></tr></thead>
              <tbody>{(pay?.rows ?? []).map((r) => (
                <Fragment key={r.userId}>
                  <tr style={{ cursor: "pointer", background: openRow === r.userId ? "#fafafb" : undefined }} onClick={() => setOpenRow(openRow === r.userId ? null : r.userId)}>
                    <td>{r.live && <span className="dotc ok" />}<b style={{ fontWeight: 550 }}>{r.name}</b> <span className="meta">{r.role}</span></td>
                    <td className="mono">{r.shifts}</td><td className="mono">{r.hours.toFixed(1)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{rp(r.fixed + r.shiftPay + r.hourlyPay)}</td><td className="mono" style={{ textAlign: "right" }}>{rp(r.allowance)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{rp(r.overtime)}</td><td className="mono" style={{ textAlign: "right", color: r.bonus ? "var(--ok)" : undefined }}>{r.bonus ? `+${rp(r.bonus)}` : "—"}</td>
                    <td className="mono" style={{ textAlign: "right", color: r.deductions ? "var(--red)" : undefined }}>{r.deductions ? `−${rp(r.deductions)}` : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}><b>{rp(r.net)}</b></td>
                    <td>{r.slip ? <span className={`tg ${SLIP[r.slip.status]?.[1] ?? ""}`}>{SLIP[r.slip.status]?.[0] ?? r.slip.status}</span> : <span className="tg">Berjalan</span>}</td>
                  </tr>
                  {openRow === r.userId && (
                    <tr><td colSpan={10} style={{ background: "#fafafb" }}>
                      <div className="row2" style={{ alignItems: "start" }}>
                        <div>
                          <label style={{ marginTop: 0 }}>Rincian · aturan peran {r.role}</label>
                          <table><tbody>
                            <tr><td className="meta">Gaji pokok bulanan</td><td className="mono" style={{ textAlign: "right" }}>{rp(r.fixed)}</td></tr>
                            <tr><td className="meta">{r.shifts} shift × {rp(r.rules.shiftRate)}</td><td className="mono" style={{ textAlign: "right" }}>{rp(r.shiftPay)}</td></tr>
                            <tr><td className="meta">{r.days} hari hadir × {rp(r.rules.allowance)} tunjangan</td><td className="mono" style={{ textAlign: "right" }}>{rp(r.allowance)}</td></tr>
                            <tr><td className="meta">Lembur {r.overtimeHours.toFixed(1)} jam (di atas {pay?.policy.stdHours ?? 8} jam/hari)</td><td className="mono" style={{ textAlign: "right" }}>{rp(r.overtime)}</td></tr>
                            <tr><td className="meta">Bonus target ({r.rules.basis === "monthly" ? "bulanan" : r.rules.basis === "shift" ? "per shift" : "tidak ada"})</td><td className="mono" style={{ textAlign: "right" }}>{rp(r.bonusAuto)}</td></tr>
                            <tr><td><b>Kotor</b></td><td className="mono" style={{ textAlign: "right" }}><b>{rp(r.gross)}</b></td></tr>
                          </tbody></table>
                          <div className="crow">
                            {(!r.slip || r.slip.status === "generated") && <button className="btn s" disabled={busy} onClick={() => slip(r, "create")}>{r.slip ? "Perbarui slip" : "Buat slip"}</button>}
                            {(!r.slip || r.slip.status === "generated") && <button className="btn s p" disabled={busy} onClick={() => slip(r, "send")}>Kirim slip</button>}
                            {r.slip && r.slip.status !== "generated" && <span className="meta">Slip sudah dikirim, terkunci.</span>}
                          </div>
                        </div>
                        <div>
                          <label style={{ marginTop: 0 }}>Penyesuaian (bonus, lembur, denda, potongan)</label>
                          {r.adjustments.map((a) => <div key={a.id} className="mr" style={{ padding: "4px 0" }}><span><span className={`tg ${a.kind === "denda" || a.kind === "potongan" ? "hi" : "ok"}`}>{KIND[a.kind]}</span> {rp(a.amount)} <span className="meta">{a.note ?? ""} {a.by ? `· ${a.by}` : ""}</span></span>{!r.slip || r.slip.status === "generated" ? <button className="btn s" onClick={() => delAdj(a.id)}>×</button> : null}</div>)}
                          {r.adjustments.length === 0 && <div className="meta">Belum ada penyesuaian.</div>}
                          {(!r.slip || r.slip.status === "generated") && <div className="crow" style={{ marginTop: 8 }}>
                            <select className="sel" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                            <input className="f" style={{ width: 110, padding: "5px 8px" }} inputMode="numeric" placeholder="Nominal Rp" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                            <input className="f" style={{ flex: 1, minWidth: 120, padding: "5px 8px" }} placeholder="Catatan" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                            <button className="btn s p" disabled={busy} onClick={() => addAdj(r)}>Tambah</button>
                          </div>}
                          <div className="meta" style={{ marginTop: 6 }}>Batas penyesuaian Manager {rp(pay?.policy.adjustmentLimit ?? 0)}.</div>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}</tbody>
            </table></div>
            {!pay && <Empty>MENGHITUNG GAJI DARI ABSENSI…</Empty>}
            {pay && pay.rows.length === 0 && <Empty>BELUM ADA KARYAWAN AKTIF</Empty>}</div>
            <div className="ph" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}><span className="meta">Dihitung langsung dari absensi semua karyawan aktif, aturan peran, dan target penjualan{pay?.monthTarget ? ` (target ${rp(pay.monthTarget)}, tercapai ${rp(pay.monthRevenue)})` : ""}. Klik baris untuk rincian, bonus/denda, dan slip.</span></div>
          </Panel>
        </div>
        <div className="col">
          <Panel title="Kehadiran hari ini" meta={data.attendance.activeCashierShift?.cashierName ? `Kasir: ${data.attendance.activeCashierShift.cashierName}` : undefined}>
            {(data.attendance.staff ?? []).map((s) => (
              <div key={s.userId} className="mr">
                <span><span className={`dotc ${s.status === "working" || s.status === "done" ? "ok" : s.leaveType || s.status === "leave" ? "wn" : "bad"}`} />{s.name} <span className="meta">{s.role}</span></span>
                <span className="meta">{s.checkInAt ? hm(s.checkInAt) : "—"} · {s.leaveType ? `Izin (${s.leaveType})` : STAFF[s.status] ?? s.status}</span>
              </div>
            ))}
            {(data.attendance.staff ?? []).length === 0 && <Empty>BELUM ADA DATA ABSENSI</Empty>}
          </Panel>
          <Panel title={`Izin menunggu · ${pending.length}`}>
            {pending.length === 0 && <Empty>TIDAK ADA PENGAJUAN</Empty>}
            {pending.map((l) => (
              <div key={l.id} className="pad" style={{ borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{l.user_name ?? "Karyawan"}</b><span className="tg">{LEAVE[l.leave_type] ?? l.leave_type}</span></div>
                <div className="meta">{new Date(l.start_date).toLocaleDateString("id-ID")} – {new Date(l.end_date).toLocaleDateString("id-ID")}</div>
                {l.reason && <p style={{ margin: "6px 0 0" }}>{l.reason}</p>}
                {role === "manager" && <div className="crow"><button className="btn s p" onClick={() => decide(l, "approved")}>Setujui</button><button className="btn s" onClick={() => decide(l, "rejected")}>Tolak</button></div>}
              </div>
            ))}
            {others.slice(0, 6).map((l) => <div key={l.id} className="mr"><span>{l.user_name} <span className="meta">{LEAVE[l.leave_type] ?? l.leave_type}</span></span><span className={`tg ${l.status === "approved" ? "ok" : "hi"}`}>{l.status === "approved" ? "Disetujui" : "Ditolak"}</span></div>)}
          </Panel>
        </div>
      </div>
    </>
  );
}
