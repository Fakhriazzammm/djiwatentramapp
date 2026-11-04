import { createLazyFileRoute } from "@tanstack/react-router";
import { HeartHandshake, ImagePlus, Loader2, Pin, RefreshCw, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { invokeDirectFetch } from "@/lib/api-helper";
import { requestAdminConfirm } from "@/lib/admin-dialogs";

export const Route = createLazyFileRoute("/admin/jumat-berkah")({ component: AdminJumatBerkah });

type Row = Record<string, any>;
type Tab = "ringkasan" | "donasi" | "doa" | "distribusi" | "pengaturan";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "ringkasan", label: "Ringkasan" }, { id: "donasi", label: "Donasi" }, { id: "doa", label: "Doa" },
  { id: "distribusi", label: "Distribusi & Galeri" }, { id: "pengaturan", label: "Pengaturan" },
];
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const ADMIN_SECRET = String(import.meta.env.VITE_ADMIN_SECRET ?? "").trim();
const rupiah = (n: unknown) => `Rp${Math.round(Number(n) || 0).toLocaleString("id-ID")}`;
const dateTime = (v: unknown) => (v ? new Date(String(v)).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const photoUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${SUPABASE_URL}/storage/v1/object/public/jumat-berkah/${path}`);

async function call<T = Row>(action: string, payload: Row = {}): Promise<T> {
  if (!ADMIN_SECRET) throw new Error("VITE_ADMIN_SECRET belum dikonfigurasi");
  const body = await invokeDirectFetch<{ result?: T }>(`${SUPABASE_URL}/functions/v1/jumat-berkah`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
    body: JSON.stringify({ action, ...payload }),
  });
  return (body.result ?? ({} as T)) as T;
}

/** Perkecil foto di browser (maks 1600px, JPEG) sebelum diunggah. */
async function compressImage(file: File): Promise<{ dataBase64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("Foto tidak dapat diproses");
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return { dataBase64: btoa(binary), contentType: "image/jpeg" };
}

function statusBadge(status: string) {
  const map: Record<string, "success" | "warning" | "destructive" | "secondary" | "info"> = { paid: "success", pending: "warning", expired: "secondary", cancelled: "secondary", refunded: "destructive", approved: "success", hidden: "destructive", open: "info", closed: "warning", distributed: "success" };
  return <Badge variant={map[status] ?? "secondary"}>{status}</Badge>;
}

function AdminJumatBerkah() {
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [summary, setSummary] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try { setSummary(await call("admin-summary")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Gagal memuat"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><HeartHandshake className="h-6 w-6 text-emerald-700" /><h1 className="text-xl font-black">Jumat Berkah</h1>{summary ? statusBadge(summary.settings?.enabled ? "open" : "closed") : null}</div>
        <Button variant="outline" size="sm" onClick={() => void loadSummary()}><RefreshCw className="h-4 w-4" /> Muat ulang</Button>
      </header>
      {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}
      <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="Bagian Jumat Berkah">
        {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-10 rounded-full px-4 text-sm font-bold ${tab === item.id ? "bg-emerald-700 text-white" : "bg-muted text-muted-foreground"}`}>{item.label}{item.id === "doa" && summary?.pendingPrayers ? ` (${summary.pendingPrayers})` : ""}</button>)}
      </nav>
      {loading && !summary ? <Skeleton className="h-40 w-full" /> : null}
      {summary && tab === "ringkasan" ? <SummaryTab summary={summary} onChanged={loadSummary} /> : null}
      {summary && tab === "donasi" ? <DonationsTab campaignId={String(summary.campaign?.campaign_id ?? "")} /> : null}
      {tab === "doa" ? <PrayersTab onChanged={loadSummary} /> : null}
      {summary && tab === "distribusi" ? <DistributionTab summary={summary} onChanged={loadSummary} /> : null}
      {summary && tab === "pengaturan" ? <SettingsTab summary={summary} onChanged={loadSummary} /> : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{value}</p>{hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}</div>;
}

