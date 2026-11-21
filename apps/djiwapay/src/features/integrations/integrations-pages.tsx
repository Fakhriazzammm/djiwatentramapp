import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Header, Ic, Reveal, Row, Sheet, Sky, spring, type IconName } from "../shell/dpx-ui";
import { CatIcon, MoneyInput, accName, catOf } from "../finance/fin-sheets";
import type { FinCtx } from "../finance/fin-pages";
import { rupiah } from "../../lib/djiwa-pay-format";
import {
  CHANNEL_NAME, approveItem, cancelImport, commitImport, getImport, getImportItems, startImport, undoImport, connectGoogle, GOOGLE_FEATURES, missingGoogleFeatures, takeAfterGoogle, type HookInfo, confirmDriveRemovals, confirmSheetDeletes, createSource, disconnectGoogle, getGoogle, gmailOff, pollGmailNow, getInbound, getReview, rejectItem, removeSource, syncGoogle, featureOff, featureOn, type SwitchKey,
  type GoogleFeature, type GoogleStatus, type ImportItem, type ImportState, type InboundSummary, type ReviewItem,
} from "../../lib/finance/integrations";
import { createHook, removeHook } from "../../lib/finance/integrations";
import { AppsScriptSheet, hookStatusText, useHook } from "./apps-script";

/** What a Gmail error code means for the person looking at the screen. */
const gmailError = (code: string) => {
  const [base, reason = ""] = code.split(":");
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(reason)) return "Gmail langsung belum tersedia. Gunakan Email terusan atau Apps Script";
  if (/insufficient|PERMISSION/i.test(reason) || base === "SCOPE_MISSING") return "Izin Gmail belum tersedia. Gunakan Email terusan atau Apps Script";
  if (/rateLimit|quota|userRateLimit/i.test(reason) || base === "GMAIL_429") return "Google meminta jeda sebentar. Dilanjutkan otomatis";
  if (base === "NOT_CONNECTED") return "Izin Gmail dicabut. Gunakan Email terusan atau Apps Script";
  if (base === "GMAIL_FORBIDDEN" || base === "GMAIL_403") return "Google menolak akses Gmail langsung. Gunakan Email terusan atau Apps Script";
  return "Pemeriksaan terakhir gagal, dicoba lagi otomatis";
};
const copyText = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
const ago = (iso: string | null) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};

/** Inbound summary (address, mail count, review queue size). Refreshes on mount and whenever the app comes back to the foreground. */
export function useInbound() {
  const [data, setData] = useState<InboundSummary | null>(null);
  const refresh = useCallback(async () => { try { const r = await getInbound(); setData(r); return r; } catch { return null; } }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  return { data, refresh };
}

/* ---------- Beranda: transactions the bank mail recorded on its own, shown above the wallet filter ---------- */
export function AutoChip({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count <= 0) return null;
  return <Reveal i={1}><Btn type="button" className="dpx-reviewchip dpx-autochip" onClick={onOpen} aria-label={`${count} catatan baru tercatat otomatis dari email`}>
      <span className="dpx-rc-dot" aria-hidden="true"><Ic n="check" size="sm" /></span>
      <span className="dpx-rc-t"><b>{count} catatan baru dari email</b><span>Tercatat otomatis. Ketuk untuk melihat atau mengurungkan</span></span>
      <Ic n="chev" size="sm" />
    </Btn></Reveal>;
}

/* ---------- Beranda: the small dot that says something is waiting ---------- */
/** On/off switch shown inside a row. Tapping it acts on its own (the rest of the row still opens the details). */
function Switch({ on, warn, label, onToggle }: { on: boolean; warn?: boolean; label: string; onToggle: () => void }) {
  return <span className={`dpx-switch ${on ? "is-on" : ""} ${warn ? "is-warn" : ""}`} role="switch" aria-checked={on} aria-label={label} tabIndex={0} onClick={(e) => { e.stopPropagation(); onToggle(); }} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onToggle(); } }}><i /></span>;
}

export function ReviewChip({ count, importReady, onOpen, onOpenImport }: { count: number; importReady?: number; onOpen: () => void; onOpenImport?: () => void }) {
  if (count <= 0 && !(importReady && importReady > 0)) return null;
  return <>
    {importReady && importReady > 0 ? <Reveal i={1}><Btn type="button" className="dpx-reviewchip" onClick={onOpenImport} aria-label={`Impor email lama siap ditinjau, ${importReady} transaksi`}>
      <span className="dpx-rc-dot" aria-hidden="true"><Ic n="dl" size="sm" /></span>
      <span className="dpx-rc-t"><b>Impor email lama siap</b><span>{importReady} transaksi menunggu pratinjau kamu</span></span>
      <Ic n="chev" size="sm" />
    </Btn></Reveal> : null}
    {count > 0 ? <Reveal i={1}><Btn type="button" className="dpx-reviewchip" onClick={onOpen} aria-label={`${count} catatan dari email perlu ditinjau`}>
      <span className="dpx-rc-dot" aria-hidden="true">{count > 9 ? "9+" : count}</span>
      <span className="dpx-rc-t"><b>{count} perlu ditinjau</b><span>Dari email pembayaran, ketuk untuk memeriksa</span></span>
      <Ic n="chev" size="sm" />
    </Btn></Reveal> : null}
  </>;
}

/** Google connection state for the whole app (no tokens, only what the UI shows). */
export function useGoogle() {
  const [g, setG] = useState<(GoogleStatus & { success: true }) | null>(null);
  const refresh = useCallback(async () => { try { const r = await getGoogle(); setG(r); return r; } catch { return null; } }, []);
  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);
  return { g, refresh };
}

const NUDGE_KEY = "djiwapay.google-nudge-until";
const nudgeHidden = () => { try { return Number(localStorage.getItem(NUDGE_KEY) ?? 0) > Date.now(); } catch { return false; } };

const GOOGLE_LABELS: Record<GoogleFeature, string> = {
  drive: "Spreadsheet + Drive",
  gmail: "Email bank",
  calendar: "Calendar",
};

