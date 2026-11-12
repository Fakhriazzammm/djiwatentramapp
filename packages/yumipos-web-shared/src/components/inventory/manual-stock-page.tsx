import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchManualStock, fetchManualStockHistory, saveManualStock, useManualStockMode, type ManualStockItem, type ManualStockHistory } from "../../lib/manual-stock";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Djiwa3DIcon } from "../ui/djiwa-3d-icon";

const statuses = { available: "Tersedia", out: "Habis", unknown: "Belum dicek" };
const units = ["pcs", "pack", "botol", "kotak"];
const selectClass = "h-11 rounded-md border border-input bg-background px-3 text-sm";
const date = (at: number | null) => at ? new Date(at).toLocaleString("id-ID") : "Belum diperbarui";
const message = (error: unknown) => error instanceof Error ? error.message : "Permintaan gagal. Silakan coba lagi.";

export function ManualStockGate({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
 const { mode, error, loading } = useManualStockMode();
 if (loading) return <p className="p-6" role="status">Memuat pengaturan stok…</p>;
 if (error || !mode) return <div className="p-6" role="alert">{error || "Pengaturan stok belum tersedia."} Muat ulang halaman untuk mencoba lagi.</div>;
 if (mode === "integrated") return <>{children}</>;
 if (disabled) return <section className="m-4 space-y-3 rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Resep dan HPP sementara dinonaktifkan</h1><p className="text-muted-foreground">Mode stok manual aktif. Pengelolaan bahan dilakukan langsung melalui ketersediaan atau jumlah stok.</p><a className="inline-flex min-h-11 items-center text-primary underline" href="/admin/inventory">Buka stok manual</a></section>;
 return <ManualStockPage />;
}

function snapshot(value: unknown) {
 if (!value || typeof value !== "object") return "Belum dicatat";
 const entry = value as { mode?: string; status?: keyof typeof statuses; quantity?: number | null; unit?: string };
 return entry.mode === "count" ? `${entry.quantity ?? "—"} ${entry.unit || ""}` : statuses[entry.status || "unknown"] || "Belum dicek";
}

export function ManualStockPage() {
 const [items, setItems] = useState<ManualStockItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [query, setQuery] = useState("");
 const [filter, setFilter] = useState("");
 const [editing, setEditing] = useState<ManualStockItem | null>(null);
 const [mode, setMode] = useState<"availability" | "count">("availability");
 const [status, setStatus] = useState<keyof typeof statuses>("unknown");
 const [quantity, setQuantity] = useState("");
 const [unit, setUnit] = useState("pcs");
 const [note, setNote] = useState("");
 const [saving, setSaving] = useState(false);
 const [formError, setFormError] = useState<string | null>(null);
 const [success, setSuccess] = useState<string | null>(null);
 const [historyItem, setHistoryItem] = useState<ManualStockItem | null>(null);
 const [history, setHistory] = useState<ManualStockHistory[]>([]);
 const [historyError, setHistoryError] = useState<string | null>(null);
 const [historyLoading, setHistoryLoading] = useState(false);
 const historyRequest = useRef(0);
 const mounted = useRef(true);
 const refresh = useCallback(async () => {
  try { const result = await fetchManualStock(); if (mounted.current) { setItems(result.items); setError(null); } }
  catch (err) { if (mounted.current) setError(message(err)); }
  finally { if (mounted.current) setLoading(false); }
 }, []);
 useEffect(() => { mounted.current = true; void refresh(); const interval = setInterval(() => void refresh(), 30000); return () => { mounted.current = false; clearInterval(interval); }; }, [refresh]);
 const edit = (item: ManualStockItem) => { setEditing(item); setMode(item.mode); setStatus(item.status); setQuantity(item.quantity === null ? "" : String(item.quantity)); setUnit(units.includes(item.unit) ? item.unit : "pcs"); setNote(""); setFormError(null); setSuccess(null); };
 const showHistory = async (item: ManualStockItem) => {
  const request = ++historyRequest.current; setHistoryItem(item); setHistory([]); setHistoryError(null); setHistoryLoading(true);
  try { const result = await fetchManualStockHistory(item.inventoryId); if (request === historyRequest.current) setHistory(result); }
  catch (err) { if (request === historyRequest.current) setHistoryError(message(err)); }
  finally { if (request === historyRequest.current) setHistoryLoading(false); }
 };
 const save = async () => {
  if (!editing || saving) return;
  const count = Number(quantity);
  if (mode === "count" && (!/^\d+$/.test(quantity) || !Number.isSafeInteger(count) || count < 0)) { setFormError("Masukkan jumlah bilangan bulat nol atau lebih."); return; }
  if ((mode === "count" && count === 0 || mode === "availability" && status === "out") && !window.confirm(`Tandai ${editing.name} sebagai habis?`)) return;
  setSaving(true); setFormError(null);
  try { await saveManualStock({ inventoryId: editing.inventoryId, mode, status: mode === "count" ? count === 0 ? "out" : "available" : status, quantity: mode === "count" ? count : null, unit, note: note.trim() || undefined, expectedUpdatedAt: editing.updatedAt }); setEditing(null); setSuccess(`Stok ${editing.name} tersimpan.`); await refresh(); }
  catch (err) { setFormError(message(err)); }
  finally { setSaving(false); }
 };
 const visible = items.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (!filter || item.status === filter));
 return <main className="space-y-5 p-4 md:p-6">
  <header className="flex items-center gap-3"><Djiwa3DIcon name="inventory-stock" size="sm" alt="" /><div><h1 className="text-xl font-semibold">Stok manual</h1><p className="text-sm text-muted-foreground">Catat ketersediaan atau jumlah bahan yang sudah dicek.</p></div></header>
  <p className="text-sm text-muted-foreground">Pembaruan stok dilakukan manual dan tidak menghitung resep, menu, atau HPP. Daftar diperbarui setiap 30 detik.</p>
  {success && <p role="status" className="text-sm">{success}</p>}
  {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3"><p>{error}</p><p className="text-sm">Data yang ditampilkan mungkin belum terbaru.</p><Button variant="outline" onClick={() => void refresh()}>Coba lagi</Button></div>}
  <div className="flex flex-wrap gap-3"><label className="flex-1 min-w-48"><span className="sr-only">Cari bahan</span><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama bahan…" className="h-11" /></label><label><span className="sr-only">Filter status</span><select className={selectClass} value={filter} onChange={event => setFilter(event.target.value)}><option value="">Semua status</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><Button variant="outline" onClick={() => void refresh()}>Perbarui</Button></div>
  {loading ? <p role="status">Memuat stok…</p> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-muted/40"><tr>{["Bahan", "Status", "Sisa", "Satuan", "Diperbarui", "Oleh", "Tindakan"].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{visible.map(item => <tr key={item.inventoryId} className="border-t"><td className="p-3 font-medium">{item.name}</td><td className="p-3">{statuses[item.status]}</td><td className="p-3 tabular-nums">{item.mode === "count" ? item.quantity ?? "—" : "—"}</td><td className="p-3">{item.mode === "count" ? item.unit : "—"}</td><td className="p-3">{date(item.updatedAt)}</td><td className="p-3">{item.updatedBy || "—"}</td><td className="p-2"><div className="flex gap-2"><Button variant="outline" onClick={() => edit(item)}>Ubah</Button><Button variant="ghost" onClick={() => void showHistory(item)}>Riwayat</Button></div></td></tr>)}</tbody></table>{!visible.length && <p className="p-6 text-muted-foreground">{items.length ? "Tidak ada bahan sesuai pencarian." : "Belum ada bahan tersedia."}</p>}</div>}
  <Dialog open={!!editing} onOpenChange={open => { if (!open && !saving) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Ubah stok {editing?.name}</DialogTitle><DialogDescription>Gunakan hasil pemeriksaan bahan terakhir.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={saving} className="space-y-4"><label className="grid gap-2 text-sm">Cara pencatatan<select className={selectClass} value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="availability">Ketersediaan</option><option value="count">Jumlah terhitung</option></select></label>{mode === "availability" ? <label className="grid gap-2 text-sm">Status<select className={selectClass} value={status} onChange={event => setStatus(event.target.value as typeof status)}>{Object.entries(statuses).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label> : <div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm">Jumlah<Input type="number" min="0" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} /></label><label className="grid gap-2 text-sm">Satuan<select className={selectClass} value={unit} onChange={event => setUnit(event.target.value)}>{units.map(value => <option key={value}>{value}</option>)}</select></label></div>}<label className="grid gap-2 text-sm">Catatan (opsional)<Input value={note} maxLength={500} onChange={event => setNote(event.target.value)} /></label></fieldset>{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan stok"}</Button></div></form></DialogContent></Dialog>
  <Dialog open={!!historyItem} onOpenChange={open => { if (!open) { historyRequest.current++; setHistoryItem(null); } }}><DialogContent><DialogHeader><DialogTitle>Riwayat {historyItem?.name}</DialogTitle><DialogDescription>Perubahan manual beserta waktu dan petugas.</DialogDescription></DialogHeader><div className="max-h-[60vh] overflow-y-auto">{historyLoading ? <p role="status">Memuat riwayat…</p> : historyError ? <div role="alert"><p>{historyError}</p><Button variant="outline" onClick={() => historyItem && void showHistory(historyItem)}>Coba lagi</Button></div> : !history.length ? <p>Belum ada perubahan manual.</p> : <ol className="divide-y">{history.map(entry => <li key={entry.id} className="space-y-1 py-3 text-sm"><p className="font-medium">{date(entry.at)} · {entry.actorName || "Petugas"}</p><p>{snapshot(entry.before)} → {snapshot(entry.after)}</p>{entry.note && <p className="text-muted-foreground">{entry.note}</p>}</li>)}</ol>}</div></DialogContent></Dialog>
 </main>;
}
