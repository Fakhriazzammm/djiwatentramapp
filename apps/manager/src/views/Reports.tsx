import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Report, type Role } from "../lib/api";

const KINDS = [
  { id: "laporan_harian", label: "Laporan harian", fields: ["Ringkasan hari ini", "Masalah & tindak lanjut", "Rencana besok"] },
  { id: "berita_acara_selisih", label: "Berita acara selisih kas", fields: ["Kronologi", "Nominal selisih", "Tindakan"] },
  { id: "insiden", label: "Insiden / komplain", fields: ["Kejadian", "Dampak", "Penanganan"] },
  { id: "bug_fitur", label: "Bug / request fitur aplikasi", fields: ["Aplikasi & halaman", "Yang terjadi", "Yang diharapkan"] },
];
const STATUS: Record<string, string> = { sent: "Terkirim", read: "Dibaca", needs_revision: "Perlu revisi", acknowledged: "Diterima" };

export function ReportsView({ role }: { role: Role }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    try { setReports((await api<{ reports: Report[] }>("/api/manager/reports")).reports); }
    catch { toast.error("Laporan belum bisa dimuat"); setReports([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const review = async (r: Report, status: string) => {
    try { await api(`/api/manager/reports/${r.id}`, { method: "PATCH", body: { status } }); void load(); }
    catch { toast.error("Belum tersimpan"); }
  };

  return (
    <div className="space-y-3">
      <button className="btn btn-dark" onClick={() => setComposing((v) => !v)}>Tulis laporan</button>
      {composing && <Compose role={role} onDone={() => { setComposing(false); void load(); }} />}
      {reports?.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Belum ada laporan.</div>}
      <ul className="space-y-2">
        {reports?.map((r) => (
          <li key={r.id} className="panel p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold">{r.title}</div>
              <span className="label shrink-0">{STATUS[r.status] ?? r.status}</span>
            </div>
            <div className="label mt-1">{r.from_name ?? r.from_role} → {r.to_role} · {new Date(r.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}</div>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              {Object.entries(r.body).map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="whitespace-pre-wrap">{String(v)}</dd></div>)}
            </dl>
            {role === "manager" && r.to_role === "manager" && r.status === "sent" && (
              <div className="mt-2 flex gap-2">
                <button className="btn !min-h-8" onClick={() => review(r, "acknowledged")}>Terima</button>
                <button className="btn !min-h-8" onClick={() => review(r, "needs_revision")}>Minta revisi</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Compose({ role, onDone }: { role: Role; onDone: () => void }) {
  const [kind, setKind] = useState(KINDS[0]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [toRole, setToRole] = useState<"manager" | "owner">(role === "manager" ? "owner" : "manager");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    const body = Object.fromEntries(kind.fields.map((f) => [f, values[f] ?? ""]));
    try {
      await api("/api/manager/reports", { method: "POST", body: { kind: kind.id, title: `${kind.label} — ${new Date().toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}`, toRole, body } });
      toast.success("Laporan terkirim");
      onDone();
    } catch { toast.error("Laporan belum terkirim"); } finally { setBusy(false); }
  };

  return (
    <div className="panel space-y-2 p-3">
      <select className="input" value={kind.id} onChange={(e) => { setKind(KINDS.find((k) => k.id === e.target.value)!); setValues({}); }}>
        {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
      </select>
      {role === "supervisor" && (
        <select className="input" value={toRole} onChange={(e) => setToRole(e.target.value as "manager" | "owner")}><option value="manager">Kirim ke Manager</option><option value="owner">Kirim ke Owner</option></select>
      )}
      {kind.fields.map((f) => (
        <div key={f}><div className="label mb-1">{f}</div><textarea className="input" rows={2} value={values[f] ?? ""} onChange={(e) => setValues({ ...values, [f]: e.target.value })} /></div>
      ))}
      <button className="btn btn-dark w-full" disabled={busy} onClick={send}>Kirim</button>
    </div>
  );
}
