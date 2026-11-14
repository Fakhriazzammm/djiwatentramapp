import { useCallback, useEffect, useState } from "react";
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

export function TeamView({ role }: { role: Role }) {
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState("");

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
  const items = data.payroll.items;
  const gross = items.reduce((a, i) => a + Number(i.gross_pay), 0);
  const net = items.reduce((a, i) => a + Number(i.net_pay), 0);
  const slip = (st: string) => data.payroll.slips.find((x) => x.status === st)?.n ?? 0;

  return (
    <>
      <Kpis items={[
        { v: `${data.attendance.present}/${data.attendance.total}`, l: "Karyawan hadir" },
        { v: pending.length, l: "Izin menunggu" },
        { v: rp(gross), l: "Gaji kotor periode" },
        { v: rp(net), l: "Gaji bersih periode" },
        { v: `${slip("sent") + slip("acknowledged")}/${items.length}`, l: "Slip terkirim" },
      ]} />
      <div className="work" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
        <div className="col">
          <Panel fill title="Gaji per periode" action={data.payroll.periods.length > 0 ? (
            <select className="sel" value={period || data.payroll.periodId} onChange={(e) => { setPeriod(e.target.value); void load(e.target.value); }}>
              {data.payroll.periods.map((p) => <option key={p.id} value={p.id}>{p.period_name}</option>)}
            </select>) : undefined}>
            <div className="sc"><table>
              <thead><tr><th>Nama</th><th>Shift</th><th>Jam</th><th style={{ textAlign: "right" }}>Kotor</th><th style={{ textAlign: "right" }}>Potongan</th><th style={{ textAlign: "right" }}>Bersih</th></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.user_id}><td>{i.user_name} <span className="meta">{i.role_name}</span></td><td className="mono">{i.total_shifts}</td><td className="mono">{i.total_hours}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{rp(i.gross_pay)}</td><td className="mono" style={{ textAlign: "right" }}>{rp(i.deductions)}</td><td className="mono" style={{ textAlign: "right" }}><b>{rp(i.net_pay)}</b></td></tr>))}
              </tbody>
            </table>
            {data.payroll.periods.length === 0 && <Empty>BELUM ADA PERIODE GAJI · BUAT DI ADMIN → PAYROLL</Empty>}
            {data.payroll.periods.length > 0 && items.length === 0 && <Empty>BELUM ADA DATA GAJI PERIODE INI</Empty>}</div>
            <div className="ph" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}><span className="meta">Gaji berjalan bertambah otomatis saat karyawan absen keluar. Penyesuaian dan slip dibuat lewat Admin → Payroll.</span></div>
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
