import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Role, type StockItem } from "../lib/api";
import { Empty, Kpis, rp, wib } from "../ui";

type Data = { mode: string; items: StockItem[] };
type Policy = {
  blind: boolean; cycle: boolean; perDay: number; tolDefault: number; tolImportant: number; tolAction: "review" | "auto"; recount: boolean; recountAbove: number;
  photoAbove: number; finalJournal: boolean; clockoutBar: boolean; clockoutDapur: boolean; schedBar: string; schedDapur: string; schedGudang: string; important: string[];
};
type LogRow = { id: number; at: string; actor_name: string | null; actor_role: string | null; source_app: string; what: string; from_value: string | null; to_value: string | null };
const DEFAULTS: Policy = { blind: true, cycle: true, perDay: 12, tolDefault: 2, tolImportant: 1, tolAction: "review", recount: true, recountAbove: 3, photoAbove: 100000, finalJournal: false, clockoutBar: true, clockoutDapur: true, schedBar: "Harian", schedDapur: "Rabu", schedGudang: "Bulanan", important: [] };
const PACKS = ["karton", "dus", "pack", "tray", "karung", "box", "ikat", "botol", "bottle"];
const SCHED = ["Harian", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Mingguan", "Bulanan", "Tidak ada"];
const qty = (n: number) => String(+n.toFixed(2)).replace(".", ",");

// effective "isi kemasan" = content_to_base_factor × pack_net_quantity (pack qty defaults to 1)
const factorOf = (i: StockItem) => { const f = Number(i.content_to_base_factor || 0); const p = Number(i.pack_net_quantity || 1); return f > 0 ? f * (p > 0 ? p : 1) : 0; };
const needFill = (i: StockItem) => !!i.preferred_purchase_unit && factorOf(i) <= 0;
const isLow = (i: StockItem) => (i.mode === "count" ? Number(i.quantity ?? 0) <= Number(i.low_stock_threshold || 0) && Number(i.low_stock_threshold || 0) > 0 : i.status === "out");

export function StockView({ role }: { role: Role }) {
  const [data, setData] = useState<Data | null>(null);
  const [pol, setPol] = useState<Policy>(DEFAULTS);
  const [log, setLog] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState<"Semua" | "Perlu diisi" | "Menipis">("Semua");
  const [q, setQ] = useState("");
  const [more, setMore] = useState(false);
  const [panel, setPanel] = useState<null | "count" | "log">(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const dis = role !== "manager";

  const load = useCallback(async () => {
    try {
      const [d, s, l] = await Promise.all([api<Data>("/api/manager/stock"), api<{ settings: { key: string; value: Partial<Policy> }[] }>("/api/manager/settings"), api<{ log: LogRow[] }>("/api/manager/stock/log")]);
      setData(d); setLog(l.log);
      setPol({ ...DEFAULTS, ...(s.settings.find((x) => x.key === "opname_policy")?.value ?? {}) });
    } catch { toast.error("Stok belum bisa dimuat"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flash = () => setSaved(`Tersimpan otomatis · ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · Admin ikut diperbarui`);
  const setPolicy = async (patch: Partial<Policy>) => {
    if (dis) return;
    const next = { ...pol, ...patch };
    setPol(next);
    try { await api("/api/manager/settings/opname_policy", { method: "PUT", body: { value: next } }); flash(); const l = await api<{ log: LogRow[] }>("/api/manager/stock/log"); setLog(l.log); }
    catch { toast.error("Aturan belum tersimpan"); void load(); }
  };
  const saveConv = async (it: StockItem, unit: string, factor: string) => {
    const f = Number(String(factor).replace(",", "."));
    if (unit && factor !== "" && !(f > 0)) { toast.error("Isi angka lebih dari 0"); return; }
    try {
      await api("/api/manager/stock/conversion", { method: "POST", body: { inventoryId: it.source_id, baseUnit: it.base_unit || it.unit, purchaseUnit: unit, contentToBaseFactor: factor === "" ? null : f, packNetQuantity: factor === "" ? null : 1, packNetUnit: it.base_unit || it.unit } });
      flash(); void load();
    } catch { toast.error("Konversi belum tersimpan"); }
  };
  const star = async (it: StockItem) => {
    const on = !pol.important.includes(it.source_id);
    try { await api("/api/manager/stock/important", { method: "POST", body: { inventoryId: it.source_id, on } }); setPol({ ...pol, important: on ? [...pol.important, it.source_id] : pol.important.filter((x) => x !== it.source_id) }); flash(); } catch { toast.error("Hanya Manager yang bisa mengubah"); }
  };

  const items = data?.items ?? [];
  const nNeed = items.filter(needFill).length;
  const nLow = items.filter(isLow).length;
  const list = useMemo(() => items.filter((i) => (filter === "Semua" || (filter === "Perlu diisi" && needFill(i)) || (filter === "Menipis" && isLow(i))) && (!q || i.ingredient_name.toLowerCase().includes(q.toLowerCase()))), [items, filter, q]);
  if (!data) return <div className="empty">Memuat stok…</div>;

  const chip = (k: keyof Policy, label: string, extra?: React.ReactNode) => <><button className={`chipb ${pol[k] ? "on" : ""}`} disabled={dis} onClick={() => setPolicy({ [k]: !pol[k] } as Partial<Policy>)}>{pol[k] ? "✓ " : ""}{label}</button>{extra}</>;
  const num = (k: keyof Policy, suffix?: string) => <><NumInput value={Number(pol[k])} disabled={dis} onCommit={(v) => setPolicy({ [k]: v } as Partial<Policy>)} />{suffix && <span className="meta">{suffix}</span>}</>;
  const tog = (k: keyof Policy, label: string) => <div className="mr" style={{ padding: "9px 0" }}><span><b style={{ fontWeight: 550 }}>{label}</b></span><button className={`cb ${pol[k] ? "on" : ""}`} disabled={dis} style={dis ? { opacity: 0.5 } : undefined} onClick={() => setPolicy({ [k]: !pol[k] } as Partial<Policy>)}>{pol[k] ? "✓" : ""}</button></div>;
  const sel = (k: "schedBar" | "schedDapur" | "schedGudang", label: string) => <div><label style={{ marginTop: 0 }}>{label}</label><select className="f" disabled={dis} value={pol[k]} onChange={(e) => setPolicy({ [k]: e.target.value } as Partial<Policy>)}>{SCHED.map((x) => <option key={x}>{x}</option>)}</select></div>;

  return (
    <div className="fin">
      <div className="fh">
        <div><div className="meta">Isi kemasan tiap bahan dan aturan opname. Ketik langsung di tabel, tersimpan otomatis. Beri bintang ★ pada bahan yang paling penting.</div></div>
        <span className="xlink flash"><i className="dotc ok" />{saved || "Sinkron dengan Admin"}</span>
      </div>

      <div className="panel pad opstrip">
        <span className="lab n" style={{ marginRight: 4 }}>Aturan opname</span>
        {chip("blind", "Hitung tanpa lihat stok")}
        {chip("cycle", "Opname bertahap", pol.cycle ? <span className="opi">{num("perDay", "bahan / hari")}</span> : null)}
        <span className="opi"><span className="meta">Selisih wajar: bahan biasa</span>{num("tolDefault", "%")}<span className="meta">penting ★</span>{num("tolImportant", "%")}</span>
        <span className="opi"><span className="meta">Bila melebihi</span>
          <select className="sel" disabled={dis} value={pol.tolAction} onChange={(e) => setPolicy({ tolAction: e.target.value as Policy["tolAction"] })}><option value="review">Perlu ditinjau</option><option value="auto">Koreksi otomatis</option></select></span>
        {chip("finalJournal", "Jurnal otomatis saat selesai")}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn s" onClick={() => setMore((v) => !v)}>{more ? "Aturan lainnya ▴" : "Aturan lainnya ▾"}</button>
          <button className={`btn s ${panel === "count" ? "p" : ""}`} onClick={() => setPanel(panel === "count" ? null : "count")}>Coba hitung</button>
          <button className={`btn s ${panel === "log" ? "p" : ""}`} onClick={() => setPanel(panel === "log" ? null : "log")}>Riwayat</button>
        </span>
        {dis && <div className="meta" style={{ width: "100%", marginTop: 4 }}>🔒 Aturan diatur Manager dan Owner. Anda tetap bisa mengisi isi kemasan di tabel.</div>}
      </div>

      {more && (
        <div className="panel pad"><div className="row2" style={{ alignItems: "start" }}>
          <div>{tog("recount", "Hitung ulang oleh orang lain bila selisih besar")}
            <div className="row2"><div><label style={{ marginTop: 0 }}>Hitung ulang bila selisih lebih dari (%)</label><NumInput full value={pol.recountAbove} disabled={dis || !pol.recount} onCommit={(v) => setPolicy({ recountAbove: v })} /></div>
              <div><label style={{ marginTop: 0 }}>Foto wajib bila nilai selisih (Rp)</label><NumInput full value={pol.photoAbove} disabled={dis} onCommit={(v) => setPolicy({ photoAbove: v })} /></div></div>
            {tog("clockoutBar", "Opname Bar wajib saat clock-out")}{tog("clockoutDapur", "Opname Dapur wajib saat clock-out")}</div>
          <div className="row2">{sel("schedBar", "Jadwal Bar")}{sel("schedDapur", "Jadwal Dapur")}{sel("schedGudang", "Jadwal Gudang")}</div>
        </div></div>
      )}

      <Kpis items={[{ v: items.length, l: "Bahan" }, { v: nNeed, l: "Isi kemasan belum diisi" }, { v: nLow, l: "Perlu perhatian" }, { v: pol.important.length, l: "Bahan penting ★" }]} />

      <div className="panel">
        <div className="ph" style={{ gap: 10, flexWrap: "wrap" }}>
          <span className="tabs" style={{ margin: 0 }}>{(["Semua", "Perlu diisi", "Menipis"] as const).map((f) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{f}{f === "Perlu diisi" ? ` ${nNeed}` : f === "Menipis" ? ` ${nLow}` : ""}</button>)}</span>
          <input type="text" className="f" placeholder="Cari bahan…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220, padding: "6px 10px" }} />
        </div>
        <div className="opr oph"><div>Bahan</div><div>Stok</div><div>Isi kemasan <span className="meta">(1 kemasan = berapa)</span></div><div>Penting</div><div>Status</div></div>
        {list.length === 0 && <Empty>Tidak ada bahan yang cocok</Empty>}
        {list.slice(0, 200).map((it) => (
          <div key={it.source_id}>
            <ConvRow it={it} important={pol.important.includes(it.source_id)} canStar={!dis} onStar={() => star(it)} onSave={saveConv} onOpen={() => setOpen(open === it.source_id ? null : it.source_id)} />
            {open === it.source_id && <StockEditor item={it} onSaved={() => { setOpen(null); void load(); }} />}
          </div>
        ))}
        {list.length > 200 && <div className="meta" style={{ padding: 12 }}>Menampilkan 200 pertama · gunakan pencarian untuk menyaring.</div>}
      </div>

      {panel === "count" && <CountSim items={items} pol={pol} />}
      {panel === "log" && (
        <div className="panel"><div className="ph"><span className="lab">Riwayat perubahan</span><span className="meta">Aplikasi Manager ⇄ Admin</span></div>
          <div className="tw2"><table><thead><tr><th>Waktu</th><th>Oleh</th><th>Dari</th><th>Perubahan</th><th>Sebelum → sesudah</th></tr></thead>
            <tbody>{log.map((l) => <tr key={l.id}><td className="mono">{wib(l.at)}</td><td>{l.actor_name ?? "—"}</td><td><span className={`tg ${l.source_app === "Admin" ? "o" : ""}`}>{l.source_app}</span></td><td>{l.what}</td><td className="mono">{l.from_value} → {l.to_value}</td></tr>)}</tbody></table>
            {log.length === 0 && <Empty>BELUM ADA PERUBAHAN</Empty>}</div></div>
      )}
    </div>
  );
}

function NumInput({ value, disabled, onCommit, full }: { value: number; disabled?: boolean; onCommit: (v: number) => void; full?: boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Number(v.replace(",", ".")); if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n); else setV(String(value)); };
  return <input type="text" inputMode="decimal" className={full ? "f" : "f opn"} disabled={disabled} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}

function ConvRow({ it, important, canStar, onStar, onSave, onOpen }: { it: StockItem; important: boolean; canStar: boolean; onStar: () => void; onSave: (it: StockItem, unit: string, factor: string) => void; onOpen: () => void }) {
  const f0 = factorOf(it);
  const [unit, setUnit] = useState(it.preferred_purchase_unit ?? "");
  const [factor, setFactor] = useState(f0 > 0 ? String(f0) : "");
  useEffect(() => { setUnit(it.preferred_purchase_unit ?? ""); setFactor(factorOf(it) > 0 ? String(factorOf(it)) : ""); }, [it]);
  const base = it.base_unit || it.unit;
  const need = needFill(it);
  const commit = (u = unit, f = factor) => { if (u === (it.preferred_purchase_unit ?? "") && Number(f || 0) === f0) return; onSave(it, u, f); };
  return (
    <div className={`opr ${need ? "need" : ""}`}>
      <div className="opn1"><b style={{ fontWeight: 550 }}>{it.ingredient_name}</b><div className="meta">{it.ingredient_group ?? it.category ?? "Bahan"}</div></div>
      <div className="mono" data-l="Stok">{it.mode === "count" ? `${Number(it.quantity ?? 0)} ${it.unit}` : <span className={`tg ${it.status === "out" ? "hi" : it.status === "available" ? "ok" : ""}`}>{it.status === "available" ? "Tersedia" : it.status === "out" ? "Habis" : "Belum dicek"}</span>}
        <div><button className="opadd" onClick={onOpen}>hitung / ubah</button></div></div>
      <div className="opc" data-l="Isi kemasan">
        <div className={`opcl ${need ? "need" : ""}`}>1
          <select className="sel" value={unit} onChange={(e) => { setUnit(e.target.value); if (e.target.value === "") { setFactor(""); commit("", ""); } else if (factor) commit(e.target.value, factor); }}>
            <option value="">—</option>{[...new Set([...PACKS, ...(it.preferred_purchase_unit ? [it.preferred_purchase_unit] : [])])].map((u) => <option key={u}>{u}</option>)}
          </select>
          {unit && <> = <input type="text" className="f" inputMode="decimal" placeholder="isi" value={factor} onChange={(e) => setFactor(e.target.value)} onBlur={() => commit()} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} /> <span className="meta">{base}</span></>}
          {!unit && <span className="meta">Tidak pakai kemasan</span>}
        </div>
      </div>
      <div data-l="Penting"><button className={`star ${important ? "on" : ""}`} disabled={!canStar} title={canStar ? undefined : "Hanya Manager yang bisa mengubah"} onClick={onStar}>{important ? "★" : "☆"}</button></div>
      <div data-l="Status">{need ? <span className="tg md">Isi dulu</span> : <span className="tg ok">Siap</span>}</div>
    </div>
  );
}

function CountSim({ items, pol }: { items: StockItem[]; pol: Policy }) {
  const counted = items.filter((i) => i.mode === "count");
  const [id, setId] = useState(counted[0]?.source_id ?? "");
  const [big, setBig] = useState("");
  const [small, setSmall] = useState("");
  const [sent, setSent] = useState(false);
  const o = counted.find((i) => i.source_id === id) ?? counted[0];
  if (!o) return <div className="panel"><Empty>BELUM ADA BAHAN DENGAN STOK HITUNG</Empty></div>;
  const f = factorOf(o) || 1;
  const base = o.base_unit || o.unit;
  const sys = Number(o.quantity ?? 0);
  const b = parseFloat(big.replace(",", ".")) || 0, s = parseFloat(small.replace(",", ".")) || 0;
  const total = b * f + s;
  const diff = +(total - sys).toFixed(2);
  const imp = pol.important.includes(o.source_id);
  const tol = imp ? pol.tolImportant : pol.tolDefault;
  const pct = sys ? (Math.abs(diff) / sys) * 100 : 0;
  const ok = pct <= tol;
  const val = Math.abs(diff) * Number(o.last_purchase_price || 0);
  return (
    <div className="panel"><div className="ph"><span className="lab">Coba hitung (tampilan untuk karyawan)</span><span className="meta">memakai konversi dan aturan di atas · tidak menyimpan</span></div>
      <div className="pad">
        <label style={{ marginTop: 0 }}>Bahan</label><select className="f" value={o.source_id} onChange={(e) => { setId(e.target.value); setSent(false); }}>{counted.slice(0, 300).map((x) => <option key={x.source_id} value={x.source_id}>{x.ingredient_name}</option>)}</select>
        <div className="row2"><div><label>Jumlah {o.preferred_purchase_unit || "kemasan"}</label><input className="f" inputMode="decimal" placeholder="0" value={big} onChange={(e) => setBig(e.target.value)} /></div>
          <div><label>{base} lepas</label><input className="f" inputMode="decimal" placeholder="0" value={small} onChange={(e) => setSmall(e.target.value)} /></div></div>
        <div className="xtip" style={{ marginTop: 12 }}><b>Total dihitung: {qty(total)} {base}</b><span>{factorOf(o) ? `${qty(b)} ${o.preferred_purchase_unit} × ${f} + ${qty(s)} ${base} lepas` : `Konversi belum ada; hitung langsung dalam ${base}`}</span></div>
        {pol.blind && !sent ? <div className="xwarn md" style={{ marginTop: 10 }}>Hitung buta aktif: angka sistem disembunyikan sampai Anda mengirim.</div> : <div className="meta" style={{ marginTop: 10 }}>Stok sistem: {sys} {base}</div>}
        <div className="crow"><button className="btn r" onClick={() => setSent(true)}>Kirim hitungan</button><button className="btn" onClick={() => { setBig(""); setSmall(""); setSent(false); }}>Ulangi</button></div>
        {sent && <div className={`box ${ok ? "a" : "w"}`} style={{ marginTop: 12 }}><b>{ok ? "Dalam toleransi" : "Melebihi toleransi"}</b>Selisih {diff > 0 ? "+" : ""}{qty(diff)} {base} ({pct.toFixed(1).replace(".", ",")}% · batas {tol}%) · nilai {rp(val)}.{ok ? " Stok sistem disesuaikan otomatis." : `${pol.tolAction === "review" ? " Masuk antrean tinjau." : " Dikoreksi otomatis dan dicatat."}${pol.recount && pct > pol.recountAbove ? " Hitung ulang oleh orang lain diminta." : ""}${val > pol.photoAbove ? " Foto bukti wajib." : ""}`}</div>}
      </div></div>
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
