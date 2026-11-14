import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type PurchaseOrder, type Role } from "../lib/api";
import { Empty, Kpis, Panel, rp } from "../ui";

type Line = { name: string; qty: number; unit: string; price: number };
const STATUS: Record<string, [string, string]> = { draft: ["Draf", ""], sent: ["Dipesan", "md"], received: ["Diterima", "ok"], cancelled: ["Dibatalkan", "hi"] };
const blank = (): Line => ({ name: "", qty: 1, unit: "pcs", price: 0 });

export function PurchasingView({ role }: { role: Role }) {
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [low, setLow] = useState(0);
  const [creating, setCreating] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const watch = role === "manager";

  const load = useCallback(async () => {
    try { setOrders((await api<{ orders: PurchaseOrder[] }>("/api/manager/purchase-orders")).orders); } catch { toast.error("PO belum bisa dimuat"); setOrders([]); }
    api<{ snapshot: { stockCritical: unknown[] } }>("/api/manager/dashboard").then((d) => setLow(d.snapshot.stockCritical.length)).catch(() => undefined);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const total = lines.reduce((n, l) => n + Math.round(l.qty * l.price), 0);
  const set = (i: number, p: Partial<Line>) => setLines((c) => c.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const submit = async () => {
    const items = lines.filter((l) => l.name.trim() && l.qty > 0);
    if (!supplier.trim() || items.length === 0) { toast.error("Supplier dan minimal satu item wajib diisi"); return; }
    setBusy(true);
    try {
      await api("/api/manager/purchase-orders", { method: "POST", body: { supplierName: supplier, note, items } });
      toast.success("PO dibuat"); setCreating(false); setSupplier(""); setNote(""); setLines([blank()]); void load();
    } catch { toast.error("PO belum tersimpan"); } finally { setBusy(false); }
  };
  const setStatus = async (o: PurchaseOrder, status: string) => {
    try { await api(`/api/manager/purchase-orders/${o.id}`, { method: "PATCH", body: { status } }); void load(); } catch { toast.error("Status belum tersimpan"); }
  };

  const list = orders ?? [];
  const running = list.filter((o) => o.status === "draft" || o.status === "sent").length;

  return (
    <>
      <Kpis items={[{ v: running, l: "PO berjalan" }, { v: low, l: "Bahan menipis" }, { v: list.filter((o) => o.status === "received").length, l: "PO diterima" }, { v: rp(list.reduce((a, o) => a + Number(o.total), 0)), l: "Nilai semua PO" }]} />
      {!watch && (
        <Panel title="Purchase order baru" action={<button className="btn r s" onClick={() => setCreating((v) => !v)}>{creating ? "Tutup" : "+ PO"}</button>}>
          {creating && (
            <div className="pad">
              <label style={{ marginTop: 0 }}>Supplier</label><input className="f" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={160} />
              <label>Item</label>
              {lines.map((l, i) => (
                <div key={i} className="crow" style={{ marginTop: 6 }}>
                  <input className="f" style={{ flex: 2, minWidth: 140 }} placeholder="Bahan" value={l.name} onChange={(e) => set(i, { name: e.target.value })} />
                  <input className="f" style={{ width: 70 }} type="number" min={0} step="any" value={l.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
                  <input className="f" style={{ width: 70 }} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
                  <input className="f" style={{ width: 110 }} type="number" min={0} placeholder="Harga" value={l.price} onChange={(e) => set(i, { price: Number(e.target.value) })} />
                  <button className="btn s" onClick={() => setLines((c) => (c.length > 1 ? c.filter((_, j) => j !== i) : c))}>×</button>
                </div>
              ))}
              <div className="crow"><button className="btn s" onClick={() => setLines((c) => [...c, blank()])}>+ Tambah baris</button><span className="meta" style={{ marginLeft: "auto" }}>Total {rp(total)}</span></div>
              <label>Catatan / jadwal kirim</label><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn r" style={{ marginTop: 12 }} disabled={busy} onClick={submit}>{busy ? "Menyimpan…" : "Simpan PO"}</button>
            </div>
          )}
        </Panel>
      )}
      <Panel fill title="Purchase order" meta={watch ? "Hanya pantau" : "Kelola status"}>
        <div className="sc"><table>
          <thead><tr><th>PO</th><th>Supplier</th><th>Item</th><th>Total</th><th>Status</th>{!watch && <th />}</tr></thead>
          <tbody>{list.map((o) => (
            <tr key={o.id}>
              <td className="mono">{o.number}</td><td>{o.supplier_name}</td>
              <td>{o.items.map((i) => `${i.name} ${i.qty} ${i.unit}`).join(", ")}</td>
              <td className="mono">{rp(o.total)}</td><td><span className={`tg ${STATUS[o.status]?.[1] ?? ""}`}>{STATUS[o.status]?.[0] ?? o.status}</span></td>
              {!watch && <td style={{ whiteSpace: "nowrap" }}>
                {o.status === "draft" && <button className="btn s p" onClick={() => setStatus(o, "sent")}>Dipesan</button>}
                {o.status === "sent" && <button className="btn s p" onClick={() => setStatus(o, "received")}>Diterima</button>}
                {(o.status === "draft" || o.status === "sent") && <button className="btn s" onClick={() => setStatus(o, "cancelled")}>Batal</button>}
              </td>}
            </tr>))}
          </tbody>
        </table>{orders && list.length === 0 && <Empty>BELUM ADA PO</Empty>}</div>
      </Panel>
    </>
  );
}