export function IntegrationNudge({ onOpenIntegrations }: { onOpenIntegrations: () => void }) {
  const { g } = useGoogle();
  const [hidden, setHidden] = useState(nudgeHidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = missingGoogleFeatures(g);
  if (hidden || !missing.length) return null;

  const snooze = () => {
    try { localStorage.setItem(NUDGE_KEY, String(Date.now() + 3 * 86400_000)); } catch { /* this visit only */ }
    setHidden(true);
  };
  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      takeAfterGoogle();
      const { url } = await connectGoogle(missing);
      window.location.assign(url);
    } catch {
      setError("Google belum bisa dibuka. Coba lagi atau atur satu per satu.");
      setBusy(false);
    }
  };
  return <Reveal i={1}><section className="dpx-nudge" aria-label="Hubungkan Google">
    <div className="dpx-nudge-h">
      <span className="dpx-nudge-ic"><Ic n="link" /></span>
      <div><h2>Hubungkan Google-mu</h2>
        <p>Sinkronkan catatan ke Spreadsheet, simpan struk di Drive, masukkan tagihan ke Calendar, dan catat transaksi dari email bank.</p>
      </div>
    </div>
    <ul className="dpx-nudge-chips">{GOOGLE_FEATURES.map((feature) => {
      const active = !missing.includes(feature);
      return <li key={feature} className={active ? "dpx-on" : undefined} aria-label={`${GOOGLE_LABELS[feature]}, ${active ? "terhubung" : "belum terhubung"}`}>
        {active ? <Ic n="check" size="sm" /> : <i aria-hidden="true" />}{GOOGLE_LABELS[feature]}
      </li>;
    })}</ul>
    <div className="dpx-nudge-act">
      <Btn type="button" className="dpx-btn dpx-sm" disabled={busy} onClick={() => void go()}>{busy ? "Membuka Google…" : "Hubungkan semua"}</Btn>
      <Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={snooze}>Nanti</Btn>
      <Btn type="button" className="dpx-linkbtn" onClick={onOpenIntegrations}>Atur satu per satu</Btn>
    </div>
    {error ? <p className="dpx-sub" role="alert">{error}</p> : null}
  </section></Reveal>;
}

/* ---------- Google consent ---------- */
export function ConsentSheet({ features, onClose, busy, onGo, extra, error }: { features: GoogleFeature[]; onClose: () => void; busy: boolean; onGo: () => void; extra?: string[]; error?: string }) {
  const can: string[] = [], cannot = ["Membaca atau menyimpan email lain", "Mengubah atau menghapus file yang tidak dibuat Djiwa Pay", "Menyimpan kata sandi Google-mu"];
  if (features.includes("gmail")) {
    can.push("Membaca email transaksi dari bank dan e-wallet yang didukung untuk mencatat pembayaran");
    cannot.unshift("Mengirim, mengubah, atau menghapus email");
  }
  if (features.includes("calendar")) can.push("Membuat acara pengingat tagihan di Google Calendar-mu");
  if (features.includes("drive")) { can.push("Membuat folder “Djiwa Pay / Struk” dan menyimpan setiap foto struk di sana", "Membuat satu Spreadsheet keuangan dan menyinkronkannya dua arah: ubah atau hapus di aplikasi atau di Sheets, keduanya ikut", "Memindahkan foto ke tempat sampah Drive saat struknya dihapus di aplikasi"); cannot.unshift("Membaca foto atau file lain di Drive-mu. Foto yang kamu taruh sendiri di folder itu tidak ikut terbaca"); }
  if (extra) can.push(...extra);
  const filesOnly = features.length === 1 && features[0] === "drive";
  return <Sheet title={filesOnly ? "Hubungkan Spreadsheet & Drive" : "Izinkan akses Google"} onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>{filesOnly ? "Google akan meminta akses ke file Spreadsheet dan folder struk yang digunakan Djiwa Pay." : "Kamu akan diarahkan ke Google untuk menyetujui. Izin bisa dicabut kapan saja."}</p>
    <div className="dpx-glabel" style={{ marginTop: 14 }}>Yang bisa dilakukan Djiwa Pay</div>
    <div className="dpx-group dpx-white dpx-checks">{can.map((t) => <div key={t} className="dpx-chk dpx-yes"><Ic n="check" size="sm" /><span>{t}</span></div>)}</div>
    <div className="dpx-glabel">Yang tidak bisa</div>
    <div className="dpx-group dpx-white dpx-checks">{cannot.map((t) => <div key={t} className="dpx-chk dpx-no"><Ic n="close" size="sm" /><span>{t}</span></div>)}</div>
    <p className="dpx-hint dpx-center">Cara data Google dipakai dijelaskan di <a href="/privasi" target="_blank" rel="noreferrer">Kebijakan Privasi</a>.</p>
    {error ? <p className="dpx-sub" role="alert">{error}</p> : null}
    <Btn type="button" className="dpx-btn" disabled={busy} onClick={onGo}>{busy ? "Membuka Google…" : "Lanjut ke Google"}</Btn>
  </Sheet>;
}

