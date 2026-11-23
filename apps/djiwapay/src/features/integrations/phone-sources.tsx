import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, Sheet } from "../shell/dpx-ui";
import type { FinCtx } from "../finance/fin-pages";
import { rupiah } from "../../lib/djiwa-pay-format";
import { getNotifConfig, notifStatus, notifSupported, openNotifSettings, syncNotifications, type NotifConfig } from "../../lib/native-notif";
import { entryFor, parseOnServer, pdfText, reconcile, type ParsedStatement, type StatementRow } from "../../lib/finance/statement";
import type { Account, Entry } from "../../lib/finance/types";

const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "baru saja" : m < 60 ? `${m} menit lalu` : m < 1440 ? `${Math.round(m / 60)} jam lalu` : `${Math.round(m / 1440)} hari lalu`; };

/** Sends what the phone collected while the app was closed, whenever the app comes to the front and now and then while it is open. */
export function useNotifSync(onResult?: (recorded: number, review: number) => void) {
  const cb = useRef(onResult); cb.current = onResult;
  useEffect(() => {
    if (!notifSupported()) return;
    const run = async () => { const r = await syncNotifications(); if (r && (r.recorded || r.review)) cb.current?.(r.recorded, r.review); };
    void run();
    const onVisible = () => { if (document.visibilityState === "visible") void run(); };
    document.addEventListener("visibilitychange", onVisible);
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void run(); }, 45_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.clearInterval(t); };
  }, []);
}

