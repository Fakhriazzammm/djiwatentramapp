import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, type ExpenseDraft, type ExpenseItem } from "../lib/api";
import { API_BASE } from "../lib/auth";

type Data = {
  drafts: ExpenseDraft[];
  categories: { slug: string; label: string; icon: string }[];
  policy: { approvalAbove?: number; photoMin?: number };
  role: "manager" | "supervisor";
};
const money = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const STATUS: Record<string, string> = { saved: "Tercatat", pending_approval: "Menunggu Manager", rejected: "Ditolak", draft: "Draf" };
const METHODS = [["cash", "Tunai"], ["qris", "QRIS"], ["transfer", "Transfer"], ["debit", "Debit"], ["credit", "Kartu kredit"], ["ewallet", "Dompet digital"]];
const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const emptyItem = (category = "lainnya"): ExpenseItem => ({ name: "", qty: 1, unit: "pcs", price: 0, total: 0, category });

export function ExpensesView() {
  const [data, setData] = useState<Data | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<Data>("/api/manager/expenses")); }
    catch { toast.error("Pengeluaran belum bisa dimuat"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (d: ExpenseDraft, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("Alasan penolakan (wajib):") ?? "" : "";
    if (decision === "reject" && !note.trim()) return;
    try {
      await api(`/api/manager/expenses/${d.id}`, { method: "PATCH", body: { decision, note } });
      toast.success(decision === "approve" ? "Pengeluaran dicatat" : "Pengeluaran ditolak");
      void load();
    } catch { toast.error("Keputusan belum tersimpan"); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-mute">Catat pengeluaran toko. {data?.policy.approvalAbove ? `Di atas ${money(data.policy.approvalAbove)} perlu persetujuan Manager.` : ""}</p>
        <button className="btn btn-dark" onClick={() => setComposing((v) => !v)}><Plus size={15} />Catat</button>
      </div>
      {composing && data && (
        <Compose
          categories={data.categories}
          onDone={() => { setComposing(false); void load(); }}
          onClose={() => setComposing(false)}
        />
      )}

      {!data && <div className="label">Memuat…</div>}
      {data?.drafts.length === 0 && <div className="panel p-6 text-center text-sm text-mute">Belum ada pengeluaran.</div>}
      <ul className="space-y-2">
        {data?.drafts.map((d) => {
          const items = Array.isArray(d.items) ? d.items : [];
          return (
            <li key={d.id} className="panel p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{d.merchant || "Pengeluaran"}</div>
                  <div className="label mt-0.5">{new Date(d.tx_date).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}{d.created_by_name ? ` · ${d.created_by_name}` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold">{money(Number(d.total))}</div>
                  <div className={`label ${d.status === "pending_approval" ? "!text-brand" : ""}`}>{STATUS[d.status] ?? d.status}</div>
                </div>
              </div>
              {items.length > 0 && (
                <div className="mt-2 space-y-0.5 text-[12px] text-mute">
                  {items.slice(0, 6).map((i, idx) => <div key={idx} className="flex justify-between gap-2"><span className="truncate">{i.name} · {i.qty} {i.unit}</span><span>{money(Number(i.total ?? i.price * i.qty))}</span></div>)}
                  {items.length > 6 && <div>+{items.length - 6} item lain</div>}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {d.photo_url && <a className="btn !min-h-8" href={d.photo_url.startsWith("/") ? `${API_BASE}${d.photo_url}` : d.photo_url} target="_blank" rel="noopener noreferrer"><Camera size={13} />Struk</a>}
                {d.finance_source_id && <span className="label">jurnal: {d.finance_source_id.slice(0, 16)}…</span>}
                {data.role === "manager" && d.status === "pending_approval" && (
                  <>
                    <button className="btn !min-h-8" onClick={() => decide(d, "approve")}><Check size={13} />Setujui</button>
                    <button className="btn !min-h-8" onClick={() => decide(d, "reject")}><X size={13} />Tolak</button>
                  </>
                )}
              </div>
              {d.decision_note && <p className="mt-1 text-[12px] text-mute">Catatan: {d.decision_note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Compose({ categories, onDone, onClose }: { categories: Data["categories"]; onDone: () => void; onClose: () => void }) {
  const [merchant, setMerchant] = useState("");
  const [txDate, setTxDate] = useState(todayLocal());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([emptyItem(categories[0]?.slug)]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const total = items.reduce((n, i) => n + (Number(i.total) || Number(i.qty) * Number(i.price) || 0), 0);
  const set = (idx: number, patch: Partial<ExpenseItem>) => setItems((cur) => cur.map((it, i) => {
    if (i !== idx) return it;
    const next = { ...it, ...patch };
    if ("qty" in patch || "price" in patch) next.total = Math.round(Number(next.qty) * Number(next.price));
    return next;
  }));

  const scan = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) return toast.error("Foto maksimal 8 MB");
    setScanning(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const res = await api<{ draft: { merchant: string; date: string; paymentMethod: string; items: ExpenseItem[]; total: number }; imageUrl: string }>("/api/manager/expenses/scan", { method: "POST", body: { image: dataUrl } });
      setPhotoUrl(res.imageUrl);
      setMerchant(res.draft.merchant || "");
      setTxDate(res.draft.date.slice(0, 16));
      setPaymentMethod(res.draft.paymentMethod || "cash");
      setItems(res.draft.items.length ? res.draft.items : [emptyItem(categories[0]?.slug)]);
      toast.success("Struk terbaca. Periksa item sebelum menyimpan.");
    } catch (e) {
      const err = e as { code?: string; message?: string } & Error;
      toast.error(err.code === "AI_UNAVAILABLE" ? "AI belum aktif. Isi manual atau hubungi Owner." : "Struk belum bisa dibaca. Isi manual.");
    } finally { setScanning(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    if (!merchant.trim()) return toast.error("Nama toko wajib diisi");
    if (total <= 0) return toast.error("Total harus lebih dari nol");
    setSaving(true);
    try {
      const res = await api<{ pendingApproval: boolean }>("/api/manager/expenses", {
        method: "POST",
        body: { merchant, txDate: new Date(txDate).toISOString(), paymentMethod, note, photoUrl, total, items },
      });
      toast.success(res.pendingApproval ? "Menunggu persetujuan Manager" : "Pengeluaran tercatat");
      onDone();
    } catch { toast.error("Pengeluaran belum tersimpan"); } finally { setSaving(false); }
  };

  return (
    <div className="panel space-y-2 p-3">
      <div className="flex items-center justify-between"><div className="text-sm font-semibold">Pengeluaran baru</div><button className="btn !min-h-8" onClick={onClose}><X size={14} /></button></div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void scan(f); }} />
      <button className="btn w-full" disabled={scanning} onClick={() => fileRef.current?.click()}><Camera size={15} />{scanning ? "Membaca struk…" : "Foto / pilih struk"}</button>
      {photoUrl && <img src={photoUrl.startsWith("/") ? `${API_BASE}${photoUrl}` : photoUrl} alt="Struk" className="max-h-48 rounded border border-line object-contain" />}
      <input className="input" placeholder="Nama toko / supplier" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" type="datetime-local" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
        <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>{METHODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-lg border border-line p-2">
            <div className="flex gap-2">
              <input className="input" placeholder="Item" value={it.name} onChange={(e) => set(idx, { name: e.target.value })} />
              <button className="btn !min-h-9 !px-2" onClick={() => setItems((cur) => cur.length > 1 ? cur.filter((_, i) => i !== idx) : cur)} aria-label="Hapus item"><Trash2 size={14} /></button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <input className="input" type="number" min={0} step="any" placeholder="Qty" value={it.qty} onChange={(e) => set(idx, { qty: Number(e.target.value) })} />
              <input className="input" placeholder="Satuan" value={it.unit} onChange={(e) => set(idx, { unit: e.target.value })} />
              <input className="input" type="number" min={0} placeholder="Harga" value={it.price} onChange={(e) => set(idx, { price: Number(e.target.value) })} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select className="input" value={it.category} onChange={(e) => set(idx, { category: e.target.value })}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>)}
              </select>
              <input className="input" type="number" min={0} placeholder="Total item" value={it.total} onChange={(e) => set(idx, { total: Number(e.target.value) })} />
            </div>
          </div>
        ))}
        <button className="btn w-full" onClick={() => setItems((cur) => [...cur, emptyItem(categories[0]?.slug)])}><Plus size={14} />Tambah item</button>
      </div>

      <textarea className="input" rows={2} placeholder="Catatan (opsional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex items-center justify-between text-sm"><span className="label">Total</span><b>{money(total)}</b></div>
      <button className="btn btn-dark w-full" disabled={saving || scanning} onClick={save}>{saving ? "Menyimpan…" : "Simpan pengeluaran"}</button>
      <p className="text-[11px] text-mute">Pengeluaran dicatat ke Keuangan. Stok tidak berubah otomatis; gunakan Stok &amp; Opname.</p>
    </div>
  );
}
