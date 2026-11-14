import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Ruler, Search } from "lucide-react";
import { toast } from "sonner";
import { api, type StockItem } from "../lib/api";

type Data = { mode: string; items: StockItem[] };

export function StockView() {
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<Data>("/api/manager/stock")); }
    catch { toast.error("Stok belum bisa dimuat"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="label">Memuat stok…</div>;
  const items = data.items.filter((i) => !query || i.ingredient_name.toLowerCase().includes(query.toLowerCase()) || (i.ingredient_group ?? "").toLowerCase().includes(query.toLowerCase()));
  const critical = items.filter((i) => i.mode === "count" ? Number(i.quantity ?? 0) <= Number(i.low_stock_threshold || 0) : i.status === "out");

  return (
    <div className="space-y-3">
      <div className="panel flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="text-sm"><b>Stok &amp; Opname</b> <span className="label ml-2">mode {data.mode}</span></div>
        <div className="label">{critical.length} bahan perlu perhatian</div>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-3 text-mute" />
        <input className="input pl-9" placeholder="Cari bahan…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {items.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Bahan tidak ditemukan.</div>}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.source_id} className="panel p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{it.ingredient_name}</div>
                <div className="label mt-0.5">{it.ingredient_group ?? it.category ?? "Bahan"}{it.base_unit ? ` · dasar ${it.base_unit}` : ""}{it.preferred_purchase_unit ? ` · beli ${it.preferred_purchase_unit}` : ""}</div>
              </div>
              <div className="shrink-0 text-right">
                {it.mode === "count" ? <div className="text-sm font-bold">{Number(it.quantity ?? 0)} {it.unit}</div> : <div className="text-sm font-bold capitalize">{it.status === "available" ? "Tersedia" : it.status === "out" ? "Habis" : "Belum dicek"}</div>}
                <div className="label">{it.updatedBy ? `oleh ${it.updatedBy}` : "belum diisi"}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button className="btn !min-h-8" onClick={() => setOpen(open === it.source_id ? null : it.source_id)}><Ruler size={13} />Satuan &amp; hitung<ChevronDown size={13} /></button>
              {it.pack_net_quantity && it.content_to_base_factor && <span className="label">1 {it.preferred_purchase_unit || "kemasan"} = {it.pack_net_quantity} × {it.content_to_base_factor} {it.base_unit || it.unit}</span>}
            </div>
            {open === it.source_id && <StockEditor item={it} onSaved={() => { setOpen(null); void load(); }} />}
          </li>
        ))}
      </ul>
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
    <div className="mt-2 space-y-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "count" | "availability")}><option value="count">Hitung jumlah</option><option value="availability">Tersedia / habis</option></select>
        <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>{["pcs", "pack", "botol", "kotak"].map((u) => <option key={u} value={u}>{u}</option>)}</select>
      </div>
      {mode === "count"
        ? <input className="input" type="number" min={0} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Jumlah fisik" />
        : <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="available">Tersedia</option><option value="out">Habis</option><option value="unknown">Belum dicek</option></select>}
      <input className="input" placeholder="Catatan opname (opsional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <button className="btn btn-dark w-full" disabled={busy} onClick={saveStock}>Simpan stok</button>

      <div className="rounded-lg bg-canvas p-2">
        <div className="label mb-2">Satuan beli → satuan dasar</div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="Satuan dasar" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} />
          <input className="input" placeholder="Satuan beli" value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} />
          <input className="input" placeholder="Isi kemasan" value={packQty} onChange={(e) => setPackQty(e.target.value)} />
          <input className="input" placeholder="Satuan isi" value={packUnit} onChange={(e) => setPackUnit(e.target.value)} />
          <input className="input col-span-2" placeholder="Faktor konversi ke satuan dasar" value={factor} onChange={(e) => setFactor(e.target.value)} />
        </div>
        <p className="mt-1 text-[11px] text-mute">Contoh: 1 karton berisi 50 pcs → isi 50, satuan isi pcs, faktor 50.</p>
        <button className="btn mt-2 w-full" disabled={busy} onClick={saveConversion}>Simpan konversi</button>
      </div>
    </div>
  );
}
