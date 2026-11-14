import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Role } from "../lib/api";

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
const money = (n: number | string) => `Rp${Math.round(Number(n)).toLocaleString("id-ID")}`;
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

  if (!data) return <div className="label">Memuat tim…</div>;
  const pending = data.leaves.filter((l) => l.status === "pending");
  const others = data.leaves.filter((l) => l.status !== "pending");

  return (
    <div className="space-y-3">
      <section className="panel p-3">
        <div className="flex items-center justify-between"><div className="label">Kehadiran hari ini</div><div className="label">{data.attendance.present}/{data.attendance.total} hadir</div></div>
        {data.attendance.activeCashierShift?.cashierName && <p className="mt-1 text-[13px] text-mute">Shift kasir aktif: {data.attendance.activeCashierShift.shiftName} · {data.attendance.activeCashierShift.cashierName}</p>}
        <ul className="mt-2 divide-y">
          {(data.attendance.staff ?? []).map((s) => (
            <li key={s.userId} className="flex items-center justify-between py-1.5 text-[13px]">
              <span className="min-w-0 truncate">{s.name}<span className="label ml-2">{s.role}</span></span>
              <span className="shrink-0">
                {s.checkInAt ? new Date(s.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—"}
                {" · "}
                <span className={s.status === "absent" ? "text-brand" : ""}>{s.leaveType ? `Izin (${s.leaveType})` : STAFF[s.status] ?? s.status}</span>
              </span>
            </li>
          ))}
          {(data.attendance.staff ?? []).length === 0 && <li className="py-2 text-sm text-mute">Belum ada data absensi hari ini.</li>}
        </ul>
      </section>

      <section className="panel p-3">
        <div className="label mb-2">Pengajuan izin menunggu ({pending.length})</div>
        {pending.length === 0 && <p className="text-sm text-mute">Tidak ada pengajuan.</p>}
        {pending.map((l) => (
          <div key={l.id} className="mb-2 rounded-lg border border-line p-2 text-[13px]">
            <div className="flex justify-between gap-2"><b>{l.user_name ?? "Karyawan"}</b><span className="label">{LEAVE[l.leave_type] ?? l.leave_type}</span></div>
            <div className="label">{new Date(l.start_date).toLocaleDateString("id-ID")} – {new Date(l.end_date).toLocaleDateString("id-ID")}</div>
            {l.reason && <p className="mt-1 text-mute">{l.reason}</p>}
            {role === "manager" && (
              <div className="mt-2 flex gap-2">
                <button className="btn !min-h-8" onClick={() => decide(l, "approved")}>Setujui</button>
                <button className="btn !min-h-8" onClick={() => decide(l, "rejected")}>Tolak</button>
              </div>
            )}
          </div>
        ))}
        {others.length > 0 && (
          <details className="mt-2"><summary className="label cursor-pointer">Riwayat 30 hari</summary>
            {others.map((l) => <div key={l.id} className="flex justify-between border-t py-1 text-[12px]"><span>{l.user_name} · {LEAVE[l.leave_type] ?? l.leave_type}</span><span className="label">{l.status}</span></div>)}
          </details>
        )}
      </section>

      <section className="panel p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="label">Gaji per periode</div>
          {data.payroll.periods.length > 0 && (
            <select className="input max-w-[220px]" value={period || data.payroll.periodId} onChange={(e) => { setPeriod(e.target.value); void load(e.target.value); }}>
              {data.payroll.periods.map((p) => <option key={p.id} value={p.id}>{p.period_name}</option>)}
            </select>
          )}
        </div>
        {data.payroll.periods.length === 0 && <p className="mt-2 text-sm text-mute">Belum ada periode gaji. Buat di Admin → Payroll.</p>}
        {data.payroll.items.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="label"><th className="py-1">Nama</th><th>Shift</th><th className="text-right">Kotor</th><th className="text-right">Potongan</th><th className="text-right">Bersih</th></tr></thead>
              <tbody>
                {data.payroll.items.map((i) => (
                  <tr key={i.user_id} className="border-t">
                    <td className="py-1.5">{i.user_name}<span className="label ml-1">{i.role_name}</span></td>
                    <td>{i.total_shifts}</td>
                    <td className="text-right">{money(i.gross_pay)}</td>
                    <td className="text-right">{money(i.deductions)}</td>
                    <td className="text-right font-semibold">{money(i.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.payroll.slips.length > 0 && <p className="label mt-2">Slip: {data.payroll.slips.map((s) => `${s.status} ${s.n}`).join(" · ")}</p>}
        <p className="mt-2 text-[11px] text-mute">Gaji berjalan bertambah otomatis saat karyawan absen keluar. Penyesuaian dan slip dibuat lewat Admin → Payroll.</p>
      </section>
    </div>
  );
}