function SummaryTab({ summary, onChanged }: { summary: Row; onChanged: () => Promise<void> }) {
  const c = summary.campaign ?? {};
  const t = summary.totals ?? {};
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Kampanye aktif: <b>{c.distribution_date}</b> · tutup {dateTime(c.closes_at)} {statusBadge(String(c.status ?? "open"))}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Porsi terbayar" value={`${t.paidPortions ?? 0}/${c.target_portions ?? 0}`} hint="Dapur masak sebanyak ini" />
        <Stat label="Dana terkumpul" value={rupiah(t.paidAmount)} hint={`${rupiah(c.price_per_portion)} per porsi`} />
        <Stat label="Donasi terbayar" value={String(t.donors ?? 0)} />
        <Stat label="Doa menunggu" value={String(summary.pendingPrayers ?? 0)} hint="Perlu ditinjau" />
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="font-bold">Notifikasi Telegram</p>
        <p className="text-sm text-muted-foreground">Menunggu kirim: {summary.outbox?.waiting ?? 0} · gagal: {summary.outbox?.failed ?? 0}. Grup Transaksi menerima setiap sedekah; grup Kitchen menerima rekap masak.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => call("admin-test-telegram"), "Pesan tes terkirim ke grup")}><Send className="h-4 w-4" /> Kirim tes</Button>
          <Button size="sm" variant="outline" disabled={busy || !(summary.outbox?.failed > 0)} onClick={() => void run(() => call("admin-retry-outbox"), "Kirim ulang diproses")}>Kirim ulang yang gagal</Button>
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2 font-bold">Riwayat kampanye</p>
        <ul className="divide-y text-sm">{(summary.history ?? []).map((h: Row) => <li key={h.campaign_id} className="flex items-center justify-between py-2"><span>{h.distribution_date}</span><span>{h.target_portions} porsi {statusBadge(h.status)}</span></li>)}</ul>
      </div>
    </div>
  );
}

function DonationsTab({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scope, setScope] = useState<"campaign" | "all">("campaign");
  useEffect(() => { setRows(null); void call<{ donations: Row[] }>("admin-donations", scope === "campaign" ? { campaignId } : {}).then((r) => setRows(r.donations ?? [])).catch((e) => { toast.error(e.message); setRows([]); }); }, [campaignId, scope]);
  const exportCsv = () => {
    const head = ["Waktu", "Donatur", "Tampil sebagai", "Porsi", "Nominal", "Status", "Doa"];
    const lines = (rows ?? []).map((r) => [r.created_at, r.donor_name, r.display_name, r.portions, r.amount, r.status, (r.prayer_text ?? "").replaceAll('"', '""')].map((v) => `"${v ?? ""}"`).join(","));
    const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "jumat-berkah-donasi.csv"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={scope === "campaign" ? "default" : "outline"} onClick={() => setScope("campaign")}>Kampanye ini</Button>
        <Button size="sm" variant={scope === "all" ? "default" : "outline"} onClick={() => setScope("all")}>Semua</Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows?.length}>Ekspor CSV</Button>
      </div>
      {rows === null ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada donasi.</p> : (
        <div className="overflow-x-auto rounded-2xl border"><table className="w-full text-left text-sm"><thead className="bg-muted text-xs"><tr><th className="p-2">Waktu</th><th className="p-2">Donatur</th><th className="p-2">Tampil</th><th className="p-2 text-right">Porsi</th><th className="p-2 text-right">Nominal</th><th className="p-2">Status</th><th className="p-2">Doa</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.donation_id} className="border-t"><td className="p-2 whitespace-nowrap">{dateTime(r.created_at)}</td><td className="p-2">{r.donor_name}</td><td className="p-2">{r.display_name}</td><td className="p-2 text-right">{r.portions}</td><td className="p-2 text-right">{rupiah(r.amount)}</td><td className="p-2">{statusBadge(r.status)}</td><td className="p-2 max-w-[240px] break-words">{r.prayer_text ?? "—"}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

function PrayersTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"" | "pending" | "approved" | "hidden">("pending");
  const [seed, setSeed] = useState("");
  const load = useCallback(async () => { try { setRows((await call<{ prayers: Row[] }>("admin-prayers", filter ? { status: filter } : {})).prayers ?? []); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); setRows([]); } }, [filter]);
  useEffect(() => { setRows(null); void load(); }, [load]);
  const update = async (prayerId: string, patch: Row) => { try { await call("admin-prayer-update", { prayerId, ...patch }); await load(); await onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); } };
  const addSeed = async () => { try { await call("admin-seed-prayer", { body: seed }); setSeed(""); toast.success("Doa pembuka ditambahkan"); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{(["pending", "approved", "hidden", ""] as const).map((f) => <Button key={f || "all"} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "" ? "Semua" : f === "pending" ? "Menunggu" : f === "approved" ? "Tayang" : "Disembunyikan"}</Button>)}</div>
      <div className="flex gap-2"><Input value={seed} onChange={(e) => setSeed(e.target.value.slice(0, 140))} placeholder="Tambah doa pembuka (maks 140 karakter)" /><Button onClick={() => void addSeed()} disabled={!seed.trim()}>Tambah</Button></div>
      {rows === null ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada doa.</p> : (
        <ul className="space-y-2">{rows.map((p) => (
          <li key={p.prayer_id} className="rounded-2xl border bg-card p-3">
            <p className="break-words text-sm">“{p.body}”</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{p.display_name}{p.portions ? ` · ${p.portions} porsi` : ""} · {dateTime(p.created_at)}</span>{statusBadge(p.status)}{p.is_seed ? <Badge variant="outline">pembuka</Badge> : null}{p.is_pinned ? <Badge variant="info">disematkan</Badge> : null}<span>Aamiin {p.amin_count}</span></div>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.status !== "approved" ? <Button size="xs" onClick={() => void update(p.prayer_id, { status: "approved" })}>Tayangkan</Button> : null}
              {p.status !== "hidden" ? <Button size="xs" variant="outline" onClick={() => void update(p.prayer_id, { status: "hidden" })}>Sembunyikan</Button> : null}
              <Button size="xs" variant="outline" onClick={() => void update(p.prayer_id, { isPinned: !p.is_pinned })}><Pin className="h-3 w-3" /> {p.is_pinned ? "Lepas sematan" : "Sematkan"}</Button>
            </div>
          </li>))}</ul>
      )}
    </div>
  );
}

