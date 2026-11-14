import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, type ExpenseDraft, type ExpenseItem } from "../lib/api";
import { API_BASE } from "../lib/auth";
import { Empty, Ic, Panel, rp, wib } from "../ui";

type Format = { header?: string; showNo?: boolean; showPay?: boolean; showIcons?: boolean; footer?: string; showConf?: boolean };
type Data = {
  drafts: ExpenseDraft[];
  categories: { slug: string; label: string; icon: string }[];
  policy: { approvalAbove?: number; photoMin?: number };
  format?: Format;
  role: "manager" | "supervisor";
};
const STATUS: Record<string, [string, string]> = { saved: ["Tercatat", "ok"], pending_approval: ["Menunggu", "md"], rejected: ["Ditolak", "hi"], draft: ["Draf", ""] };
const METHODS = [["cash", "Tunai"], ["qris", "QRIS"], ["transfer", "Transfer"], ["debit", "Debit"], ["credit", "Kartu kredit"], ["ewallet", "Dompet digital"]];
const todayLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const emptyItem = (category = "lainnya"): ExpenseItem => ({ name: "", qty: 1, unit: "pcs", price: 0, total: 0, category });
const img = (u: string) => (u.startsWith("/") ? `${API_BASE}${u}` : u);

type Tab = "scan" | "hist" | "appr";

