// Reward & Anggaran KOL: aturan reward per kampanye, anggaran Bisnis (deposit, cadangan, pembayaran), dan ledger.
import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Btn, Card, EmptyBlock, ErrorBox, Field, KV, Label, Loading, NoAccess, Notice, Page, PageHeader, Panel, SectionLabel, StatusTag, inputCls } from "./kol-ui";
import { rupiah, dateTime, useRewardOverview, type CampaignDetail, type Deposit, type RewardCampaign, type Business } from "./kol-rewards-api";

const msg = (e: unknown) => (e instanceof Error ? e.message : "Permintaan belum berhasil.");
const KIND: Record<string, [string, string]> = { deposit: ["Deposit", "#2f6fdf"], reserve: ["Reserve", "#b7791f"], release: ["Release", "#666672"], payout: ["Payout", "#16a34a"], refund: ["Refund", "#7c3aed"] };
const DEPOSIT_STATUS: Record<string, [string, string]> = { pending: ["Menunggu bayar", "#b7791f"], paid: ["Masuk", "#16a34a"], cancelled: ["Batal", "#666672"], expired: ["Kedaluwarsa", "#d92d20"] };

export function KolRewardsPage() {
  const { data, error, loading, reload, call, canManage } = useRewardOverview();
  const [selected, setSelected] = useState<number | null>(null);
  const campaigns = data?.campaigns ?? [];
  useEffect(() => { if (selected === null && campaigns.length) setSelected((campaigns.find((c) => c.rewardsEnabled) ?? campaigns[0]).id); }, [campaigns, selected]);
  if (!canManage) return <NoAccess />;
  const totals = data?.totals;
  const current = campaigns.find((c) => c.id === selected) ?? null;
  return (
    <Page>
      <PageHeader title="Reward & Anggaran" description="Pantau anggaran kampanye dan reward yang masuk ke Djiwa Pay."
        actions={<Btn onClick={() => void reload()}><RefreshCw className="h-3.5 w-3.5" />Muat ulang</Btn>} />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading && !data ? <Loading /> : data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {([["Total diisi", totals!.funded, "#111114"], ["Terbayar ke KOL", totals!.paid, "#16a34a"], ["Dicadangkan", totals!.reserved, "#b7791f"], ["Tersedia", totals!.available, "#2f6fdf"]] as const).map(([label, value, color]) => (
              <Card key={label}><Label>{label}</Label><div className="mt-2 text-[24px] font-semibold tabular-nums" style={{ color }}>{rupiah(value)}</div></Card>
            ))}
          </div>
          {campaigns.length === 0 ? <EmptyBlock title="Belum ada kampanye" hint="Buat kampanye di menu Kampanye KOL, lalu aktifkan reward di sini." /> : (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <nav aria-label="Pilih kampanye" className="space-y-2">
                {campaigns.map((c) => (
                  <button key={c.id} type="button" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}
                    className={`block w-full border p-3 text-left transition ${c.id === selected ? "border-[#111114] bg-white" : "border-[#e4e4e8] bg-[#fafafb] hover:bg-white"}`}>
                    <span className="block text-[13px] font-semibold text-[#111114]">{c.title}</span>
                    <span className="mt-1 flex items-center justify-between text-[11px] text-[#666672]"><span>{c.rewardsEnabled ? `Tersedia ${rupiah(c.available)}` : "Reward nonaktif"}</span>{c.rewardsEnabled && <span>{c.slotsLeft ?? 0}/{c.slotsTotal ?? 0} slot</span>}</span>
                  </button>
                ))}
              </nav>
              {current && <CampaignPanel key={current.id} campaign={current} businesses={data.businesses ?? []} feePercent={data.feePercent ?? 0.7} call={call} onChanged={reload} />}
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function CampaignPanel({ campaign, businesses, feePercent, call, onChanged }: { campaign: RewardCampaign; businesses: Business[]; feePercent: number; call: <T>(path: string, method?: string, body?: unknown) => Promise<T>; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState<"rules" | "ledger">("rules");
  const [depositOpen, setDepositOpen] = useState(false);
  const loadDetail = useCallback(async () => { try { setDetail(await call<CampaignDetail>(`/campaigns/${campaign.id}`)); } catch (e) { toast.error(msg(e)); } }, [call, campaign.id]);
  useEffect(() => { void loadDetail(); }, [loadDetail, campaign.available, campaign.paid]);
  const refresh = async () => { await Promise.all([onChanged(), loadDetail()]); };
  const business = businesses.find((b) => b.id === campaign.businessId) ?? businesses[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><Label>KAMPANYE</Label><h2 className="text-[18px] font-semibold text-[#111114]">{campaign.title}</h2></div>
        <div className="flex gap-1.5">{(["rules", "ledger"] as const).map((t) => <Btn key={t} size="sm" variant={tab === t ? "primary" : "outline"} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "rules" ? "Reward & Anggaran" : "Ledger"}</Btn>)}</div>
      </div>
      {tab === "rules" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <RulesCard campaign={campaign} call={call} onSaved={refresh} />
          <div className="space-y-4">
            <BudgetCard campaign={campaign} detail={detail} onDeposit={() => setDepositOpen(true)} call={call} onChanged={refresh} />
            <BusinessCard business={business} call={call} onChanged={refresh} />
          </div>
        </div>
      ) : <LedgerView detail={detail} />}
      {depositOpen && <DepositPanel campaign={campaign} business={business} feePercent={feePercent} call={call} onClose={() => setDepositOpen(false)} onDone={refresh} />}
    </div>
  );
}

function RulesCard({ campaign, call, onSaved }: { campaign: RewardCampaign; call: <T>(path: string, method?: string, body?: unknown) => Promise<T>; onSaved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(campaign.rewardsEnabled);
  const [rate, setRate] = useState(String(campaign.ratePer1000 ?? 15000));
  const [minViews, setMinViews] = useState(String(campaign.minViews ?? 0));
  const [perContent, setPerContent] = useState(campaign.maxPerContent ? String(campaign.maxPerContent) : "");
  const [perKol, setPerKol] = useState(campaign.maxPerKol ? String(campaign.maxPerKol) : "");
  const [days, setDays] = useState(String(campaign.settleDays ?? 7));
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => {
    const r = Number(rate), cap = Number(perKol) || Number.MAX_SAFE_INTEGER;
    return r > 0 ? { sample: Math.min(Math.floor((3100 * r) / 1000), cap), capViews: Number(perKol) ? Math.floor((Number(perKol) * 1000) / r) : null } : null;
  }, [rate, perKol]);
  const save = async () => {
    setBusy(true);
    try {
      await call(`/campaigns/${campaign.id}/rules`, "POST", { rewardsEnabled: enabled, ratePer1000: Number(rate), minViews: Number(minViews) || 0, maxPerContent: perContent ? Number(perContent) : null, maxPerKol: perKol ? Number(perKol) : null, settleDays: Number(days) || 7, platforms: campaign.platforms?.length ? campaign.platforms : ["TikTok"] });
      toast.success("Aturan reward tersimpan."); await onSaved();
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  };
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-[15px] font-semibold">Aturan reward</h3><StatusTag color="#2f6fdf">Berlaku untuk pendaftar baru</StatusTag></div>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Aktifkan reward untuk kampanye ini</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tarif per 1.000 view (Rp)" hint={`Setara Rp${(Number(rate) / 1000 || 0).toLocaleString("id-ID")} per view, tiap view dihitung`}><input className={inputCls} inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Minimal view agar dibayar"><input className={inputCls} inputMode="numeric" value={minViews} onChange={(e) => setMinViews(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Maksimal reward per konten (Rp)" hint="Kosong = tanpa batas konten"><input className={inputCls} inputMode="numeric" value={perContent} onChange={(e) => setPerContent(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Maksimal reward per KOL (Rp)" hint="Dicadangkan dari anggaran saat KOL disetujui"><input className={inputCls} inputMode="numeric" value={perKol} onChange={(e) => setPerKol(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Dibayar setelah video tayang (hari)"><input className={inputCls} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} /></Field>
        <Field label="Platform dihitung"><input className={inputCls} value={(campaign.platforms?.length ? campaign.platforms : ["TikTok"]).join(", ")} disabled /></Field>
      </div>
      {preview && <Notice>Contoh: 3.100 view × Rp{(Number(rate) / 1000).toLocaleString("id-ID")} = <b>{rupiah(preview.sample)}</b>.{preview.capViews !== null && <> Di atas {preview.capViews.toLocaleString("id-ID")} view, reward berhenti di batas {rupiah(Number(perKol))}.</>}</Notice>}
      <Notice>Perubahan tarif tidak mengubah KOL yang sudah mendaftar: aturan mereka dicatat saat mendaftar.</Notice>
      <div className="flex justify-end"><Btn variant="primary" disabled={busy || (enabled && (!Number(rate) || !Number(perKol)))} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan aturan"}</Btn></div>
    </Card>
  );
}

function BudgetCard({ campaign, detail, onDeposit, call, onChanged }: { campaign: RewardCampaign; detail: CampaignDetail | null; onDeposit: () => void; call: <T>(path: string, method?: string, body?: unknown) => Promise<T>; onChanged: () => Promise<void> }) {
  const share = (n: number) => (campaign.funded ? Math.max(0, Math.min(100, (n / campaign.funded) * 100)) : 0);
  const pending = detail?.deposits.filter((d) => d.status === "pending") ?? [];
  const check = async (d: Deposit) => { try { const r = await call<Deposit>(`/deposits/${d.id}/check`, "POST"); toast[r.status === "paid" ? "success" : "info"](r.status === "paid" ? "Pembayaran diterima, anggaran bertambah." : "Pembayaran belum diterima."); await onChanged(); } catch (e) { toast.error(msg(e)); } };
  const refund = async () => { if (!window.confirm(`Kembalikan sisa ${rupiah(campaign.available)} ke saldo Djiwa Pay Bisnis?`)) return; try { await call(`/campaigns/${campaign.id}/refund`, "POST"); toast.success("Sisa anggaran dikembalikan."); await onChanged(); } catch (e) { toast.error(msg(e)); } };
  return (
    <Card className="space-y-3">
      <Label>ANGGARAN TERSEDIA</Label>
      <div className="text-[30px] font-semibold tabular-nums text-[#2f6fdf]">{rupiah(campaign.available)}</div>
      <div className="flex h-2.5 overflow-hidden bg-[#ececf0]" role="img" aria-label="Komposisi anggaran"><div style={{ width: `${share(campaign.paid)}%`, background: "#16a34a" }} /><div style={{ width: `${share(campaign.reserved)}%`, background: "#b7791f" }} /></div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><span className="text-[#666672]">Total diisi</span><b className="block text-[13px]">{rupiah(campaign.funded)}</b></div>
        <div><span className="text-[#666672]">Dicadangkan</span><b className="block text-[13px]">{rupiah(campaign.reserved)}</b></div>
        <div><span className="text-[#666672]">Terbayar</span><b className="block text-[13px]">{rupiah(campaign.paid)}</b></div>
      </div>
      <KV label="Slot tersisa"><b>{campaign.slotsLeft ?? 0} dari {campaign.slotsTotal ?? 0}</b></KV>
      <p className="text-[11px] leading-4 text-[#666672]">Slot = anggaran tersedia ÷ maksimal per KOL. Saat slot habis, pendaftaran otomatis ditutup.</p>
      <Btn variant="primary" className="w-full" disabled={!campaign.rewardsEnabled} onClick={onDeposit}>+ Isi anggaran</Btn>
      {!campaign.rewardsEnabled && <p className="text-[11px] text-[#9b1c12]">Aktifkan dan simpan aturan reward dulu.</p>}
      {pending.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-2 border border-[#f1dfb0] bg-[#fffaf0] p-2 text-[11.5px]">
          <span>QRIS {rupiah(d.total)} menunggu bayar</span>
          <span className="flex gap-1">{d.invoice_url && <a className="inline-flex min-h-8 items-center gap-1 px-1 text-[#2f6fdf]" href={d.invoice_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Buka</a>}<Btn size="sm" onClick={() => void check(d)}>Cek</Btn></span>
        </div>
      ))}
      {["closed", "archived"].includes(campaign.status) && campaign.available > 0 && campaign.reserved === 0 && <Btn className="w-full" onClick={() => void refund()}>Kembalikan sisa {rupiah(campaign.available)}</Btn>}
    </Card>
  );
}

function BusinessCard({ business, call, onChanged }: { business?: Business; call: <T>(path: string, method?: string, body?: unknown) => Promise<T>; onChanged: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  if (!business) return null;
  const link = async () => { setBusy(true); try { await call(`/businesses/${business.id}/owner`, "POST", { email }); toast.success("Akun Djiwa Pay Bisnis terhubung."); setEmail(""); await onChanged(); } catch (e) { toast.error(msg(e)); } finally { setBusy(false); } };
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2"><div><Label>BISNIS</Label><b className="block text-[13px]">{business.name}</b></div><StatusTag color="#666672">Satu Bisnis</StatusTag></div>
      {business.owner_customer_id ? <p className="text-[12px] text-[#444450]">Akun Djiwa Pay: <b>{business.owner_name || business.owner_email}</b> · saldo {rupiah(business.owner_balance)}</p> : <Notice tone="err">Akun Djiwa Pay pemilik belum terhubung. Dibutuhkan untuk deposit lewat saldo dan pengembalian sisa anggaran.</Notice>}
      <div className="flex gap-2"><input aria-label="Email akun Djiwa Pay pemilik" className={inputCls} placeholder="email akun Djiwa Pay pemilik" value={email} onChange={(e) => setEmail(e.target.value)} /><Btn disabled={busy || !email.includes("@")} onClick={() => void link()}>Hubungkan</Btn></div>
    </Card>
  );
}

function DepositPanel({ campaign, business, feePercent, call, onClose, onDone }: { campaign: RewardCampaign; business?: Business; feePercent: number; call: <T>(path: string, method?: string, body?: unknown) => Promise<T>; onClose: () => void; onDone: () => Promise<void> }) {
  const [nominal, setNominal] = useState("100000");
  const [method, setMethod] = useState<"mayar" | "djiwapay" | "manual">("mayar");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [invoice, setInvoice] = useState<Deposit | null>(null);
  const amount = Number(nominal) || 0;
  const fee = method === "mayar" ? Math.ceil((amount * feePercent) / 100) : 0;
  const perView = campaign.ratePer1000 ? Math.floor((amount * 1000) / campaign.ratePer1000) : null;
  const ok = amount >= 1000 && (method !== "djiwapay" || pin.length === 6) && (method !== "manual" || note.trim().length > 2);
  const submit = async () => {
    setBusy(true);
    try {
      const row = await call<Deposit>(`/campaigns/${campaign.id}/deposits`, "POST", { method, nominal: amount, key, note, pin });
      if (row.status === "paid") { toast.success("Anggaran bertambah."); await onDone(); onClose(); }
      else { setInvoice(row); toast.success("Invoice QRIS dibuat. Bayar lalu tekan Cek pembayaran."); await onDone(); }
    } catch (e) { toast.error(msg(e)); } finally { setBusy(false); }
  };
  const check = async () => { if (!invoice) return; try { const r = await call<Deposit>(`/deposits/${invoice.id}/check`, "POST"); if (r.status === "paid") { toast.success("Pembayaran diterima, anggaran bertambah."); await onDone(); onClose(); } else toast.info("Pembayaran belum diterima."); } catch (e) { toast.error(msg(e)); } };
  const methods: Array<["mayar" | "djiwapay" | "manual", string, string]> = [["mayar", "QRIS Mayar", `Biaya ditanggung Bisnis · +${rupiah(Math.ceil((amount * feePercent) / 100))}`], ["djiwapay", "Saldo Djiwa Pay Bisnis", `Tanpa biaya · wajib PIN${business?.owner_customer_id ? ` · saldo ${rupiah(business.owner_balance)}` : ""}`], ["manual", "Catat transfer manual", "Bukti dicatat owner, tanpa biaya"]];
  return (
    <Panel title="Isi anggaran kampanye" description={campaign.title} onClose={onClose}
      footer={invoice ? <><Btn onClick={onClose}>Tutup</Btn><Btn variant="primary" onClick={() => void check()}>Cek pembayaran</Btn></> : <><Btn onClick={onClose}>Batal</Btn><Btn variant="primary" disabled={!ok || busy} onClick={() => void submit()}>{busy ? "Memproses…" : method === "mayar" ? `Buat QRIS ${rupiah(amount + fee)}` : `Isi ${rupiah(amount)}`}</Btn></>}>
      {invoice ? (
        <div className="space-y-3">
          <Notice tone="ok">Invoice QRIS dibuat untuk {rupiah(invoice.total)}. Anggaran bertambah otomatis setelah pembayaran terkonfirmasi.</Notice>
          {invoice.invoice_url && <a className="inline-flex min-h-10 items-center gap-2 border border-[#cfcfd6] px-3 text-[12px] font-semibold text-[#2f6fdf]" href={invoice.invoice_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Buka halaman pembayaran</a>}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Nominal anggaran (Rp)" hint={perView ? `Menutup sekitar ${perView.toLocaleString("id-ID")} view pada tarif Rp${(campaign.ratePer1000! / 1000).toLocaleString("id-ID")} per view` : undefined}><input className={`${inputCls} text-lg font-semibold`} inputMode="numeric" value={nominal} onChange={(e) => setNominal(e.target.value.replace(/\D/g, ""))} /></Field>
          <div role="radiogroup" aria-label="Metode pembayaran" className="space-y-2">
            {methods.map(([value, title, sub]) => (
              <button key={value} type="button" role="radio" aria-checked={method === value} onClick={() => setMethod(value)} className={`block w-full border p-3 text-left ${method === value ? "border-[#111114] bg-[#f4f7fc]" : "border-[#e4e4e8] bg-white"}`}>
                <b className="block text-[13px]">{title}</b><span className="text-[11px] text-[#666672]">{sub}</span>
              </button>
            ))}
          </div>
          {method === "djiwapay" && <Field label="PIN Djiwa Pay pemilik Bisnis"><input className={inputCls} type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></Field>}
          {method === "manual" && <Field label="Catatan / bukti transfer" hint="Wajib. Contoh: transfer BCA 20 Nov, ref 12345"><textarea className="min-h-[72px] w-full border border-[#cfcfd6] px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          <div className="space-y-1 border border-[#e4e4e8] bg-[#fafafb] p-3 text-[12.5px]">
            <div className="flex justify-between"><span className="text-[#666672]">Anggaran masuk</span><b>{rupiah(amount)}</b></div>
            <div className="flex justify-between"><span className="text-[#666672]">Biaya QRIS (perkiraan {feePercent}%)</span><b>{rupiah(fee)}</b></div>
            <div className="flex justify-between"><b>Total dibayar Bisnis</b><b className="text-[15px]">{rupiah(amount + fee)}</b></div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function LedgerView({ detail }: { detail: CampaignDetail | null }) {
  if (!detail) return <Loading rows={4} />;
  const i = detail.integrity;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12.5px] leading-5"><b>Laporan integritas: {i.budgetBalanced && i.walletMatches ? "seimbang" : "TIDAK SEIMBANG"}</b>
          <div className="text-[#666672]">Total diisi {rupiah(i.funded)} = tersedia {rupiah(i.available)} + dicadangkan {rupiah(i.reserved)} + terbayar {rupiah(i.paid)} + dikembalikan {rupiah(i.refunded)}. Kredit wallet KOL {rupiah(i.walletCredited)} {i.walletMatches ? "sama dengan" : "BERBEDA dari"} total payout {rupiah(i.payoutTotal)}.</div></div>
        <StatusTag color={i.budgetBalanced && i.walletMatches ? "#16a34a" : "#d92d20"}>{i.budgetBalanced && i.walletMatches ? "✓ Cocok" : "Periksa"}</StatusTag>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <thead><tr className="border-b border-[#e4e4e8] text-[11px] text-[#666672]"><th className="p-3">Tanggal</th><th className="p-3">Rincian</th><th className="p-3">Jenis</th><th className="p-3 text-right">Jumlah</th></tr></thead>
          <tbody>
            {detail.ledger.map((r) => {
              const [label, color] = KIND[r.kind] ?? [r.kind, "#666672"];
              const amount = r.kind === "deposit" ? Number(r.available_delta) : r.kind === "payout" ? -Number(r.paid_delta) : r.kind === "refund" ? -Number(r.refunded_delta) : Number(r.available_delta);
              return <tr key={r.id} className="border-b border-[#ececf0]"><td className="p-3 whitespace-nowrap">{dateTime(r.created_at)}</td><td className="p-3">{r.note || "–"}</td><td className="p-3"><StatusTag color={color}>{label}</StatusTag></td><td className={`p-3 text-right font-semibold tabular-nums ${amount >= 0 ? "text-[#16a34a]" : ""}`}>{amount >= 0 ? "+" : "−"}{rupiah(Math.abs(amount))}</td></tr>;
            })}
            {!detail.ledger.length && <tr><td className="p-6 text-center text-[#666672]" colSpan={4}>Belum ada pergerakan anggaran.</td></tr>}
          </tbody>
        </table>
      </Card>
      <p className="text-[11.5px] text-[#666672]">Ledger hanya bisa ditambah, tidak bisa diubah. Kesalahan dikoreksi dengan baris penyesuaian baru.</p>
      <SectionLabel>Riwayat deposit</SectionLabel>
      <Card className="space-y-1.5 text-[12.5px]">
        {detail.deposits.map((d) => { const [label, color] = DEPOSIT_STATUS[d.status] ?? [d.status, "#666672"]; return <div key={d.id} className="flex flex-wrap items-center justify-between gap-2"><span>{dateTime(d.created_at)} · {d.method === "mayar" ? "QRIS Mayar" : d.method === "djiwapay" ? "Saldo Djiwa Pay" : "Manual"} · {rupiah(d.nominal)}{Number(d.fee) ? ` (+${rupiah(d.fee)} biaya)` : ""}</span><StatusTag color={color}>{label}</StatusTag></div>; })}
        {!detail.deposits.length && <span className="text-[#666672]">Belum ada deposit.</span>}
      </Card>
    </div>
  );
}
