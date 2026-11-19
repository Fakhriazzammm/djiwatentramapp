import { useCallback, useEffect, useState } from "react";
import { Btn, Ic, Sheet } from "../shell/dpx-ui";
import type { FinCtx } from "../finance/fin-pages";
import { createHook, getHook, type HookInfo } from "../../lib/finance/integrations";
import "./apps-script.css";

const copyText = async (text: string) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
const ago = (iso: string | null | undefined) => {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`;
};

/** What the server did with the last mail the script sent, in words. */
export const hookStatusText = (status?: string | null, reason?: string | null) => {
  switch (status) {
    case "auto": return "dicatat otomatis";
    case "review": return "masuk antrean tinjau";
    case "duplicate": return "sudah pernah masuk";
    case "ignored": return reason === "auth-failed" ? "diabaikan: tanda tangan email tidak lolos" : reason === "sender-not-allowed" ? "diabaikan: bukan dari bank atau e-wallet yang dikenal" : reason === "secret" ? "diabaikan: berisi kode OTP atau PIN" : "diabaikan: bukan email transaksi";
    case "failed": return "tidak terbaca";
    default: return "";
  }
};

/** The user's script address and how it is doing. `live` keeps it fresh while a screen that waits for the first mail is open. */
export function useHook(live = false) {
  const [hook, setHook] = useState<HookInfo | null>(null);
  const refresh = useCallback(async () => { try { const h = await getHook(); setHook(h); return h; } catch { return null; } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (!live) return; const t = window.setInterval(() => { void refresh(); }, 4000); return () => window.clearInterval(t); }, [live, refresh]);
  return { hook, refresh, setHook };
}

const STEPS = ["Skrip", "Proyek", "Izin", "Uji"];

export function AppsScriptSheet({ onClose, ctx, hook, setHook, refresh, rotate }: { onClose: () => void; ctx: FinCtx; hook: HookInfo | null; setHook: (h: HookInfo) => void; refresh: () => Promise<HookInfo | null>; rotate: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const ready = Boolean(hook?.enabled && hook.script);
  useEffect(() => {      // the script is made the moment the sheet opens, like the forwarding address
    if (hook && !hook.enabled && hook.available !== false) { setBusy(true); createHook().then(setHook).catch(() => ctx.notify("Skrip belum bisa dibuat. Coba lagi.")).finally(() => setBusy(false)); }
  }, [hook?.enabled, hook?.available]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setInterval(() => { void refresh(); }, 4000); return () => window.clearInterval(t); }, [refresh]);
  const copy = async () => { if (hook?.script && await copyText(hook.script)) { setCopied(true); window.setTimeout(() => setCopied(false), 1800); } else ctx.notify("Tidak bisa menyalin. Buka “Lihat isi skrip”, lalu pilih dan salin manual."); };
  const received = (hook?.received ?? 0) > 0;
  const CopyBtn = <Btn type="button" className="dpx-btn" disabled={!ready} onClick={() => void copy()}><Ic n="copy" size="sm" /> {copied ? "Skrip tersalin" : "Salin skrip"}</Btn>;
  return <Sheet title="Lewat Apps Script" onClose={onClose}>
    <div className="dpx-stepper" aria-label={`Langkah ${step + 1} dari ${STEPS.length}`}>{STEPS.map((s, i) => <span key={s} className={i === step ? "dpx-on" : i < step ? "dpx-done" : ""}><i>{i < step ? <Ic n="check" size="sm" /> : i + 1}</i>{s}</span>)}</div>

    {hook && hook.available === false ? <div className="dpx-note dpx-danger" role="alert"><Ic n="warn" /><div><b>Belum tersedia di server ini.</b> Coba lagi nanti.</div></div> : null}

    {step === 0 ? <>
      <p className="dpx-sub">Skrip kecil di <b>akun Google-mu sendiri</b> memeriksa email bank dan e-wallet tiap 5 menit, lalu mengirimnya ke Djiwa Pay. Djiwa Pay tidak meminta izin baca Gmail.</p>
      <ul className="dpx-as-list">
        <li><Ic n="check" size="sm" /> Hanya email dari bank dan e-wallet yang dikenal yang dikirim.</li>
        <li><Ic n="check" size="sm" /> Tidak membalas, menghapus, atau mengubah email apa pun.</li>
        <li><Ic n="check" size="sm" /> Tanpa batas pengguna dan tanpa akun tambahan. Gratis.</li>
      </ul>
      <div className="dpx-note dpx-info"><Ic n="shield" /><div><b>Alamat di dalam skrip itu rahasia.</b> Jangan dibagikan. Kalau bocor, tekan “Buat alamat baru” di halaman Integrasi: alamat lama langsung mati.</div></div>
      {CopyBtn}
      <button type="button" className="dpx-as-peek" onClick={() => setShowCode((v) => !v)} aria-expanded={showCode}>{showCode ? "Sembunyikan isi skrip" : "Lihat isi skrip"}</button>
      {showCode && hook?.script ? <pre className="dpx-as-code" tabIndex={0} aria-label="Isi skrip">{hook.script}</pre> : null}
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn" style={{ margin: 0 }} disabled={!ready} onClick={() => setStep(1)}>Lanjut</Btn></div>
    </> : null}

    {step === 1 ? <>
      <div className="dpx-note dpx-info"><Ic n="shield" /><div><b>Satu skrip untuk semua.</b> Selain bank dan e-wallet, skrip ini juga mengenali pembayaran dari toko, marketplace, gaji, dan pengirim lain. Semua yang bukan dari bank selalu kamu konfirmasi dulu: pemasukan atau pengeluaran. Promosi, spam, kode OTP, dan email yang kamu kirim sendiri tidak ikut, dan isi email tidak disimpan.</div></div>
      <p className="dpx-sub">Tempel skrip ke proyek Apps Script baru. Pakai akun Google yang sama dengan Gmail tempat email bank masuk.</p>
      <ol className="dpx-howto">
        <li>Tekan <b>Buka Apps Script</b> di bawah. Halaman baru terbuka dengan proyek kosong.</li>
        <li>Di editor, <b>hapus semua kode bawaan</b> (<code>function myFunction() {"{}"}</code>).</li>
        <li>Tekan <b>Salin skrip</b>, lalu <b>tempel</b> di editor kosong tadi.</li>
        <li>Tekan ikon disket (atau <b>Ctrl/Cmd + S</b>) untuk menyimpan. Beri nama proyek, misalnya <b>Djiwa Pay</b>.</li>
      </ol>
      <a className="dpx-btn dpx-ghost dpx-linkbtn2" href="https://script.new" target="_blank" rel="noreferrer"><Ic n="link" size="sm" /> Buka Apps Script</a>
      {CopyBtn}
      <div className="dpx-note"><Ic n="info" /><div>Kalau browser memakai beberapa akun Google, periksa foto profil di pojok kanan atas Apps Script. Harus akun yang menerima email bank.</div></div>
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep(0)}>Kembali</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={() => setStep(2)}>Sudah ditempel</Btn></div>
    </> : null}

    {step === 2 ? <>
      <p className="dpx-sub">Jalankan skrip satu kali untuk memberi izin dan memasang pemeriksaan otomatis.</p>
      <ol className="dpx-howto">
        <li>Di bilah atas editor, buka menu pilihan fungsi (di samping <b>Debug</b>) dan pilih <b>pasang</b>.</li>
        <li>Tekan <b>Jalankan</b>. Muncul <b>Perlu otorisasi</b>: tekan <b>Tinjau izin</b>, lalu pilih akunmu.</li>
        <li>Google menulis <b>“Google belum memverifikasi aplikasi ini”</b>. Itu wajar: skrip ini milikmu sendiri, bukan aplikasi Djiwa Pay. Tekan <b>Lanjutan</b>, lalu <b>Buka Djiwa Pay (tidak aman)</b>.</li>
        <li>Tekan <b>Izinkan</b>. Di panel <b>Log eksekusi</b> akan tertulis <b>Selesai</b>.</li>
      </ol>
      <div className="dpx-note dpx-info"><Ic n="shield" /><div><b>Soal kata-kata izinnya.</b> Google bisa menulis “membaca, menulis, mengirim, dan menghapus email”. Itu cara Apps Script menyebut semua akses Gmail. Skrip ini hanya <b>mencari dan membaca</b> email bank, dan kamu bisa memeriksa sendiri isinya di langkah pertama. Skrip berjalan di akunmu, tidak di server kami.</div></div>
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep(1)}>Kembali</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={() => setStep(3)}>Sudah “Selesai”</Btn></div>
    </> : null}

    {step === 3 ? <>
      <div className={`dpx-codebox ${received ? "dpx-got" : ""}`} aria-live="polite">
        {received
          ? <><Ic n="check" size="lg" /><b style={{ fontSize: 17 }}>Terhubung</b><small>{hook!.received} email diterima · {ago(hook!.lastAt)}{hookStatusText(hook!.lastStatus, hook!.lastReason) ? ` · terakhir ${hookStatusText(hook!.lastStatus, hook!.lastReason)}` : ""}. Notifikasi pembayaran berikutnya tercatat otomatis, paling lambat 5 menit setelah masuk.</small></>
          : <><span className="dpx-pulse" aria-hidden="true" /><span>Menunggu skrip mengirim email pertama… biasanya kurang dari satu menit. Halaman ini memeriksa otomatis.</span><small>Pertama kali jalan, skrip mengambil email 7 hari terakhir. Kalau tidak ada email bank dalam seminggu ini, tunggu notifikasi berikutnya.</small></>}
      </div>
      <details className="dpx-as-faq"><summary>Tidak ada yang masuk?</summary>
        <ul>
          <li>Pastikan log eksekusi menulis <b>Selesai</b>. Kalau ada pesan merah, salin pesannya ke Bantuan.</li>
          <li>Buka ikon jam (<b>Pemicu</b>) di Apps Script: harus ada pemicu <b>sinkron</b> “tiap 5 menit”. Kalau tidak ada, jalankan <b>pasang</b> lagi.</li>
          <li>Pastikan akun Google di Apps Script sama dengan Gmail yang menerima email bank.</li>
          <li>Pesan <b>“Alamat tidak berlaku lagi”</b> berarti alamat sudah diganti. Salin skrip yang baru dan tempel ulang.</li>
        </ul></details>
      <details className="dpx-as-faq"><summary>Email lama dan berhenti</summary>
        <ul>
          <li>Skrip mengambil <b>7 hari terakhir</b> saat pertama jalan. Untuk lebih lama, ubah angka <code>HARI_AWAL</code> di baris atas skrip <b>sebelum</b> menjalankan <b>pasang</b>. Email lama yang jelas langsung tercatat.</li>
          <li>Berhenti: jalankan fungsi <b>berhenti</b>, atau hapus proyeknya. Lalu tekan <b>Matikan</b> di halaman Integrasi.</li>
          <li>Skrip ini bisa dipakai bersama email terusan. Email yang sama tidak dicatat dua kali.</li>
        </ul></details>
      <div className="dpx-flex dpx-mt"><Btn type="button" className="dpx-btn dpx-soft" style={{ margin: 0 }} onClick={() => setStep(2)}>Kembali</Btn><Btn type="button" className="dpx-btn" style={{ margin: 0 }} onClick={onClose}>{received ? "Selesai" : "Selesaikan nanti"}</Btn></div>
      {ready ? <button type="button" className="dpx-as-peek" disabled={busy} onClick={() => { setBusy(true); void rotate().finally(() => setBusy(false)); setStep(0); }}>Buat alamat baru (alamat lama berhenti)</button> : null}
    </> : null}
  </Sheet>;
}