/* ---------- Email setup: three short steps, no Gmail permission needed ---------- */
function EmailSetupSheet({ onClose, summary, refresh, ctx }: { onClose: () => void; summary: InboundSummary | null; refresh: () => Promise<InboundSummary | null>; ctx: FinCtx }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const src = summary?.source ?? null;
  const [copied, setCopied] = useState("");
  const flash = (what: string) => { setCopied(what); window.setTimeout(() => setCopied(""), 1600); };
  const create = async () => { setBusy(true); try { await createSource(); await refresh(); } catch { ctx.notify("Alamat belum bisa dibuat. Coba lagi."); } finally { setBusy(false); } };
  useEffect(() => { if (!src && summary?.configured) void create(); /* the address is made the moment the sheet opens */ }, [summary?.configured]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setInterval(() => { void refresh(); }, 4000); return () => window.clearInterval(t); }, [refresh]);
  const copy = async (what: string, text: string) => { if (await copyText(text)) flash(what); else ctx.notify("Tidak bisa menyalin. Tekan lama untuk menyalin manual."); };
  const received = (src?.mailCount ?? 0) > 0;
  const steps = ["Alamat", "Gmail", "Filter", "Uji"];
  return <Sheet title="Email pembayaran" onClose={onClose}>
    <div className="dpx-stepper" aria-label={`Langkah ${step + 1} dari ${steps.length}`}>{steps.map((s, i) => <span key={s} className={i === step ? "dpx-on" : i < step ? "dpx-done" : ""}><i>{i < step ? <Ic n="check" size="sm" /> : i + 1}</i>{s}</span>)}</div>
    {step === 0 ? <>
      <p className="dpx-sub">Ini alamat khusus milikmu. Email pembayaran dari bank dan e-wallet yang kamu teruskan ke sini dibaca dan dicatat otomatis.</p>
      <div className="dpx-addr" role="group" aria-label="Alamat email khusus"><code>{src?.address ?? "Membuat alamat…"}</code>
        <Btn type="button" className="dpx-copybtn" disabled={!src} onClick={() => src && copy("addr", src.address)}><Ic n="copy" size="sm" /> {copied === "addr" ? "Tersalin" : "Salin"}</Btn></div>
      <div className="dpx-note dpx-info"><Ic n="shield" /><div><b>Tanpa izin baca Gmail.</b> Hanya email yang kamu pilih lewat filter yang sampai ke sini. Kode OTP dan PIN diabaikan.</div></div>
      <Btn type="button" className="dpx-btn" disabled={!src || busy} onClick={() => setStep(1)}>Lanjut</Btn>
    </> : null}
    {step === 1 ? <>
      <p className="dpx-sub">Daftarkan alamat tadi sebagai alamat terusan di Gmail.</p>
      <ol className="dpx-howto"><li>Buka Gmail → <b>Setelan</b> → <b>Lihat semua setelan</b></li><li>Tab <b>Penerusan dan POP/IMAP</b> → <b>Tambahkan alamat terusan</b></li><li>Tempel alamat Djiwa Pay, lalu <b>Lanjutkan</b></li></ol>
      <a className="dpx-btn dpx-ghost dpx-linkbtn2" href="https://mail.google.com/mail/u/0/#settings/fwdandpop" target="_blank" rel="noreferrer"><Ic n="link" size="sm" /> Buka setelan Gmail</a>
      <div className={`dpx-codebox ${src?.forwardCode ? "dpx-got" : ""}`} aria-live="polite">
        {src?.forwardCode
          ? <><span>Kode verifikasi dari Gmail</span><b>{src.forwardCode}</b><Btn type="button" className="dpx-copybtn" onClick={() => copy("code", src.forwardCode!)}><Ic n="copy" size="sm" /> {copied === "code" ? "Tersalin" : "Salin kode"}</Btn><small>Tempel kode ini di Gmail, lalu <b>Verifikasi</b>. Jangan pilih “teruskan semua email”: kita pakai filter di langkah berikutnya.</small></>
          : <><span className="dpx-pulse" aria-hidden="true" /><span>Menunggu kode dari Gmail… muncul di sini otomatis.</span></>}
      </div>
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep(0)}>Kembali</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={() => setStep(2)}>{src?.forwardCode ? "Lanjut" : "Sudah terverifikasi"}</Btn></div>
    </> : null}
    {step === 2 ? <>
      <p className="dpx-sub">Buat satu filter agar hanya email bank dan e-wallet yang diteruskan.</p>
      <ol className="dpx-howto"><li>Di Gmail: <b>Setelan</b> → <b>Filter dan alamat yang diblokir</b> → <b>Buat filter baru</b></li><li>Tempel teks di bawah ke kolom <b>Dari</b>, lalu <b>Buat filter</b></li><li>Centang <b>Teruskan ke</b> dan pilih alamat Djiwa Pay → <b>Buat filter</b></li></ol>
      <div className="dpx-addr dpx-small"><code>{summary?.filter ?? ""}</code><Btn type="button" className="dpx-copybtn" onClick={() => summary && copy("filter", summary.filter)}><Ic n="copy" size="sm" /> {copied === "filter" ? "Tersalin" : "Salin"}</Btn></div>
      <a className="dpx-btn dpx-ghost dpx-linkbtn2" href="https://mail.google.com/mail/u/0/#settings/filters" target="_blank" rel="noreferrer"><Ic n="link" size="sm" /> Buka filter Gmail</a>
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep(1)}>Kembali</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={() => setStep(3)}>Lanjut</Btn></div>
    </> : null}
    {step === 3 ? <>
      <div className={`dpx-codebox ${received ? "dpx-got" : ""}`} aria-live="polite">
        {received ? <><Ic n="check" size="lg" /><b style={{ fontSize: 17 }}>Email pertama diterima</b><small>{src!.mailCount} email masuk · {ago(src!.lastMailAt)}. Notifikasi pembayaran berikutnya langsung tercatat otomatis. Yang meragukan masuk antrean tinjau.</small></>
          : <><span className="dpx-pulse" aria-hidden="true" /><span>Kirim email apa saja ke alamatmu dari Gmail, atau tunggu notifikasi bank berikutnya. Halaman ini memeriksa otomatis.</span></>}
      </div>
      <div className="dpx-addr dpx-small"><code>{src?.address}</code><Btn type="button" className="dpx-copybtn" onClick={() => src && copy("addr", src.address)}><Ic n="copy" size="sm" /> {copied === "addr" ? "Tersalin" : "Salin"}</Btn></div>
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep(2)}>Kembali</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={onClose}>{received ? "Selesai" : "Selesaikan nanti"}</Btn></div>
    </> : null}
  </Sheet>;
}

