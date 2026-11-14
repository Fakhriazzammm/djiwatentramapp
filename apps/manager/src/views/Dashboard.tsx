import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Role } from "../lib/api";

type Snapshot = {
  date: string;
  sales: { today: { orders: number; revenue: number }; yesterday: { orders: number; revenue: number }; week: { orders: number; revenue: number } };
  cash: { income: number; expense: number; net: number };
  attendance: { total: number; present: number; activeCashierShift: { shiftName?: string; cashierName?: string } | null; staff: { userId: string; name: string; status: string }[] };
  stockCritical: { name: string; unit: string; quantity: number; threshold: number }[];
  pendingOverFifteen: number;
  pendingLeaves: number;
  pendingExpenseApprovals: number;
  channels: { channel: string; orders: number; revenue: number }[];
  methods: { method: string; orders: number; revenue: number }[];
};
type Data = {
  name: string; role: Role; snapshot: Snapshot;
  tasks: { open: number; doneToday: number };
  recentExpenses: { id: string; merchant: string | null; total: string; status: string; tx_date: string }[];
};

const money = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const STATUS: Record<string, string> = { saved: "Tercatat", pending_approval: "Menunggu", rejected: "Ditolak", draft: "Draf" };

export function DashboardView({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    const load = () => api<Data>("/api/manager/dashboard").then(setData).catch(() => toast.error("Monitor belum bisa dimuat"));
    void load();
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data) return <div className="label">Memuat monitor…</div>;
  const s = data.snapshot;
  const delta = s.sales.yesterday.revenue > 0 ? ((s.sales.today.revenue - s.sales.yesterday.revenue) / s.sales.yesterday.revenue) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Penjualan hari ini" value={money(s.sales.today.revenue)} note={`${s.sales.today.orders} order`} />
        <Card label="vs kemarin" value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`} note={money(s.sales.yesterday.revenue)} />
        <Card label="Kas hari ini" value={money(s.cash.net)} note={`Masuk ${money(s.cash.income)}`} />
        <Card label="Hadir" value={`${s.attendance.present}/${s.attendance.total}`} note={s.attendance.activeCashierShift?.cashierName ? `Kasir: ${s.attendance.activeCashierShift.cashierName}` : "Belum ada shift kasir"} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className="panel p-3 text-left" onClick={() => onNavigate("tasks")}><div className="label">Tugas aktif</div><div className="mt-1 text-xl font-bold">{data.tasks.open}</div><div className="label">{data.tasks.doneToday} selesai hari ini</div></button>
        <button className="panel p-3 text-left" onClick={() => onNavigate("expenses")}><div className="label">Pengeluaran menunggu</div><div className="mt-1 text-xl font-bold">{s.pendingExpenseApprovals}</div><div className="label">persetujuan</div></button>
        <button className="panel p-3 text-left" onClick={() => onNavigate("team")}><div className="label">Izin menunggu</div><div className="mt-1 text-xl font-bold">{s.pendingLeaves}</div><div className="label">pengajuan</div></button>
      </div>

      {(s.pendingOverFifteen > 0 || s.stockCritical.length > 0) && (
        <div className="panel divide-y p-0">
          {s.pendingOverFifteen > 0 && <div className="flex items-center justify-between p-3 text-sm"><span><b className="text-brand">{s.pendingOverFifteen}</b> pesanan menunggu lebih dari 15 menit</span><button className="btn !min-h-8" onClick={() => onNavigate("tasks")}>Lihat tugas</button></div>}
          {s.stockCritical.slice(0, 5).map((x) => (
            <div key={x.name} className="flex items-center justify-between p-3 text-sm">
              <span><b className={x.quantity <= 0 ? "text-brand" : ""}>{x.name}</b> · {x.quantity} {x.unit}</span>
              <span className="label">batas {x.threshold}</span>
            </div>
          ))}
          {s.stockCritical.length > 0 && <button className="p-3 text-left text-sm font-semibold" onClick={() => onNavigate("stock")}>Buka Stok & Opname →</button>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="panel p-3">
          <div className="label mb-2">Sumber transaksi hari ini</div>
          {s.channels.length === 0 && <p className="text-sm text-mute">Belum ada transaksi.</p>}
          {s.channels.map((c) => <Row key={c.channel} label={c.channel} value={money(c.revenue)} note={`${c.orders} order`} />)}
        </section>
        <section className="panel p-3">
          <div className="label mb-2">Metode pembayaran</div>
          {s.methods.length === 0 && <p className="text-sm text-mute">Belum ada pembayaran.</p>}
          {s.methods.map((c) => <Row key={c.method} label={c.method || "Lainnya"} value={money(c.revenue)} note={`${c.orders} order`} />)}
        </section>
      </div>

      {data.role === "manager" && (
        <section className="panel p-3">
          <div className="flex items-center justify-between"><div className="label">Pengeluaran terakhir</div><button className="btn !min-h-8" onClick={() => onNavigate("expenses")}>Catat</button></div>
          {data.recentExpenses.length === 0 && <p className="mt-2 text-sm text-mute">Belum ada pengeluaran.</p>}
          {data.recentExpenses.map((e) => (
            <div key={e.id} className="mt-2 flex items-center justify-between text-sm">
              <span className="truncate">{e.merchant ?? "Pengeluaran"}</span>
              <span className="flex shrink-0 items-center gap-2"><span>{money(Number(e.total))}</span><span className="label">{STATUS[e.status] ?? e.status}</span></span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="panel p-3"><div className="label">{label}</div><div className="mt-1 text-lg font-bold leading-tight">{value}</div><div className="label mt-1">{note}</div></div>;
}
function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="flex items-center justify-between border-t border-line py-1.5 text-sm first:border-0"><span className="capitalize">{label}</span><span className="text-right"><b>{value}</b><span className="label ml-2">{note}</span></span></div>;
}
