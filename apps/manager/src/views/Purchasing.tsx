import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type PurchaseOrder } from "../lib/api";

type Line = { name: string; qty: number; unit: string; price: number };
const money = (n: number | string) => `Rp${Math.round(Number(n)).toLocaleString("id-ID")}`;
const STATUS: Record<string, string> = { draft: "Draf", sent: "Dipesan", received: "Diterima", cancelled: "Dibatalkan" };

export function PurchasingView() {
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ name: "", qty: 1, unit: "pcs", price: 0 }]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOrders((await api<{ orders: PurchaseOrder[] }>("/api/manager/purchase-orders")).orders); }
    catch { toast.error("PO belum bisa dimuat"); setOrders([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const total = lines.reduce((n, l) => n + Math.round(l.qty * l.price), 0);
  const set = (idx: number, patch: Partial<Line>) => setLines((cur) => cur.map((l, i) => i === idx ? { ...l, ...patch } : l));

  const submit = async () => {
    const items = lines.filter((l) => l.name.trim() && l.qty > 0);
    if (!supplier.trim() || items.length === 0) return toast.error("Supplier dan minimal satu item wajib diisi");
    setBusy(true);
    try {
      await api("/api/manager/purchase-orders", { method: "POST", body: { supplierName: supplier, note, items } });
      toast.success("PO dibuat");
      setCreating(false); setSupplier(""); setNote(""); setLines([{ name: "", qty: 1, unit: "pcs", price: 0 }]);
      void load();
    } catch { toast.error("PO belum tersimpan"); } finally { setBusy(false); }
  };

  const setStatus = async (o: PurchaseOrder, status: string) => {
    try { await api(`/api/manager/purchase-orders/${o.id}`, { method: "PATCH", body: { status } }); void load(); }
    catch { toast.error("Status belum tersimpan"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-mute">Purchase order tercatat ke supplier. Stok dan pengeluaran tetap dicatat di halamannya masing-masing.</p>
        <button className="btn btn-dark" onClick={() => setCreating((v) => !v)}><Plus size={15} />PO</button>
      </div>

      {creating && (
        <div className="panel space-y-2 p-3">
          <input className="input" placeholder="Nama supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={160} />
          {lines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_72px_72px_92px_36px] gap-1.5">
              <input className="input" placeholder="Bahan" value={l.name} onChange={(e) => set(idx, { name: e.target.value })} />
              <input className="input" type="number" min={0} step="any" value={l.qty} onChange={(e) => set(idx, { qty: Number(e.target.value) })} />
              <input className="input" placeholder="unit" value={l.unit} onChange={(e) => set(idx, { unit: e.target.value })} />
              <input className="input" type="number" min={0} value={l.price} onChange={(e) => set(idx, { price: Number(e.target.value) })} />
              <button className="btn !min-h-9 !px-2" onClick={() => setLines((cur) => cur.length > 1 ? cur.filter((_, i) => i !== idx) : cur)} aria-label="Hapus"><Trash2 size={13} /></button>
            </div>
          ))}
          <button className="btn w-full" onClick={() => setLines((cur) => [...cur, { name: "", qty: 1, unit: "pcs", price: 0 }])}><Plus size={14} />Tambah baris</button>
          <textarea className="input" rows={2} placeholder="Catatan / jadwal kirim" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center justify-between text-sm"><span className="label">Total</span><b>{money(total)}</b></div>
          <button className="btn btn-dark w-full" disabled={busy} onClick={submit}>{busy ? "Menyimpan…" : "Simpan PO"}</button>
        </div>
      )}

      {orders === null && <div className="label">Memuat…</div>}
      {orders?.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Belum ada PO.</div>}
      <ul className="space-y-2">
        {orders?.map((o) => (
          <li key={o.id} className="panel p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{o.supplier_name}</div>
                <div className="label">{o.number} · {new Date(o.created_at).toLocaleDateString("id-ID")}</div>
              </div>
              <div className="shrink-0 text-right"><div className="text-sm font-bold">{money(o.total)}</div><div className="label">{STATUS[o.status] ?? o.status}</div></div>
            </div>
            <div className="mt-2 space-y-0.5 text-[12px] text-mute">
              {o.items.map((i, idx) => <div key={idx} className="flex justify-between"><span>{i.name} · {i.qty} {i.unit}</span><span>{money(i.price * i.qty)}</span></div>)}
            </div>
            {o.note && <p className="mt-1 text-[12px] text-mute">{o.note}</p>}
            <div className="mt-2 flex gap-1.5">
              {o.status === "draft" && <button className="btn !min-h-8" onClick={() => setStatus(o, "sent")}>Tandai dipesan</button>}
              {o.status === "sent" && <button className="btn !min-h-8" onClick={() => setStatus(o, "received")}>Barang diterima</button>}
              {(o.status === "draft" || o.status === "sent") && <button className="btn !min-h-8" onClick={() => setStatus(o, "cancelled")}>Batalkan</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