/* ---------- Import of old Gmail mail: choose, scan, preview, commit, undo ---------- */
const PERIODS: [number, string][] = [[90, "3 bulan"], [180, "6 bulan"], [365, "1 tahun"], [0, "Semua"]];
const monthName = (ym: string) => new Date(`${ym}-15T00:00:00+07:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

export function ImportSheet({ ctx, onClose, onChanged }: { ctx: FinCtx; onClose: () => void; onChanged: () => void }) {
  const [imp, setImp] = useState<ImportState | null | undefined>(undefined);
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [showCheck, setShowCheck] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const load = useCallback(async () => { try { setImp((await getImport()).import); } catch { setImp((cur) => cur ?? null); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (imp?.status !== "scanning") return; const t = window.setInterval(() => void load(), 3000); return () => window.clearInterval(t); }, [imp?.status, load]);
  useEffect(() => { if (imp?.status === "ready" && showCheck && !items) void getImportItems(imp.id).then((r) => setItems(r.items)).catch(() => setItems([])); }, [imp?.status, imp?.id, showCheck, items]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); try { await fn(); if (ok) ctx.notify(ok); await load(); onChanged(); } catch (e) { ctx.notify((e as { code?: string }).code === "NOT_CONNECTED" ? "Hubungkan Gmail dulu" : "Gagal. Coba lagi."); } finally { setBusy(false); } };
  const share = async (it: ImportItem) => { const text = `[${CHANNEL_NAME[it.channel] ?? it.channel}] ${it.parsed.sample ?? ""}`; if (await copyText(text)) ctx.notify("Contoh tersalin. Nomor dan nama sudah disamarkan"); else ctx.notify("Tidak bisa menyalin"); };
  const p = imp?.preview;
  const periodLabel = imp ? (PERIODS.find(([d]) => d === imp.periodDays)?.[1] ?? "") : "";
  return <Sheet title="Impor email lama" onClose={onClose}>
    {imp === undefined ? <div className="dpx-sub dpx-center" style={{ padding: 30 }}>Memuat…</div> : null}
    {imp === null || (imp && ["cancelled", "undone"].includes(imp.status)) ? <>
      <p className="dpx-sub" style={{ marginTop: -6 }}>Cari pembayaran lama di Gmail-mu dan catat sekaligus. Kamu lihat pratinjau dulu. Tidak ada yang tercatat sebelum kamu setuju.</p>
      <div className="dpx-glabel" style={{ marginTop: 12 }}>Seberapa jauh ke belakang?</div>
      <div className="dpx-inline-seg" role="group" aria-label="Periode">{PERIODS.map(([d, label]) => <Btn key={d} type="button" className={days === d ? "dpx-on" : ""} aria-pressed={days === d} onClick={() => setDays(d)}>{label}</Btn>)}</div>
      <div className="dpx-note dpx-info"><Ic n="shield" /><div>Hanya email dari bank dan e-wallet yang terdaftar yang dibaca. Disimpan hanya nominal, toko, dan waktu.{days === 0 || days === 365 ? " Email yang lebih lama bisa memakan waktu beberapa menit." : ""}</div></div>
      <Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void act(() => startImport(days))}>{busy ? "Memulai…" : "Mulai pindai"}</Btn>
    </> : null}
    {imp?.status === "scanning" ? <>
      <div className="dpx-scan"><div className="dpx-bar"><motion.i animate={{ width: `${Math.max(4, Math.round(imp.progress * 100))}%` }} transition={{ duration: 0.6 }} /></div>
        <b>{Math.round(imp.progress * 100)}%</b><span>{imp.scanned} email diperiksa · {imp.staged} transaksi ditemukan{imp.scanningTo ? ` · sampai ${new Date(imp.scanningTo).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}` : ""}</span></div>
      {imp.error ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Pemindaian tertahan.</b> {gmailError(imp.error)}</div></div> : null}
      <p className="dpx-sub dpx-center">Boleh ditutup. Pemindaian jalan terus di server, dan Beranda memberi tahu saat pratinjau siap.</p>
      <Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={() => void act(() => cancelImport(), "Pemindaian dihentikan")}>Hentikan</Btn>
    </> : null}
    {imp?.status === "ready" && p ? <>
      <p className="dpx-sub" style={{ marginTop: -6 }}>Hasil pindai {periodLabel.toLowerCase()} terakhir. Belum ada yang dicatat.</p>
      <div className="dpx-impsum"><div><span>Siap dicatat</span><b>{p.sure.count}</b></div><div><span>Masuk</span><b className="dpx-in">+{rupiah(p.sure.income)}</b></div><div><span>Keluar</span><b>−{rupiah(p.sure.expense)}</b></div></div>
      {p.months.length ? <div className="dpx-group dpx-white dpx-flush" style={{ marginTop: 10 }}>{p.months.slice(0, 8).map((m) => <div key={m.month} className="dpx-kv"><span>{monthName(m.month)} · {m.count}</span><b>{m.income ? <span className="dpx-in">+{rupiah(m.income)} </span> : null}−{rupiah(m.expense)}</b></div>)}{p.months.length > 8 ? <div className="dpx-kv"><span>dan {p.months.length - 8} bulan lain</span><b /></div> : null}</div> : null}
      {p.categories.length ? <div className="dpx-chips2" style={{ marginTop: 10 }}>{p.categories.map((c) => <span key={c.categoryId} className="dpx-chip3">{catOf(ctx.fin.state, c.categoryId).name} {rupiah(c.total)}</span>)}</div> : null}
      {p.check.count ? <>
        <Btn type="button" className="dpx-linkbtn" style={{ marginTop: 12 }} onClick={() => setShowCheck((v) => !v)} aria-expanded={showCheck}>{p.check.count} email belum terbaca jelas, masuk antrean tinjau {showCheck ? "▴" : "▾"}</Btn>
        {showCheck ? <div className="dpx-checks2">{items === null ? <div className="dpx-sub">Memuat…</div> : items.map((it) => <div key={it.id} className="dpx-checkitem"><div><b>{CHANNEL_NAME[it.channel] ?? it.channel}{it.parsed.amount ? ` · ${rupiah(it.parsed.amount)}` : ""}</b><span>{it.parsed.merchant || it.parsed.subject || "Tanpa judul"}</span></div><Btn type="button" className="dpx-copybtn" onClick={() => void share(it)}><Ic n="copy" size="sm" /> Salin contoh</Btn></div>)}
          <p className="dpx-hint">“Salin contoh” menyalin teks email dengan nomor dan nama disamarkan. Kirim ke pengembang agar pembaca email bisa diperbaiki.</p></div> : null}
      </> : null}
      {!p.sure.count && !p.check.count ? <div className="dpx-note"><Ic n="info" /><div><b>Tidak ada pembayaran ditemukan</b> di periode ini. Coba periode yang lebih panjang.</div></div> : null}
      <div className="dpx-flex dpx-mt">
        <Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} disabled={busy} onClick={() => void act(() => cancelImport(), "Impor dibatalkan")}>Batalkan</Btn>
        {p.sure.count || p.check.count ? <Btn type="button" className="dpx-btn" style={{ margin: 0 }} disabled={busy} onClick={() => void act(async () => { const r = await commitImport(imp.id); await ctx.fin.retrySync(); ctx.notify(`${r.committed} transaksi dicatat${r.movedToReview ? `, ${r.movedToReview} masuk antrean tinjau` : ""}`); })}>{busy ? "Mencatat…" : p.sure.count ? `Catat ${p.sure.count} transaksi` : "Pindahkan ke antrean tinjau"}</Btn> : null}
      </div>
    </> : null}
    {imp?.status === "done" ? <>
      <div className="dpx-codebox dpx-got"><Ic n="check" size="lg" /><b style={{ fontSize: 17 }}>{imp.committed} transaksi dicatat</b><small>{imp.movedToReview ? `${imp.movedToReview} lainnya menunggu di antrean tinjau. ` : ""}Catatan ini juga tertulis di Spreadsheet-mu.</small></div>
      {confirmUndo ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Hapus semua catatan dari impor ini?</b> Perubahan yang sudah kamu buat pada catatan itu ikut hilang.<div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" disabled={busy} onClick={() => void act(async () => { const r = await undoImport(imp.id); await ctx.fin.retrySync(); setConfirmUndo(false); ctx.notify(`${r.removed} catatan dihapus`); })}>Ya, urungkan</Btn><Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => setConfirmUndo(false)}>Batal</Btn></div></div></div>
        : <Btn type="button" className="dpx-btn dpx-ghost" onClick={() => setConfirmUndo(true)}><Ic n="undo" size="sm" /> Urungkan impor ini</Btn>}
      <Btn type="button" className="dpx-btn" onClick={onClose}>Selesai</Btn>
    </> : null}
    {imp?.status === "failed" ? <>
      <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Impor gagal.</b> {imp.error === "SCOPE_MISSING" || imp.error === "NOT_CONNECTED" ? "Impor lama memerlukan izin Gmail yang aktif. Untuk email baru, gunakan Email terusan atau Apps Script." : "Coba lagi sebentar lagi."}</div></div>
      <Btn type="button" className="dpx-btn" disabled={busy} onClick={() => void act(() => startImport(days))}>Coba lagi</Btn>
    </> : null}
  </Sheet>;
}

/* ---------- Integrasi page ---------- */
function Tag({ tone, children }: { tone?: "ok" | "warn" | "later"; children: ReactNode }) { return <span className={`dpx-tag ${tone ? "dpx-" + (tone === "later" ? "later" : tone) : ""}`}>{children}</span>; }

export function IntegrationsPage({ ctx, onBack, onReview }: { ctx: FinCtx; onBack: () => void; onReview: () => void }) {
  const { data: inbound, refresh } = useInbound();
  const [g, setG] = useState<(GoogleStatus & { success: true }) | null>(null);
  const [loadingG, setLoadingG] = useState(true);
  const [sheet, setSheet] = useState<null | "email" | "import" | "script" | "sources" | { consent: GoogleFeature[] }>(null);
  const { hook, refresh: refreshHook, setHook } = useHook();
  const [busy, setBusy] = useState("");
  const [confirmOff, setConfirmOff] = useState<null | "google" | "email" | "script">(null);
  const offerImport = useRef(false);
  const loadG = useCallback(async () => { try { setG(await getGoogle()); } catch { /* offline: leave as is */ } finally { setLoadingG(false); } }, []);
  useEffect(() => { void loadG(); }, [loadG]);
  // Fresh Google connection with live Gmail: offer the old-mail import (it still opens a preview first, nothing is recorded yet).
  useEffect(() => { if (offerImport.current && g?.features.gmail && g.gmail?.enabled) { offerImport.current = false; setSheet((cur) => cur ?? "import"); } }, [g]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const openEmail = url.searchParams.get("email") === "1";
    const openImport = url.searchParams.get("impor") === "1";
    const googleResult = url.searchParams.get("google");
    if (!openEmail && !openImport && !googleResult) return;

    if (openEmail) { url.searchParams.delete("email"); setSheet("sources"); }
    if (openImport) { url.searchParams.delete("impor"); setSheet("import"); }
    url.searchParams.delete("google");
    window.history.replaceState(window.history.state, "", url);

    if (!googleResult) return;
    const after = takeAfterGoogle();
    ctx.notify(googleResult === "ok" ? "Google terhubung"
      : googleResult === "partial" ? "Sebagian layanan Google terhubung. Lengkapi izin yang tersisa dari Integrasi."
      : googleResult === "setup" ? "Izin Google tersimpan. Buka layanan terkait untuk mencoba sinkronisasi lagi."
      : googleResult === "account" ? "Pilih akun Google yang sudah terhubung di Djiwa Pay."
      : googleResult === "unavailable" ? "Integrasi Google belum tersedia"
      : "Koneksi Google belum berhasil. Coba lagi atau atur satu per satu.");
    if (googleResult === "ok" && after) ctx.nav.go(after);
    else if (googleResult === "ok" || googleResult === "partial") offerImport.current = true;
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const goGoogle = async (features: GoogleFeature[]) => {
    if (busy === "connect") return;
    setBusy("connect");
    try { const { url } = await connectGoogle(features); window.location.assign(url); }
    catch (e) { setBusy(""); ctx.notify((e as { code?: string }).code === "NOT_CONFIGURED" ? "Integrasi Google belum tersedia" : "Tidak bisa membuka Google. Coba lagi."); }
  };
  const run = async (what: "calendar" | "drive" | "sheets", done: string) => {
    setBusy(what);
    try { await syncGoogle(what); ctx.notify(done); window.setTimeout(() => void loadG(), 7000); await loadG(); }
    catch { ctx.notify("Gagal memulai. Coba lagi."); } finally { setBusy(""); }
  };
  const holdOk = async (fn: () => Promise<unknown>) => { setBusy("hold"); try { await fn(); ctx.notify("Dilanjutkan. Memproses…"); window.setTimeout(() => void loadG(), 6000); await loadG(); } catch { ctx.notify("Gagal. Coba lagi."); } finally { setBusy(""); } };
  const checkGmail = async () => {
    setBusy("gmail-check");
    try { await pollGmailNow(); ctx.notify("Memeriksa Gmail… hasilnya muncul sebentar lagi"); window.setTimeout(() => { void loadG(); void refresh(); }, 6000); }
    catch { ctx.notify("Gagal memulai pemeriksaan. Coba lagi."); } finally { setBusy(""); }
  };
  /** One switch per Google service: on/off without leaving the page; only a service Google has not granted yet goes through consent. */
  const flip = async (key: SwitchKey, on: boolean, label: string) => {
    const scope = key === "calendar" ? "calendar" : "drive";
    if (!on && !g?.features[scope]) { setSheet({ consent: [scope] }); return; }
    setBusy(`sw-${key}`);
    try { await (on ? featureOff(key) : featureOn(key)); await loadG(); ctx.notify(on ? `${label} dimatikan` : `${label} dinyalakan`); }
    catch { ctx.notify("Gagal mengubah. Coba lagi."); } finally { setBusy(""); }
  };
  const turnGmailOn = async () => { setBusy("gmail"); try { await pollGmailNow(); await loadG(); ctx.notify("Gmail langsung dinyalakan"); } catch { ctx.notify("Gagal menyalakan. Coba lagi."); } finally { setBusy(""); } };
  const turnGmailOff = async () => { setBusy("gmail"); try { await gmailOff(); await loadG(); ctx.notify("Gmail langsung dimatikan"); } catch { ctx.notify("Gagal mematikan. Coba lagi."); } finally { setBusy(""); } };
  const off = async () => {
    setBusy("off");
    try { if (confirmOff === "script") { await removeHook(); await refreshHook(); ctx.notify("Apps Script dimatikan. Hapus juga proyeknya di script.google.com."); } else if (confirmOff === "google") { await disconnectGoogle(); await loadG(); ctx.notify("Google diputuskan. Token dihapus."); } else { await removeSource(true); await refresh(); ctx.notify("Email terusan dimatikan"); } setConfirmOff(null); }
    catch { ctx.notify("Gagal memutuskan. Coba lagi."); } finally { setBusy(""); }
  };

  const src = inbound?.source ?? null;
  const gOn = Boolean(g?.connected), gReady = g?.configured !== false;
  const cal = Boolean(g?.active?.calendar), drive = Boolean(g?.active?.sheets), receipts = Boolean(g?.active?.receipts), driveGranted = Boolean(g?.features.drive);
  const gm = Boolean(g?.features.gmail && g?.gmail?.enabled), gmInfo = g?.gmail ?? null;
  const soon = <Tag tone="later">Segera</Tag>;
  const active = [gm ? "Gmail langsung" : null, hook?.enabled ? "Apps Script" : null, src?.forwarding ? "Email terusan" : null].filter(Boolean) as string[];
  /** One tap for every Google sync that is on: bills to Calendar, and the workbook export. */
  const syncAll = async () => {
    setBusy("google-all");
    try {
      await Promise.all([cal ? syncGoogle("calendar") : null, drive ? syncGoogle("sheets") : null].filter(Boolean));
      ctx.notify(cal && drive ? "Calendar dan Spreadsheet disinkronkan" : cal ? "Calendar disinkronkan" : "Sinkronisasi Spreadsheet dimulai. Hasilnya muncul sebentar lagi");
      window.setTimeout(() => void loadG(), 7000); await loadG();
    } catch { ctx.notify("Gagal memulai. Coba lagi."); } finally { setBusy(""); }
  };
  return <div className="dpx-page"><Sky><div className="dpx-pad dpx-nobar">
    <Header title="Integrasi" onBack={onBack} />
    <div className="dpx-note dpx-info" style={{ marginTop: 6 }}><Ic n="shield" /><div><b>Kamu yang mengatur.</b> Setiap integrasi bisa diputus kapan saja. Token dan data turunan ikut dihapus.</div></div>

    {gOn ? <Reveal i={4}><div className="dpx-group dpx-white dpx-int" style={{ marginTop: 10 }}>
      <Row icon="user" tone="slate" title={g!.email ?? "Akun Google"} sub="Akun yang terhubung" chev={false} />
    </div></Reveal> : null}

    <div className="dpx-glabel">Catat otomatis dari email{gm ? <Btn type="button" disabled={busy === "gmail-check"} onClick={() => void checkGmail()}>{busy === "gmail-check" ? "Memeriksa…" : "Periksa"}</Btn> : null}</div>
    <Reveal i={1}><div className="dpx-group dpx-white dpx-int">
      {active.length ? <Row icon="check" tone="emerald" title={`Antrean tinjau${inbound && inbound.review ? ` (${inbound.review})` : ""}`} sub="Email baru tercatat otomatis. Di sini hanya yang perlu dicek" onClick={onReview} /> : null}
      {gm ? <Row icon="dl" tone="amber" title="Impor email lama" sub={inbound && inbound.importReady ? `${inbound.importReady} transaksi siap ditinjau` : "Catat pembayaran lama dari Gmail-mu, dengan pratinjau dulu"} onClick={() => setSheet("import")} /> : null}
      {hook?.enabled && (hook.scriptVersion ?? 1) < (hook.currentScriptVersion ?? 2) ? <div className="dpx-note" role="status" style={{ margin: "6px 12px 10px" }}><Ic n="info" /><div><b>Skrip Apps Script-mu versi lama.</b> Salin skrip yang baru agar pembayaran dari toko, marketplace, dan pengirim lain ikut terbaca.<div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-sm" style={{ margin: 0 }} onClick={() => setSheet("script")}>Salin skrip baru</Btn></div></div></div> : null}
    </div></Reveal>

    <div className="dpx-glabel">Google{cal || drive ? <Btn type="button" disabled={busy === "google-all"} onClick={() => void syncAll()}>{busy === "google-all" ? "Menyinkronkan…" : "Sinkronkan"}</Btn> : null}</div>
    <Reveal i={3}><div className="dpx-group dpx-white dpx-int">
      <Row icon="spark" tone="orange" title="Gmail langsung"
        sub={gmInfo?.error ? gmailError(gmInfo.error) : gmInfo?.lastPolledAt ? `Dicek ${ago(gmInfo.lastPolledAt)} · ${gmInfo.fetched} email dibaca` : gm ? "Memeriksa email pertama…" : "Catat email bank dan e-wallet melalui akun Google-mu"}
        trail={loadingG ? undefined : !gReady ? soon : <span className={`dpx-switch ${gm ? "is-on" : ""} ${gm && gmInfo?.error ? "is-warn" : ""}`} role="switch" aria-checked={gm} aria-label="Gmail langsung" aria-busy={busy === "gmail"}><i /></span>} chev={false}
        onClick={g?.configured && busy !== "gmail" ? (gm && !gmInfo?.error ? () => void turnGmailOff() : !gm && g.features.gmail ? () => void turnGmailOn() : () => setSheet({ consent: ["gmail"] })) : undefined} />
      <Row icon="cal" tone="blue" title="Google Calendar" sub={cal ? `${g!.calendar.events} tagihan jadi acara bulanan` : "Tagihan rutin jadi acara + pengingat"} chev={false}
        trail={loadingG ? undefined : !gReady ? soon : <Switch on={cal} label="Google Calendar" onToggle={() => void flip("calendar", cal, "Google Calendar")} />}
        onClick={gReady && !loadingG && busy !== "sw-calendar" ? () => void flip("calendar", cal, "Google Calendar") : undefined} />
      <Row icon="list" tone="emerald" title="Spreadsheet keuangan" chev={false} sub={drive ? (g!.sheet?.status === "missing" ? "Spreadsheet terhapus di Drive. Ketuk untuk membuat ulang" : g!.sheet?.url ? `Dua arah · ${g!.sheet.pending ? "menyinkronkan…" : g!.sheet.lastSyncedAt ? `disinkron ${ago(g!.sheet.lastSyncedAt)}` : "menunggu sinkron pertama"}` : "Sedang dibuat di Drive-mu…") : "Semua catatan otomatis tertulis di Spreadsheet-mu, dua arah"}
        trail={loadingG ? undefined : !gReady ? soon : <Switch on={drive} warn={drive && Boolean(g!.sheet?.error || g!.sheet?.status === "missing")} label="Spreadsheet keuangan" onToggle={() => void flip("sheets", drive, "Spreadsheet")} />}
        onClick={gReady && !loadingG ? (!drive ? () => void flip("sheets", drive, "Spreadsheet") : g!.sheet?.status === "missing" ? () => void run("sheets", "Membuat ulang spreadsheet…") : g!.sheet?.url ? () => window.open(g!.sheet!.url!, "_blank", "noopener") : undefined) : undefined} />
      {drive && g!.sheet?.hold ? <div className="dpx-note dpx-danger" role="alert" style={{ margin: "6px 12px 10px" }}><Ic n="warn" /><div><b>Penghapusan ditahan.</b> {g!.sheet.hold}<div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" disabled={busy === "hold"} onClick={() => void holdOk(confirmSheetDeletes)}>Ya, hapus juga di aplikasi</Btn></div></div></div> : null}
      {driveGranted || gOn ? <Row icon="dl" tone="amber" title="Foto struk di Drive" sub={receipts ? `${g!.drive.uploaded} foto di “Djiwa Pay / Struk”${g!.drive.failed ? ` · ${g!.drive.failed} gagal` : ""} · dua arah` : "Simpan foto struk ke folder “Djiwa Pay / Struk” di Drive-mu"} chev={false}
        trail={loadingG ? undefined : !gReady ? soon : <Switch on={receipts} label="Foto struk di Drive" onToggle={() => void flip("receipts", receipts, "Foto struk")} />}
        onClick={gReady && !loadingG && busy !== "sw-receipts" ? () => void flip("receipts", receipts, "Foto struk") : undefined} /> : null}
      {receipts && g!.drive.hold ? <div className="dpx-note dpx-danger" role="alert" style={{ margin: "6px 12px 10px" }}><Ic n="warn" /><div><b>Penghapusan ditahan.</b> {g!.drive.hold}<div className="dpx-flex" style={{ marginTop: 8 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" disabled={busy === "hold"} onClick={() => void holdOk(confirmDriveRemovals)}>Ya, hapus juga di aplikasi</Btn></div></div></div> : null}
    </div>
    {cal || drive || receipts ? <div className="dpx-openrow" role="group" aria-label="Buka di Google">
      {cal ? <Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => window.open("https://calendar.google.com/calendar/r", "_blank", "noopener")}><Ic n="cal" size="sm" /> Calendar</Btn> : null}
      {receipts ? <Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => window.open(g!.drive.folderId ? `https://drive.google.com/drive/folders/${g!.drive.folderId}` : "https://drive.google.com/drive/my-drive", "_blank", "noopener")}><Ic n="dl" size="sm" /> Drive</Btn> : null}
      {drive && g!.sheet?.url ? <Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => window.open(g!.sheet!.url!, "_blank", "noopener")}><Ic n="list" size="sm" /> Spreadsheet</Btn> : null}
    </div> : null}
    </Reveal>

    <div className="dpx-glabel">Alternatif Integrasi email (Advance)</div>
    <Reveal i={5}><div className="dpx-group dpx-white dpx-int">
      <Row icon="spark" tone="orange" title="Sumber email" sub={active.length ? active.join(" · ") : "Gunakan Email terusan atau Apps Script"} trail={loadingG ? undefined : active.length ? <Tag tone="ok">Aktif</Tag> : <Tag tone="warn">Sambungkan</Tag>} onClick={() => setSheet("sources")} />
    </div></Reveal>

    {g && !g.configured ? <div className="dpx-note" style={{ marginTop: 12 }}><Ic n="info" /><div><b>Google belum dihubungkan di server ini.</b> Calendar, Drive dan Sheets aktif begitu kredensial Google dipasang.</div></div> : null}
    {inbound && !inbound.configured ? <div className="dpx-note" style={{ marginTop: 12 }}><Ic n="info" /><div><b>Penerima email belum aktif.</b> Email terusan aktif begitu alamat domain surat dipasang.</div></div> : null}

    {confirmOff ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 12 }}><Ic n="warn" /><div><b>{confirmOff === "google" ? "Putuskan Google?" : confirmOff === "script" ? "Matikan Apps Script?" : "Matikan email terusan?"}</b> {confirmOff === "google" ? "Acara Calendar dan file yang sudah dibuat tetap ada di akun Google-mu." : confirmOff === "script" ? "Alamat skrip dihapus, jadi skrip di akun Google-mu berhenti dikenali. Hapus juga proyeknya di script.google.com. Catatan yang sudah tersimpan tetap ada." : "Alamat dihapus dan antrean tinjau dikosongkan. Catatan yang sudah tersimpan tetap ada."}
      <div className="dpx-flex" style={{ marginTop: 10 }}><Btn type="button" className="dpx-btn dpx-danger dpx-sm" disabled={busy === "off"} onClick={() => void off()}>{busy === "off" ? "Memproses…" : "Ya, putuskan"}</Btn><Btn type="button" className="dpx-btn dpx-soft dpx-sm" onClick={() => setConfirmOff(null)}>Batal</Btn></div></div></div> : null}

    <AnimatePresence>
      {sheet === "import" ? <ImportSheet key="import" ctx={ctx} onClose={() => setSheet(null)} onChanged={() => void refresh()} /> : null}
      {sheet === "script" ? <AppsScriptSheet key="script" ctx={ctx} hook={hook} setHook={setHook} refresh={refreshHook} rotate={async () => { try { setHook(await createHook(true)); } catch { ctx.notify("Gagal membuat alamat baru"); } }} onClose={() => setSheet(null)} /> : null}
      {sheet === "sources" ? <Sheet key="sources" title="Sumber email" onClose={() => setSheet(null)}>
        <p className="dpx-sub" style={{ marginTop: -6, marginBottom: 4 }}>Pilih satu cara untuk mencatat transaksi dari email bank dan e-wallet.</p>
        <p className="dpx-sub" style={{ margin: "6px 4px 6px", fontWeight: 600 }}>Alternatif · lanjutan. Gmail langsung ada di bagian Google</p>
        <div className="dpx-group dpx-white dpx-int">
          <Row icon="bank" tone="slate" title="Email terusan"
            sub={src?.forwarding ? (src.mailCount ? `${src.mailCount} email · ${ago(src.lastMailAt)}` : "Menunggu email pertama") : "Teruskan email transaksi tertentu ke alamat Djiwa Pay-mu"}
            trail={inbound && !inbound.configured ? soon : <Switch on={Boolean(src?.forwarding)} label="Email terusan" onToggle={() => { if (src?.forwarding) { setSheet(null); setConfirmOff("email"); } else setSheet("email"); }} />}
            onClick={inbound?.configured ? () => setSheet("email") : undefined} />
          {src?.forwarding ? <>
            <Row icon="refresh" tone="slate" title="Buat alamat baru" sub="Alamat lama berhenti menerima email" onClick={async () => { setBusy("rot"); try { await createSource(true); await refresh(); ctx.notify("Alamat baru dibuat. Perbarui terusan di Gmail."); setSheet("email"); } catch { ctx.notify("Gagal membuat alamat baru"); } finally { setBusy(""); } }} chev={false} />
          </> : null}
          <Row icon="spark" tone="orange" title="Apps Script"
            sub={hook?.enabled ? (hook.received ? `${hook.received} email · ${ago(hook.lastAt ?? null)}${hookStatusText(hook.lastStatus, hook.lastReason) ? ` · ${hookStatusText(hook.lastStatus, hook.lastReason)}` : ""}` : "Menunggu email pertama dari skripmu") : "Ikuti panduan untuk menjalankan skrip di akun Google-mu"}
            trail={hook?.available === false ? soon : <Switch on={Boolean(hook?.enabled)} warn={Boolean(hook?.enabled && !hook.received)} label="Apps Script" onToggle={() => { if (hook?.enabled) { setSheet(null); setConfirmOff("script"); } else setSheet("script"); }} />}
            onClick={hook?.available === false ? undefined : () => setSheet("script")} />
          {hook?.enabled ? <>
            <Row icon="refresh" tone="slate" title="Buat alamat skrip baru" sub="Alamat lama langsung mati. Salin dan tempel skrip yang baru" onClick={async () => { setBusy("hook"); try { setHook(await createHook(true)); ctx.notify("Alamat baru dibuat. Tempel ulang skripnya."); setSheet("script"); } catch { ctx.notify("Gagal membuat alamat baru"); } finally { setBusy(""); } }} chev={false} />
          </> : null}
        </div>
      </Sheet> : null}
      {sheet === "email" ? <EmailSetupSheet key="email" ctx={ctx} summary={inbound} refresh={refresh} onClose={() => setSheet(null)} /> : null}
      {sheet && typeof sheet === "object" ? <ConsentSheet key="consent" features={sheet.consent} busy={busy === "connect"} onClose={() => setSheet(null)} onGo={() => void goGoogle(sheet.consent)} /> : null}
    </AnimatePresence>
  </div></Sky></div>;
}

export { ReviewPage } from "./integrations-review";

export type { IconName };
