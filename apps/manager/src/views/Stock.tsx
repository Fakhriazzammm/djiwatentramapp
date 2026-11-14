import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type StockItem } from "../lib/api";
import { Empty, Kpis, Panel } from "../ui";

type Data = { mode: string; items: StockItem[] };

export function StockView() {
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "low" | "pack">("all");

  const load = useCallback(async () => {
    try { setData(await api<Data>("/api/manager/stock")); } catch { toast.error("Stok belum bisa dimuat"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="empty">Memuat stok…</div>;
  const isLow = (i: StockItem) => (i.mode === "count" ? Number(i.quantity ?? 0) <= Number(i.low_stock_threshold || 0) && Number(i.low_stock_threshold || 0) > 0 : i.status === "out");
  const needsPack = (i: StockItem) => !!i.preferred_purchase_unit && !i.content_to_base_factor;
  const items = data.items.filter((i) => (!query || i.ingredient_name.toLowerCase().includes(query.toLowerCase()) || (i.ingredient_group ?? "").toLowerCase().includes(query.toLowerCase())) && (filter === "all" || (filter === "low" && isLow(i)) || (filter === "pack" && needsPack(i))));
  const critical = data.items.filter(isLow).length;
  const pack = data.items.filter(needsPack).length;

  return (
    <div className="fin">
      <div className="fh">
        <div><div className="meta">Isi kemasan tiap bahan dan jumlah stok. Perubahan langsung tersinkron dengan Admin dan Karyawan.</div></div>
        <span className="meta" style={{ marginLeft: "auto" }}>mode {data.mode}</span>
      </div>
      <Kpis items={[{ v: data.items.length, l: "Bahan" }, { v: critical, l: "Perlu perhatian" }, { v: pack, l: "Isi kemasan belum diisi" }]} />
      <Panel fill title="Bahan & satuan" action={<span className="opstrip">
        {([["all", "Semua"], ["low", "Menipis"], ["pack", "Perlu diisi"]] as const).map(([k, l]) => <button key={k} className={`chipb ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}
        <input type="text" className="f" style={{ width: 180, padding: "5px 9px" }} placeholder="Cari bahan…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </span>}>
        <div className="sc">
          <div className="opr oph"><span>Bahan</span><span>Stok</span><span>Satuan beli → dasar</span><span>Batas</span><span /></div>
          {items.length === 0 && <Empty>BAHAN TIDAK DITEMUKAN</Empty>}
          {items.map((it) => (
            <div key={it.source_id}>
              <div className={`opr ${needsPack(it) ? "need" : ""}`}>
                <div><b style={{ fontWeight: 550 }}>{it.ingredient_name}</b><div className="meta">{it.ingredient_group ?? it.category ?? "Bahan"}</div></div>
                <div data-l="Stok">{it.mode === "count" ? <b>{Number(it.quantity ?? 0)} {it.unit}</b> : <span className={`tg ${it.status === "out" ? "hi" : it.status === "available" ? "ok" : ""}`}>{it.status === "available" ? "Tersedia" : it.status === "out" ? "Habis" : "Belum dicek"}</span>}</div>
                <div className="opc" data-l="Satuan">
                  {it.pack_net_quantity && it.content_to_base_factor ? <span>1 {it.preferred_purchase_unit || "kemasan"} = {it.pack_net_quantity} × {it.content_to_base_factor} {it.base_unit || it.unit}</span> : <span className="meta">{needsPack(it) ? `1 ${it.preferred_purchase_unit} = ? ${it.base_unit || it.unit} (isi)` : `dasar ${it.base_unit || it.unit}`}</span>}
                </div>
                <div data-l="Batas" className="meta">{Number(it.low_stock_threshold || 0) || "—"}</div>
                <button className="btn s" onClick={() => setOpen(open === it.source_id ? null : it.source_id)}>{open === it.source_id ? "Tutup" : "Ubah"}</button>
              </div>
              {open === it.source_id && <StockEditor item={it} onSaved={() => { setOpen(null); void load(); }} />}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function StockEditor({ item, onSaved }: { item: StockItem; onSaved: () => void }) {
  const [mode, setMode] = useState<"count" | "availability">(item.mode === "count" ? "count" : "availability");
  const [quantity, setQuantity] = useState(String(Number(item.quantity ?? 0)));
  const [status, setStatus] = useState(item.status === "available" || item.status === "out" ? item.status : "available");
  const [unit, setUnit] = useState(item.unit || "pcs");
  const [note, setNote] = useState("");
  const [baseUnit, setBaseUnit] = useState(item.base_unit ?? "");
  const [purchaseUnit, setPurchaseUnit] = useState(item.preferred_purchase_unit ?? "");
  const [factor, setFactor] = useState(item.content_to_base_factor ?? "");
  const [packQty, setPackQty] = useState(item.pack_net_quantity ?? "");
  const [packUnit, setPackUnit] = useState(item.pack_net_unit ?? "");
  const [busy, setBusy] = useState(false);

  const saveStock = async () => {
    setBusy(true);
    try {
      await api("/api/manager/stock/save", { method: "POST", body: {
        inventoryId: item.source_id, mode, unit, note,
        ...(mode === "count" ? { quantity: Number(quantity) } : { status }),
        expectedUpdatedAt: item.updatedAt ?? null,
      } });
      toast.success("Stok tersimpan");
      onSaved();
    } catch (e) {
      const err = e as Error & { message?: string };
      toast.error(err.message || "Stok belum tersimpan");
    } finally { setBusy(false); }
  };

  const saveConversion = async () => {
    setBusy(true);
    try {
      await api("/api/manager/stock/conversion", { method: "POST", body: {
        inventoryId: item.source_id, baseUnit, purchaseUnit,
        contentToBaseFactor: factor === "" ? null : Number(factor),
        packNetQuantity: packQty === "" ? null : Number(packQty), packNetUnit: packUnit,
      } });
      toast.success("Konversi tersimpan");
      onSaved();
    } catch (e) {
      const err = e as Error & { message?: string };
      toast.error(err.message || "Konversi belum tersimpan");
    } finally { setBusy(false); }
  };

  return (
    <div className="pad" style={{ background: "#fafafb", borderTop: "1px solid var(--line)" }}>
      <div className="row2">
        <select className="f" value={mode} onChange={(e) => setMode(e.target.value as "count" | "availability")}><option value="count">Hitung jumlah</option><option value="availability">Tersedia / habis</option></select>
        <select className="f" value={unit} onChange={(e) => setUnit(e.target.value)}>{["pcs", "pack", "botol", "kotak"].map((u) => <option key={u} value={u}>{u}</option>)}</select>
      </div>
      {mode === "count"
        ? <input className="f" type="number" min={0} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Jumlah fisik" />
        : <select className="f" value={status} onChange={(e) => setStatus(e.target.value)}><option value="available">Tersedia</option><option value="out">Habis</option><option value="unknown">Belum dicek</option></select>}
      <input className="f" placeholder="Catatan opname (opsional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <button className="btn p" style={{ marginTop: 10 }} disabled={busy} onClick={saveStock}>Simpan stok</button>

      <div className="xedit" style={{ marginTop: 14 }}>
        <label style={{ marginTop: 0 }}>Satuan beli → satuan dasar</label>
        <div className="row2">
          <input className="f" placeholder="Satuan dasar" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} />
          <input className="f" placeholder="Satuan beli" value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} />
          <input className="f" placeholder="Isi kemasan" value={packQty} onChange={(e) => setPackQty(e.target.value)} />
          <input className="f" placeholder="Satuan isi" value={packUnit} onChange={(e) => setPackUnit(e.target.value)} />
          <input className="f" placeholder="Faktor konversi ke satuan dasar" value={factor} onChange={(e) => setFactor(e.target.value)} />
        </div>
        <p className="meta" style={{ marginTop: 6 }}>Contoh: 1 karton berisi 50 pcs → isi 50, satuan isi pcs, faktor 50.</p>
        <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={saveConversion}>Simpan konversi</button>
      </div>
    </div>
  );
}
