// Review Konten KOL: antrean konten bereward berdasarkan tenggat H+N, verifikasi view, dan pembayaran ke saldo Djiwa Pay.
import { ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Btn, Card, Chips, EmptyBlock, ErrorBox, Field, KV, Label, Loading, NoAccess, Notice, Page, PageHeader, Panel, SectionLabel, StatusTag, inputCls } from "./kol-ui";
import { dateOnly, dateTime, rupiah, useRewardOverview, type RewardReview } from "./kol-rewards-api";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Permintaan belum berhasil.");
const STATE: Record<RewardReview["state"], [string, string]> = {
  ready: ["Siap dibayar", "#2f6fdf"], due: ["Isi view", "#d92d20"], waiting: ["Menunggu H+N", "#b7791f"], needs_date: ["Tanggal tayang kosong", "#d92d20"], paid: ["Dibayar", "#16a34a"],
};
type Filter = "all" | "due" | "attention" | "paid";

export function KolReviewPage() {
  const { data, error, loading, reload, call, canManage } = useRewardOverview();
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const reviews = data?.reviews ?? [];
  const list = useMemo(() => reviews.filter((r) => filter === "all" ? true : filter === "due" ? r.state === "ready" || r.state === "due" : filter === "paid" ? r.state === "paid" : r.state === "needs_date" || r.state === "due"), [reviews, filter]);
  if (!canManage) return <NoAccess />;
  const current = reviews.find((r) => r.id === open) ?? null;
  const count = (f: Filter) => reviews.filter((r) => f === "due" ? r.state === "ready" || r.state === "due" : f === "paid" ? r.state === "paid" : f === "attention" ? r.state === "needs_date" || r.state === "due" : true).length;
  return (
    <Page>
      <PageHeader title="Review Konten" description="Antrean konten bereward diurutkan berdasarkan tenggat pembayaran. Sistem tidak pernah membayar dari angka yang belum Anda verifikasi." actions={<Btn onClick={() => void reload()}><RefreshCw className="h-3.5 w-3.5" />Muat ulang</Btn>} />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {([["Jatuh tempo", data.dueCount, "#2f6fdf"], ["Menunggu H+N", data.waitingCount, "#b7791f"], ["Perlu perhatian", data.attentionCount, "#d92d20"], ["Estimasi kebutuhan", rupiah(data.estimatedNeed), "#111114"]] as const).map(([label, value, color]) => (
              <Card key={label}><Label>{label}</Label><div className="mt-2 text-[24px] font-semibold tabular-nums" style={{ color }}>{value}</div></Card>
            ))}
          </div>
          {data.alerts.length > 0 && <div className="space-y-2">{data.alerts.slice(0, 5).map((a, i) => <Notice key={i} tone={a.kind === "budget" ? "info" : "err"}><b>{a.title}.</b> {a.body}</Notice>)}</div>}
          <Chips value={filter} onChange={setFilter} options={[{ key: "all", label: "Semua", count: count("all") }, { key: "due", label: "Jatuh tempo", count: count("due") }, { key: "attention", label: "Perlu perhatian", count: count("attention") }, { key: "paid", label: "Sudah dibayar", count: count("paid") }]} />
          {list.length === 0 ? <EmptyBlock title="Tidak ada konten" hint="Konten muncul setelah KOL bereward mengirim link TikTok dari portal." /> : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-left text-[12.5px]">
                <thead><tr className="border-b border-[#e4e4e8] text-[11px] text-[#666672]"><th className="p-3">KOL & konten</th><th className="p-3">Tenggat</th><th className="p-3 text-right">View</th><th className="p-3">Sumber</th><th className="p-3 text-right">Reward</th><th className="p-3">Status</th></tr></thead>
                <tbody>
                  {list.map((r) => {
                    const [label, color] = STATE[r.state];
                    return (
                      <tr key={r.id} className="cursor-pointer border-b border-[#ececf0] hover:bg-[#fafafb]">
                        <td className="p-3"><button type="button" className="text-left" onClick={() => setOpen(r.id)}><b className="block">{r.kolName}</b><span className="text-[11px] text-[#666672]">{r.platform} · {r.campaignTitle}</span></button></td>
                        <td className="p-3 whitespace-nowrap">{r.dueAt ? dateOnly(r.dueAt) : "–"}{r.state === "waiting" && r.daysLeft !== null && <span className="block text-[11px] text-[#666672]">{r.daysLeft} hari lagi</span>}</td>
                        <td className="p-3 text-right tabular-nums">{r.views === null ? "–" : r.views.toLocaleString("id-ID")}</td>
                        <td className="p-3">{r.viewsSource === "screenshot" ? "Tangkapan layar" : r.viewsSource === "manual" ? "Input admin" : "–"}</td>
                        <td className="p-3 text-right font-semibold tabular-nums">{r.payout ? rupiah(r.payout.amount) : r.estimate === null ? "–" : rupiah(r.estimate)}{r.capped && <span className="block text-[11px] font-normal text-[#b7791f]">kena batas</span>}</td>
                        <td className="p-3"><StatusTag color={color}>{label}</StatusTag></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
      {current && <ReviewPanel review={current} call={call} onClose={() => setOpen(null)} onChanged={reload} />}
    </Page>
  );
}

function ReviewPanel({ review: r, call, onClose, onChanged }: { review: RewardReview; call: <T>(path: string, method?: string, body?: unknown) => Promise<T>; onClose: () => void; onChanged: () => Promise<void> }) {
  const [views, setViews] = useState(r.views === null ? "" : String(r.views));
  const [source, setSource] = useState<"manual" | "screenshot">(r.viewsSource === "screenshot" ? "screenshot" : "manual");
  const [evidence, setEvidence] = useState(r.viewsEvidence || r.screenshotUrl || "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [checks, setChecks] = useState({ public: false, tag: false, unique: Boolean(r.videoId), notDeleted: false });
  const [busy, setBusy] = useState(false);
  const n = Number(views);
  const calc = views !== "" && Number.isSafeInteger(n) && n >= 0 ? { computed: n < r.rules.minViews ? 0 : Math.floor((n * r.rules.ratePer1000) / 1000) } : null;
  const cap = Math.min(r.rules.maxPerKol ?? Number.MAX_SAFE_INTEGER, r.rules.maxPerContent ?? Number.MAX_SAFE_INTEGER);
  const amount = calc ? Math.min(calc.computed, cap) : 0;
  const allChecked = checks.public && checks.tag && checks.unique && checks.notDeleted;
  const body = { views: n, source, evidence, note };
  const run = async (action: () => Promise<unknown>, ok: string, close = false) => {
    setBusy(true);
    try { await action(); toast.success(ok); await onChanged(); if (close) onClose(); } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  };
  const due = r.state === "ready" || r.state === "due";
  const reject = () => { const reason = window.prompt("Alasan menolak konten (dilihat KOL):"); if (!reason?.trim()) return; void run(() => call(`/reviews/${r.id}/reject`, "POST", { note: reason }), "Konten ditolak. KOL bisa mengirim link baru.", true); };
  return (
    <Panel title={`${r.kolName} · ${r.platform}`} description={`${r.campaignTitle} · tayang ${dateOnly(r.postedAt)} · tenggat ${dateOnly(r.dueAt)}`} onClose={onClose} width="sm:max-w-2xl"
      footer={r.payout ? <Btn onClick={onClose}>Tutup</Btn> : <>
        <Btn variant="danger" disabled={busy} onClick={reject}>Tolak konten (Rp0)</Btn>
        <Btn disabled={busy || !calc} onClick={() => void run(() => call(`/reviews/${r.id}/views`, "POST", body), "View tersimpan sebagai estimasi KOL.")}>Simpan view saja</Btn>
        <Btn variant="success" disabled={busy || !calc || !due || !allChecked} onClick={() => { if (window.confirm(`Setujui dan bayar ${rupiah(amount)} ke saldo Djiwa Pay ${r.kolName}?`)) void run(() => call(`/reviews/${r.id}/settle`, "POST", body), `Reward ${rupiah(amount)} dibayar.`, true); }}>Setujui & bayar {calc ? rupiah(amount) : ""}</Btn></>}>
      <div className="space-y-4">
        <a className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2f6fdf]" href={r.contentUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Buka konten</a>
        {r.payout ? (
          <Notice tone="ok">Dibayar {dateTime(r.payout.paidAt)}: {r.payout.views.toLocaleString("id-ID")} view × Rp{(r.payout.rate / 1000).toLocaleString("id-ID")} = <b>{rupiah(r.payout.amount)}</b>{r.payout.released > 0 && <>. Sisa cadangan {rupiah(r.payout.released)} dilepas.</>}</Notice>
        ) : (
          <>
            {r.state === "needs_date" && (
              <Card className="space-y-2"><b className="text-[13px]">Tanggal tayang belum terbaca (link pendek)</b>
                <div className="flex gap-2"><input type="date" aria-label="Tanggal tayang" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /><Btn disabled={!date || busy} onClick={() => void run(() => call(`/reviews/${r.id}/posted-at`, "POST", { date }), "Tanggal tayang tersimpan.")}>Simpan</Btn></div></Card>
            )}
            {r.state === "waiting" && <Notice>Belum jatuh tempo ({r.daysLeft} hari lagi). Anda bisa mencatat view sementara, tetapi pembayaran baru bisa pada {dateOnly(r.dueAt)}.</Notice>}
            <SectionLabel>Verifikasi view</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sumber"><select className={inputCls} value={source} onChange={(e) => setSource(e.target.value as "manual" | "screenshot")}><option value="screenshot">Tangkapan layar analitik KOL</option><option value="manual">Input admin (lihat langsung)</option></select></Field>
              <Field label="View terverifikasi"><input className={`${inputCls} text-lg font-semibold`} inputMode="numeric" value={views} onChange={(e) => setViews(e.target.value.replace(/\D/g, ""))} /></Field>
            </div>
            <Field label="Link bukti (tangkapan layar)" hint={r.screenshotUrl ? "KOL mengirim screenshot insight, sudah terisi." : "Wajib bila angka dari tangkapan layar."}><input className={inputCls} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="https://…" /></Field>
            {r.screenshotUrl && <a className="inline-flex items-center gap-1 text-[12px] text-[#2f6fdf]" href={r.screenshotUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Buka screenshot dari KOL</a>}
            <Field label="Catatan (wajib bila angka diubah dari estimasi)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <SectionLabel>Pemeriksaan konten</SectionLabel>
            <div className="space-y-1.5 text-[12.5px]">
              {([["public", "Video publik dan masih tayang"], ["tag", "Tag @djiwatentram dan #VisitDjiwaTentram ada"], ["unique", `ID video unik di seluruh kampanye${r.videoId ? " (otomatis)" : ""}`], ["notDeleted", "Tayang setelah kampanye dimulai dan tidak dihapus"]] as const).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={checks[key]} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />{label}</label>
              ))}
            </div>
            <SectionLabel>Hitungan pembayaran</SectionLabel>
            <div className="space-y-1.5 border border-[#e4e4e8] bg-[#fafafb] p-3 text-[12.5px]">
              <KV label="View">{calc ? n.toLocaleString("id-ID") : "–"}</KV>
              <KV label="Tarif">Rp{(r.rules.ratePer1000 / 1000).toLocaleString("id-ID")} per view{r.rules.minViews ? ` · minimal ${r.rules.minViews.toLocaleString("id-ID")} view` : ""}</KV>
              <KV label="Hasil hitung">{calc ? rupiah(calc.computed) : "–"}</KV>
              <KV label="Batas">{cap === Number.MAX_SAFE_INTEGER ? "Tanpa batas" : rupiah(cap)}</KV>
              <KV label="Dibayarkan"><b className="text-[16px] text-[#16a34a]">{calc ? rupiah(amount) : "–"}</b></KV>
              {calc && <p className="pt-1 text-[11px] text-[#666672]">Dari cadangan {rupiah(r.reserved)}: {rupiah(amount)} dibayar, {rupiah(Math.max(0, r.reserved - amount))} dilepas kembali ke anggaran tersedia. Masuk ke saldo Djiwa Pay {r.kolName}.</p>}
            </div>
            {!due && <Notice>Tombol bayar aktif setelah jatuh tempo dan semua pemeriksaan dicentang.</Notice>}
          </>
        )}
      </div>
    </Panel>
  );
}