export function ExpensesView() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("scan");
  const [tg, setTg] = useState(false);
  const [preview, setPreview] = useState<{ merchant: string; items: ExpenseItem[]; total: number; pay: string }>({ merchant: "", items: [], total: 0, pay: "cash" });

  const load = useCallback(async () => {
    try { setData(await api<Data>("/api/manager/expenses")); } catch { toast.error("Pengeluaran belum bisa dimuat"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (d: ExpenseDraft, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Alasan penolakan (wajib):") ?? "" : "";
    if (decision === "reject" && !note.trim()) return;
    try {
      await api(`/api/manager/expenses/${d.id}`, { method: "PATCH", body: { decision, note } });
      toast.success(decision === "approve" ? "Pengeluaran dicatat" : "Pengeluaran ditolak"); void load();
    } catch { toast.error("Keputusan belum tersimpan"); }
  };

  const pending = (data?.drafts ?? []).filter((d) => d.status === "pending_approval");
  const tabs: [Tab, string][] = [["scan", "Scan / input"], ["hist", "Riwayat"], ...(data?.role === "manager" ? [["appr", `Persetujuan ${pending.length}`] as [Tab, string]] : [])];
  const fmt = data?.format ?? {};
  const cat = (slug: string) => data?.categories.find((c) => c.slug === slug);
  const pay = METHODS.find((m) => m[0] === preview.pay)?.[1] ?? preview.pay;
  const lines = [fmt.header || "💸 Pengeluaran Tercatat!", "", `🏪 ${preview.merchant || "(nama toko)"}`, `💰 Total: ${rp(preview.total)}`,
    ...(fmt.showPay === false ? [] : [`💳 ${pay}`]), "",
    ...preview.items.map((i, n) => `${fmt.showNo === false ? "•" : `${n + 1}.`} ${fmt.showIcons === false ? "" : `${cat(i.category)?.icon ?? "📌"} `}${i.name || "(item)"} — ${i.qty} ${i.unit} · ${rp(i.total || i.qty * i.price)}`),
    ...(fmt.footer ? ["", fmt.footer] : [])];

  return (
    <div className="xp" data-tg={tg ? "open" : "closed"}>
      <div className="xmain">
        <div className="xtabs">
          <div className="tabs" style={{ margin: 0 }}>{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
          <span className="xlink"><Ic n="sync" /> &nbsp;Sinkron dengan bot Telegram</span>
        </div>
        {!data && <div className="empty">Memuat…</div>}
        {data && tab === "scan" && <Compose key={data.drafts.length} categories={data.categories} policy={data.policy} role={data.role} onChange={setPreview} onDone={() => { void load(); setTab("hist"); }} />}
        {data && tab === "hist" && <History drafts={data.drafts} role={data.role} />}
        {data && tab === "appr" && (
          <Panel title="Menunggu persetujuan" meta={`${pending.length} pengeluaran`}>
            {pending.length === 0 && <Empty>TIDAK ADA YANG MENUNGGU</Empty>}
            {pending.map((d) => (
              <div key={d.id} className="mr"><span><b>{d.merchant || "Pengeluaran"}</b> <span className="meta">{d.created_by_name} · {wib(d.tx_date)}</span></span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}><b>{rp(d.total)}</b><button className="btn s p" onClick={() => decide(d, "approve")}>Setujui</button><button className="btn s" onClick={() => decide(d, "reject")}>Tolak</button></span></div>
            ))}
          </Panel>
        )}
      </div>
      <div className="xtg">
        <button className="btn r only-m xtgbtn" onClick={() => setTg((v) => !v)}><Ic n="tg" />Pesan Telegram</button>
        <div className="tgp">
          <div className="tgh"><div className="tgav">Y</div><div><b>Yumi Finance</b><small>bot · pratinjau pesan yang sama</small></div></div>
          <div className="tgc"><div className="tgbub">{lines.join("\n")}<span className="tgt">{new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span></div></div>
        </div>
      </div>
    </div>
  );
}

function History({ drafts, role }: { drafts: ExpenseDraft[]; role: string }) {
  return (
    <Panel title="Riwayat pengeluaran" meta={role === "manager" ? "semua pengguna" : "milik Anda"}>
      <div className="tw2"><table>
        <thead><tr><th>Waktu</th><th>Toko</th><th>Item</th><th>Via</th><th style={{ textAlign: "right" }}>Total</th><th>Status</th><th /></tr></thead>
        <tbody>{drafts.map((d) => {
          const items = Array.isArray(d.items) ? d.items : [];
          const st = STATUS[d.status] ?? [d.status, ""];
          return (
            <tr key={d.id}>
              <td className="mono">{wib(d.tx_date)}</td><td>{d.merchant || "Pengeluaran"}<div className="meta">{d.created_by_name}</div></td>
              <td>{items.slice(0, 3).map((i) => i.name).join(", ")}{items.length > 3 ? ` +${items.length - 3}` : ""}</td>
              <td><span className="tg">{d.channel === "telegram" ? "Telegram" : "Aplikasi"}</span></td>
              <td className="mono" style={{ textAlign: "right" }}>{rp(d.total)}</td><td><span className={`tg ${st[1]}`}>{st[0]}</span></td>
              <td>{d.photo_url && <a className="btn s" href={img(d.photo_url)} target="_blank" rel="noopener noreferrer">Struk</a>}</td>
            </tr>
          );
        })}</tbody>
      </table>{drafts.length === 0 && <Empty>BELUM ADA PENGELUARAN</Empty>}</div>
    </Panel>
  );
}

function Compose({ categories, policy, role, onChange, onDone }: { categories: Data["categories"]; policy: Data["policy"]; role: string; onChange: (p: { merchant: string; items: ExpenseItem[]; total: number; pay: string }) => void; onDone: () => void }) {
  const [merchant, setMerchant] = useState("");
  const [txDate, setTxDate] = useState(todayLocal());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([emptyItem(categories[0]?.slug)]);
  const [stage, setStage] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const total = items.reduce((n, i) => n + (Number(i.total) || Number(i.qty) * Number(i.price) || 0), 0);
  useEffect(() => { onChange({ merchant, items, total, pay: paymentMethod }); }, [merchant, items, total, paymentMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (idx: number, patch: Partial<ExpenseItem>) => setItems((cur) => cur.map((it, i) => {
    if (i !== idx) return it;
    const next = { ...it, ...patch };
    if ("qty" in patch || "price" in patch) next.total = Math.round(Number(next.qty) * Number(next.price));
    return next;
  }));

  const scan = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { toast.error("Foto maksimal 8 MB"); return; }
    setStage(1);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("read")); r.readAsDataURL(file); });
      setStage(2);
      const res = await api<{ draft: { merchant: string; date: string; paymentMethod: string; items: ExpenseItem[] }; imageUrl: string }>("/api/manager/expenses/scan", { method: "POST", body: { image: dataUrl } });
      setPhotoUrl(res.imageUrl); setMerchant(res.draft.merchant || ""); setTxDate(res.draft.date.slice(0, 16)); setPaymentMethod(res.draft.paymentMethod || "cash");
      setItems(res.draft.items.length ? res.draft.items : [emptyItem(categories[0]?.slug)]);
      setStage(3); toast.success("Struk terbaca. Periksa item sebelum menyimpan.");
    } catch (e) {
      setStage(0);
      toast.error((e as { code?: string }).code === "AI_UNAVAILABLE" ? "AI belum aktif. Isi manual atau hubungi Owner." : "Struk belum bisa dibaca. Isi manual.");
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (!merchant.trim()) { toast.error("Nama toko wajib diisi"); return; }
    if (total <= 0) { toast.error("Total harus lebih dari nol"); return; }
    setSaving(true);
    try {
      const res = await api<{ pendingApproval: boolean }>("/api/manager/expenses", { method: "POST", body: { merchant, txDate: new Date(txDate).toISOString(), paymentMethod, note, photoUrl, total, items } });
      toast.success(res.pendingApproval ? "Menunggu persetujuan Manager" : "Pengeluaran tercatat"); onDone();
    } catch { toast.error("Pengeluaran belum tersimpan"); } finally { setSaving(false); }
  };

  const steps = ["Foto diterima", "Membaca teks struk", "Mencocokkan kategori", "Siap diperiksa"];
  const over = role === "supervisor" && policy.approvalAbove && total > policy.approvalAbove;

  return (
    <>
      <Panel title="Scan struk dengan AI" meta="foto → draf pengeluaran">
        <div className="pad">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); }} />
          <div className="dz"><Ic n="camera" /><b>Foto atau pilih struk</b><span className="meta">JPG, PNG, WEBP · maks. 8 MB · AI membaca toko, item, harga, dan kategori</span>
            <button className="btn r" disabled={stage === 1 || stage === 2} onClick={() => fileRef.current?.click()}><Ic n="camera" />Ambil / pilih foto</button></div>
          {stage > 0 && <div className="xst">{steps.map((s, i) => <div key={s} className="xs2" style={i < stage ? { background: "var(--oks)", color: "var(--ok)" } : i === stage ? { background: "var(--ws)", color: "var(--warn)" } : undefined}><span>{i < stage ? "✓" : i === stage ? <i className="spin" /> : i + 1}</span>{s}</div>)}</div>}
        </div>
      </Panel>

      <Panel title="Pengeluaran" meta={photoUrl ? "dari struk" : "input manual"}>
        <div className="pad">
          <div className="xhead">
            {photoUrl && <img className="xthumb" src={img(photoUrl)} alt="Struk" />}
            <div className="xgrid">
              <div className="xf"><label>Toko / supplier</label><input className="f" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} /></div>
              <div className="xf"><label>Tanggal</label><input className="f" type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)} /></div>
              <div className="xf"><label>Pembayaran</label><select className="f" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>{METHODS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></div>
              <div className="xf"><label>Catatan</label><input className="f" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
          </div>
          {over && <div className="xwarn md">Total di atas {rp(policy.approvalAbove ?? 0)}: perlu persetujuan Manager sebelum tercatat.</div>}
          {!photoUrl && policy.photoMin && total >= policy.photoMin ? <div className="xwarn md">Pengeluaran ≥ {rp(policy.photoMin)} sebaiknya disertai foto struk.</div> : null}
          <div className="xitems">
            {items.map((it, idx) => (
              <div key={idx} className="xit">
                <input className="f xn" placeholder="Item" value={it.name} onChange={(e) => set(idx, { name: e.target.value })} />
                <input className="f" type="number" min={0} step="any" value={it.qty} onChange={(e) => set(idx, { qty: Number(e.target.value) })} />
                <input className="f" value={it.unit} onChange={(e) => set(idx, { unit: e.target.value })} />
                <input className="f" type="number" min={0} value={it.price} onChange={(e) => set(idx, { price: Number(e.target.value) })} />
                <span className="xs">{rp(it.total || it.qty * it.price)}</span>
                <div className="xc"><select className="f" value={it.category} onChange={(e) => set(idx, { category: e.target.value })}>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>)}</select></div>
                <button className="btn s" onClick={() => setItems((c) => (c.length > 1 ? c.filter((_, i) => i !== idx) : c))}>×</button>
              </div>
            ))}
          </div>
          <button className="btn s" onClick={() => setItems((c) => [...c, emptyItem(categories[0]?.slug)])}>+ Tambah item</button>
          <div className="xsum"><div /><div /><div /><div className="xtot"><span className="meta">TOTAL</span><b>{rp(total)}</b></div></div>
          <div className="crow" style={{ marginTop: 12 }}><button className="btn r" disabled={saving || stage === 1 || stage === 2} onClick={save}>{saving ? "Menyimpan…" : "Simpan pengeluaran"}</button><span className="meta">Dicatat ke Keuangan · stok tidak berubah otomatis.</span></div>
        </div>
      </Panel>
    </>
  );
}