function DistributionTab({ summary, onChanged }: { summary: Row; onChanged: () => Promise<void> }) {
  const campaigns: Row[] = useMemo(() => (summary.history ?? []).filter((h: Row) => h.status !== "open" || Number(summary.totals?.paidPortions) > 0), [summary]);
  const [campaignId, setCampaignId] = useState(String(campaigns[0]?.campaign_id ?? summary.campaign?.campaign_id ?? ""));
  const [given, setGiven] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<Row[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(async () => { try { setPhotos((await call<{ photos: Row[] }>("admin-gallery")).photos ?? []); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); setPhotos([]); } }, []);
  useEffect(() => { void loadPhotos(); }, [loadPhotos]);

  const save = async () => {
    const portionsGiven = Number(given);
    if (!campaignId || !Number.isInteger(portionsGiven) || portionsGiven < 0) { toast.error("Isi jumlah porsi yang dibagikan"); return; }
    if (!(await requestAdminConfirm({ title: "Simpan laporan distribusi?", message: "Donatur akan menerima notifikasi laporan dan grup Telegram diberi tahu." }))) return;
    setSaving(true);
    try { const r = await call("admin-record-distribution", { campaignId, portionsGiven, location, notes }); toast.success(`Laporan disimpan, ${r.donorsNotified ?? 0} donatur diberi tahu`); await onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); } finally { setSaving(false); }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const { dataBase64, contentType } = await compressImage(file);
        await call("admin-gallery-upload", { dataBase64, contentType, caption, campaignId });
      }
      setCaption(""); toast.success("Foto diunggah"); await loadPhotos();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Unggah gagal"); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const removePhoto = async (photoId: string) => {
    if (!(await requestAdminConfirm({ title: "Hapus foto ini?", message: "Foto hilang dari galeri dan Komunitas." }))) return;
    try { await call("admin-gallery-update", { photoId, delete: true }); await loadPhotos(); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); }
  };
  const togglePhoto = async (p: Row) => { try { await call("admin-gallery-update", { photoId: p.photo_id, isPublished: !p.is_published }); await loadPhotos(); } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); } };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-bold">Laporan distribusi</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Kampanye<select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-background px-3">{(summary.history ?? []).map((h: Row) => <option key={h.campaign_id} value={h.campaign_id}>{h.distribution_date} · {h.status}</option>)}</select></label>
          <label className="text-sm">Porsi dibagikan<Input inputMode="numeric" value={given} onChange={(e) => setGiven(e.target.value.replace(/\D/g, ""))} placeholder="mis. 80" /></label>
          <label className="text-sm md:col-span-2">Lokasi<Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="mis. Alun-alun, terminal, pasar" /></label>
          <label className="text-sm md:col-span-2">Catatan untuk donatur<Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
        </div>
        <Button className="mt-3" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Simpan &amp; kabari donatur</Button>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-bold">Galeri foto</h2>
        <p className="text-xs text-muted-foreground">Tampil di halaman Jumat Berkah dan tab Komunitas customer. Foto otomatis diperkecil.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 160))} placeholder="Keterangan (opsional)" className="max-w-xs" />
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="jb-photo" onChange={(e) => void upload(e.target.files)} />
          <Button variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Unggah foto</Button>
        </div>
        {photos === null ? <Skeleton className="mt-3 h-32 w-full" /> : photos.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Belum ada foto.</p> : (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{photos.map((p) => (
            <figure key={p.photo_id} className="overflow-hidden rounded-xl border"><img src={photoUrl(p.image_url)} alt={p.caption ?? "Foto Jumat Berkah"} className={`aspect-square w-full object-cover ${p.is_published ? "" : "opacity-40"}`} loading="lazy" />
              <figcaption className="flex items-center justify-between gap-1 p-2 text-[11px]"><span className="truncate">{p.caption ?? dateTime(p.created_at)}</span><span className="flex gap-1"><button type="button" onClick={() => void togglePhoto(p)} className="rounded px-1 font-bold text-emerald-700">{p.is_published ? "Sembunyikan" : "Tampilkan"}</button><button type="button" aria-label="Hapus foto" onClick={() => void removePhoto(p.photo_id)} className="text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></span></figcaption></figure>))}</div>
        )}
      </section>
    </div>
  );
}

function SettingsTab({ summary, onChanged }: { summary: Row; onChanged: () => Promise<void> }) {
  const s = summary.settings ?? {};
  const [form, setForm] = useState({ enabled: Boolean(s.enabled), pricePerPortion: String(s.price_per_portion ?? 15000), telegramTransactionChatId: String(s.telegram_transaction_chat_id ?? ""), telegramKitchenChatId: String(s.telegram_kitchen_chat_id ?? ""), targetPortions: String(s.target_portions ?? 100), maxPortionsPerDonation: String(s.max_portions_per_donation ?? 100), reservationMinutes: String(s.reservation_minutes ?? 30) });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await call("admin-settings", { enabled: form.enabled, pricePerPortion: Number(form.pricePerPortion), telegramTransactionChatId: form.telegramTransactionChatId, telegramKitchenChatId: form.telegramKitchenChatId, targetPortions: Number(form.targetPortions), maxPortionsPerDonation: Number(form.maxPortionsPerDonation), reservationMinutes: Number(form.reservationMinutes) });
      toast.success("Pengaturan disimpan"); await onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal"); } finally { setSaving(false); }
  };
  const field = (key: "pricePerPortion" | "targetPortions" | "maxPortionsPerDonation" | "reservationMinutes", label: string, hint?: string) => (
    <label className="text-sm">{label}<Input inputMode="numeric" value={form[key] as string} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/\D/g, "") }))} />{hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}</label>
  );
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-5 w-5" /> Program aktif (tampil di aplikasi customer)</label>
      <div className="grid gap-3 md:grid-cols-2">
        {field("pricePerPortion", "Harga per porsi (Rp)", "Happy Hour Rp15.000. Biaya Mayar ditanggung Djiwa Tentram.")}
        {field("targetPortions", "Kuota porsi per Jumat")}
        {field("maxPortionsPerDonation", "Maksimal porsi per sedekah")}
        {field("reservationMinutes", "Tahan kuota (menit)", "Kuota tertahan selama pembayaran berlangsung.")}
        <label className="text-sm">Chat ID grup Transaksi<Input value={form.telegramTransactionChatId} onChange={(e) => setForm((f) => ({ ...f, telegramTransactionChatId: e.target.value.trim() }))} placeholder="-100…" /></label>
        <label className="text-sm">Chat ID grup Kitchen<Input value={form.telegramKitchenChatId} onChange={(e) => setForm((f) => ({ ...f, telegramKitchenChatId: e.target.value.trim() }))} placeholder="-100…" /></label>
      </div>
      <p className="text-xs text-muted-foreground">Pendapatan masuk kategori “Penjualan Jumat Berkah”, terpisah dari penjualan kasir dan antrean dapur biasa. Tanpa HPP dan stok. Perubahan harga berlaku pada kampanye yang belum menerima donasi.</p>
      <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Simpan</Button>
    </div>
  );
}