export function useNotifState() {
  const [cfg, setCfg] = useState<NotifConfig | null>(null), [st, setSt] = useState<{ enabled: boolean; pending: number } | null>(null);
  const refresh = useCallback(async () => { try { setCfg(await getNotifConfig()); } catch { /* offline */ } setSt(await notifStatus()); }, []);
  useEffect(() => { void refresh(); const f = () => { if (document.visibilityState === "visible") void refresh(); }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [refresh]);
  return { cfg, st, refresh, supported: notifSupported() };
}

/** Which apps are watched, and why it is safe: the person sees exactly what is read before turning it on. */
export function NotifSheet({ cfg, enabled, onClose, onOpenSettings }: { cfg: NotifConfig | null; enabled: boolean; onClose: () => void; onOpenSettings: () => void }) {
  const groups = useMemo(() => [["Bank", "bank"], ["E-wallet", "ewallet"], ["Tagihan dan cicilan", "service"]].map(([label, kind]) => ({ label, apps: (cfg?.apps ?? []).filter((a) => a.kind === kind) })), [cfg]);
  return <Sheet title="Catat dari notifikasi ponsel" onClose={onClose}>
    <p className="dpx-sub" style={{ marginTop: -6 }}>Transaksi di m-banking atau e-wallet yang tidak dikirimi email tetap tercatat, karena notifikasinya dibaca di ponsel ini.</p>
    <div className="dpx-ph-points">
      <div><Ic n="shield" size="sm" /><span><b>Hanya aplikasi keuangan.</b> Notifikasi WhatsApp, pesan, dan aplikasi lain tidak pernah dibaca.</span></div>
      <div><Ic n="check" size="sm" /><span><b>Lewat pemeriksaan yang sama dengan email.</b> Kode OTP, promo, dan pembayaran gagal diabaikan.</span></div>
      <div><Ic n="undo" size="sm" /><span><b>Tidak dobel.</b> Transaksi yang sudah dicatat dari email atau manual tidak dicatat lagi.</span></div>
    </div>
    <div className="dpx-glabel" style={{ marginTop: 14 }}>{cfg ? `${cfg.apps.length} aplikasi dipantau` : "Aplikasi dipantau"}</div>
    {groups.map((g) => g.apps.length ? <div key={g.label} className="dpx-ph-apps"><b>{g.label}</b><p>{g.apps.map((a) => a.name).join(", ")}</p></div> : null)}
    <Btn type="button" className="dpx-btn" onClick={onOpenSettings}>{enabled ? "Buka pengaturan akses" : "Nyalakan akses notifikasi"}</Btn>
    {!enabled ? <p className="dpx-hint" style={{ marginTop: 8 }}>Android akan membuka pengaturan. Pilih Djiwa Pay lalu nyalakan “Izinkan akses notifikasi”, kemudian kembali ke sini.</p> : null}
  </Sheet>;
}

type Step = "pick" | "reading" | "password" | "review";
/** e-Statement import: pick the PDF, read it, see what matches and what is missing, add only what is missing. */
export function StatementSheet({ ctx, onClose }: { ctx: FinCtx; onClose: () => void }) {
  const { fin } = ctx, accounts = useMemo(() => fin.raw.accounts.filter((a) => !a.archived), [fin.raw.accounts]);
  const [step, setStep] = useState<Step>("pick"), [file, setFile] = useState<File | null>(null), [pw, setPw] = useState(""), [err, setErr] = useState(""), [st, setSt] = useState<ParsedStatement | null>(null);
  const [acc, setAcc] = useState<string>(""), [tab, setTab] = useState<"missing" | "matched" | "extra">("missing"), [off, setOff] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);

  const read = async (f: File, password?: string) => {
    setErr(""); setStep("reading");
    try {
      const text = await pdfText(f, password);
      if (text.replace(/\s/g, "").length < 120) { setErr("PDF ini tidak berisi teks yang bisa dibaca (mungkin hasil scan). Unduh e-statement aslinya dari m-banking."); setStep("pick"); return; }
      const parsed = await parseOnServer(text);
      if (!parsed.rows.length) { setErr("Tidak ada transaksi yang terbaca dari file ini."); setStep("pick"); return; }
      setSt(parsed); setAcc(guessAccount(accounts, parsed)); setOff(new Set()); setTab("missing"); setStep("review");
    } catch (e) {
      if (e instanceof Error && e.message === "PASSWORD") { setStep("password"); if (password) setErr("Kata sandi salah. Coba lagi."); return; }
      setErr("Belum bisa membaca file ini. Coba lagi sebentar lagi."); setStep("pick");
    }
  };
  const pick = (f: File | undefined) => { if (!f) return; setFile(f); setPw(""); void read(f); };

  // A wallet made from e-mail may be split by account digits (email-bca, email-bca-4821): one bank statement covers all of them.
  const ids = useMemo(() => { const base = acc.startsWith("email-") ? acc.replace(/-\d{2,}$/, "") : ""; return new Set(accounts.filter((a) => a.id === acc || (base && (a.id === base || a.id.startsWith(`${base}-`)))).map((a) => a.id)); }, [accounts, acc]);
  const rec = useMemo(() => st && acc ? reconcile(st.rows, fin.raw.entries, ids, { from: st.periodFrom, to: st.periodTo }) : null, [st, acc, ids, fin.raw.entries]);
  const key = (r: StatementRow, i: number) => `${r.date}|${r.amount}|${r.direction}|${i}`;
  const chosen = rec ? rec.missing.filter((r, i) => !off.has(key(r, i))) : [];
  const add = () => {
    if (!rec || !acc) return;
    const made: Entry[] = chosen.map((r) => entryFor(r, acc));
    fin.dispatch({ type: "entry/addMany", entries: made });
    ctx.notify(`${made.length} transaksi dari e-statement ditambahkan`, () => { for (const e of made) fin.dispatch({ type: "entry/delete", id: e.id }); });
    onClose();
  };

  return <Sheet title="Impor e-statement bank" onClose={onClose}>
    <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    <AnimatePresence mode="wait" initial={false}>
      {step === "pick" ? <motion.div key="pick" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <p className="dpx-sub" style={{ marginTop: -6 }}>Unggah e-statement bulanan (PDF) dari bank mana pun. Djiwa Pay mencocokkannya dengan catatanmu: yang sudah ada dilewati, hanya yang belum tercatat yang ditawarkan.</p>
        <button type="button" className="dpx-ph-drop" onClick={() => input.current?.click()}><Ic n="dl" /><b>Pilih file PDF</b><span>BCA, Mandiri, BRI, BNI, CIMB, Jago, SeaBank, blu, dan lainnya</span></button>
        {err ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 10 }}><Ic n="warn" /><div>{err}</div></div> : null}
        <p className="dpx-hint" style={{ marginTop: 10 }}>PDF dibuka di ponselmu. Hanya teksnya yang dikirim untuk dibaca, nomor rekening disamarkan jadi 4 digit terakhir, dan tidak ada yang disimpan di server.</p>
      </motion.div> : null}
      {step === "reading" ? <motion.div key="reading" className="dpx-ph-reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}><Ic n="refresh" size="lg" /></motion.span><b>Membaca e-statement…</b><span>Biasanya beberapa detik. Statement panjang bisa sampai satu menit.</span>
      </motion.div> : null}
      {step === "password" ? <motion.div key="pw" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <p className="dpx-sub" style={{ marginTop: -6 }}>File ini dikunci kata sandi. Biasanya tanggal lahir atau 6 digit yang diberi tahu bank saat mendaftar e-statement. Kata sandi hanya dipakai di ponsel ini dan tidak dikirim.</p>
        <label className="dpx-field"><span>Kata sandi PDF</span><div className="dpx-input"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="off" /></div></label>
        {err ? <div className="dpx-note dpx-danger" role="alert" style={{ marginTop: 8 }}><Ic n="warn" /><div>{err}</div></div> : null}
        <Btn type="button" className="dpx-btn" disabled={!pw || !file} onClick={() => file && void read(file, pw)}>Buka</Btn>
      </motion.div> : null}
      {step === "review" && st && rec ? <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
        <div className="dpx-ph-sum"><div><b>{st.bank || "Statement"}{st.accountHint ? ` ••${st.accountHint}` : ""}</b><span>{st.periodFrom && st.periodTo ? `${dshort(st.periodFrom)} – ${dshort(st.periodTo)}` : `${st.rows.length} transaksi`}</span></div>
          {st.balanced === true ? <i className="is-ok"><Ic n="check" size="sm" /> Saldo cocok</i> : st.balanced === false ? <i className="is-warn"><Ic n="warn" size="sm" /> Saldo belum cocok</i> : null}</div>
        {st.balanced === false ? <p className="dpx-hint">Saldo awal ditambah mutasi tidak sama dengan saldo akhir, jadi sebagian baris mungkin tidak terbaca. Periksa daftar sebelum menambahkan.</p> : null}
        <label className="dpx-field"><span>Statement ini untuk dompet</span><div className="dpx-input"><select value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Dompet">{[{ id: "", name: "Pilih dompet…" } as Account, ...accounts].map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div></label>
        {acc ? <>
          <div className="dpx-ph-tabs" role="tablist">{([["missing", `Belum tercatat · ${rec.missing.length}`], ["matched", `Cocok · ${rec.matched.length}`], ["extra", `Hanya di catatan · ${rec.extra.length}`]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
          <div className="dpx-ph-list">
            {tab === "missing" ? rec.missing.map((r, i) => <button key={key(r, i)} type="button" className={`dpx-ph-row ${off.has(key(r, i)) ? "off" : ""}`} onClick={() => setOff((s) => { const n = new Set(s); n.has(key(r, i)) ? n.delete(key(r, i)) : n.add(key(r, i)); return n; })} aria-pressed={!off.has(key(r, i))}>
              <span className="dpx-ph-tick">{off.has(key(r, i)) ? null : <Ic n="check" size="sm" />}</span><span className="dpx-ph-d"><b>{r.description || (r.direction === "in" ? "Uang masuk" : "Pengeluaran")}</b><small>{dshort(r.date)}</small></span><span className={`dpx-ph-a ${r.direction === "in" ? "in" : ""}`}>{r.direction === "in" ? "+" : "−"}{rupiah(r.amount)}</span></button>) : null}
            {tab === "matched" ? rec.matched.map((m, i) => <div key={i} className="dpx-ph-row static"><span className="dpx-ph-tick ok"><Ic n="check" size="sm" /></span><span className="dpx-ph-d"><b>{m.row.description || m.entry.note}</b><small>{dshort(m.row.date)} · sudah di catatan</small></span><span className={`dpx-ph-a ${m.row.direction === "in" ? "in" : ""}`}>{m.row.direction === "in" ? "+" : "−"}{rupiah(m.row.amount)}</span></div>) : null}
            {tab === "extra" ? rec.extra.map((e) => <div key={e.id} className="dpx-ph-row static"><span className="dpx-ph-tick"><Ic n="info" size="sm" /></span><span className="dpx-ph-d"><b>{e.note}</b><small>{dshort(e.at)} · tidak ada di statement</small></span><span className={`dpx-ph-a ${e.kind === "in" ? "in" : ""}`}>{e.kind === "in" ? "+" : "−"}{rupiah(e.amount)}</span></div>) : null}
            {(tab === "missing" && !rec.missing.length) || (tab === "matched" && !rec.matched.length) || (tab === "extra" && !rec.extra.length) ? <p className="dpx-sub dpx-center" style={{ padding: 18 }}>{tab === "missing" ? "Semua transaksi di statement sudah ada di catatanmu." : "Tidak ada."}</p> : null}
          </div>
          <Btn type="button" className="dpx-btn" disabled={!chosen.length} onClick={add}>{chosen.length ? `Tambahkan ${chosen.length} transaksi` : "Tidak ada yang ditambahkan"}</Btn>
        </> : <p className="dpx-hint">Pilih dompet yang statement ini miliki, supaya hanya catatan di dompet itu yang dicocokkan.</p>}
      </motion.div> : null}
    </AnimatePresence>
  </Sheet>;
}
const dshort = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
/** The wallet whose name or e-mail id carries the statement's bank and last digits comes first. */
function guessAccount(accounts: Account[], s: ParsedStatement): string {
  const bank = s.bank.toLowerCase(), hint = s.accountHint;
  const byHint = hint ? accounts.find((a) => a.id.endsWith(`-${hint}`) || a.name.includes(hint)) : null;
  const byBank = bank ? accounts.find((a) => a.name.toLowerCase().includes(bank) || a.id.startsWith(`email-${bank.replace(/[^a-z0-9]+/g, "")}`)) : null;
  return (byHint ?? byBank)?.id ?? "";
}
