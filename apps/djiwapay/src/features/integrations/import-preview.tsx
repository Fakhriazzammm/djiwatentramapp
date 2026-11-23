import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Btn, Ic, spring } from "../shell/dpx-ui";
import { CatIcon, catOf } from "../finance/fin-sheets";
import { rupiah } from "../../lib/djiwa-pay-format";
import { CHANNEL_NAME, type ImportItem, type ImportState } from "../../lib/finance/integrations";
import type { FinanceState } from "../../lib/finance/types";

const WHY: Record<string, string> = { "tanda ganjil": "ada yang janggal", "pembacaan ragu": "belum terbaca yakin", "arah tidak jelas": "masuk atau keluar tidak jelas", "pengirim layanan": "dari toko atau layanan", "nominal besar": "nominal besar", pinjaman: "cicilan atau pinjaman", lainnya: "perlu dicek" };
const monthName = (ym: string) => new Date(`${ym}-15T00:00:00+07:00`).toLocaleDateString("id-ID", { month: "short", year: "numeric" });
const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",")} jt` : n >= 1e3 ? `${Math.round(n / 1e3)} rb` : String(Math.round(n)));
const bankName = (id: string) => CHANNEL_NAME[id] ?? id.replace(/(^|-)([a-z])/g, (_m, a: string, b: string) => (a ? " " : "") + b.toUpperCase());

/** "Makan & minum › Kopi": a sub category is shown with its parent, so a specific pick is visible and not just a group. */
function catLabel(state: FinanceState, id: string) {
  const c = catOf(state, id), parent = c.parentId ? state.categories.find((x) => x.id === c.parentId) : null;
  return parent ? { main: parent.name, sub: c.name } : { main: c.name, sub: "" };
}

/** The preview of an old-mail import: what will be recorded, from which banks (each can be left out), under which categories, and what needs a look. The action bar stays in view. */
export function ImportPreview({ imp, state, items, off, onToggle, onSeeCheck, showCheck, onShare, busy, onCancel, onCommit, periodLabel }: {
  imp: ImportState; state: FinanceState; items: ImportItem[] | null; off: Set<string>; onToggle: (id: string) => void; onSeeCheck: () => void; showCheck: boolean;
  onShare: (it: ImportItem) => void; busy: boolean; onCancel: () => void; onCommit: () => void; periodLabel: string;
}) {
  const p = imp.preview!, [allMonths, setAllMonths] = useState(false);
  const banks = p.issuers ?? [], net = p.sure.income - p.sure.expense;
  const maxMonth = useMemo(() => Math.max(1, ...p.months.map((m) => Math.max(m.income, m.expense))), [p.months]);
  const maxCat = Math.max(1, ...p.categories.map((c) => c.total));
  const unsortedCat = p.categories.find((c) => c.categoryId === "lainnya"), months = allMonths ? p.months : p.months.slice(0, 4);
  const total = p.sure.count + p.check.count;
  return <div className="dpx-ip">
    <p className="dpx-sub" style={{ marginTop: -6 }}>Hasil pindai {periodLabel.toLowerCase()} terakhir. Belum ada yang dicatat sampai kamu menekan tombol di bawah.</p>

    <motion.div className="dpx-ip-hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="big"><motion.b key={p.sure.count} initial={{ scale: 1.15 }} animate={{ scale: 1 }} transition={spring}>{p.sure.count}</motion.b><span>transaksi siap dicatat{p.check.count ? `, ${p.check.count} perlu dicek` : ""}</span></div>
      <div className="duo"><div><small>Masuk</small><b className="in">+{rupiah(p.sure.income)}</b></div><div><small>Keluar</small><b>−{rupiah(p.sure.expense)}</b></div></div>
      <div className={`net ${net >= 0 ? "pos" : ""}`}>Selisih {net >= 0 ? "+" : "−"}{rupiah(Math.abs(net))}</div>
    </motion.div>

    {banks.length > 1 ? <>
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Dari bank dan e-wallet mana</div>
      <div className="dpx-ip-banks" role="group" aria-label="Pilih bank yang diimpor">
        {banks.map((b) => { const on = !off.has(b.id); return <Btn key={b.id} type="button" className={`dpx-ip-bank ${on ? "on" : ""}`} aria-pressed={on} onClick={() => onToggle(b.id)} whileTap={{ scale: 0.96 }}>
          <span className="tick">{on ? <Ic n="check" size="sm" /> : null}</span><span className="nm">{bankName(b.id)}</span><small>{b.sure + b.check}{b.expense ? ` · −${compact(b.expense)}` : ""}</small></Btn>; })}
      </div>
      {off.size ? <p className="dpx-hint" style={{ margin: "6px 4px 0" }}>{off.size} sumber dilepas: tidak dicatat dan tidak masuk antrean.</p> : null}
    </> : null}

    {p.categories.length ? <>
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Pengeluaran per kategori</div>
      <div className="dpx-ip-cats">
        {p.categories.map((c, i) => { const cat = catOf(state, c.categoryId), l = catLabel(state, c.categoryId), unsorted = c.categoryId === "lainnya"; return <motion.div key={c.categoryId} className={`dpx-ip-cat ${unsorted ? "warn" : ""}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.04 }}>
          <CatIcon cat={cat} size={30} />
          <div className="body"><div className="top"><b>{l.main}{l.sub ? <em> › {l.sub}</em> : null}</b><span>{rupiah(c.total)}</span></div>
            <div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(4, (c.total / maxCat) * 100)}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.04, ease: [0.22, 1, 0.36, 1] }} /></div>
            <small>{c.count} transaksi{unsorted ? " · belum berkategori, dirapikan otomatis setelah dicatat" : ""}</small></div>
        </motion.div>; })}
      </div>
      {unsortedCat ? <div className="dpx-note dpx-info" style={{ marginTop: 8 }}><Ic n="spark" /><div>Yang belum berkategori dikategorikan otomatis (termasuk sub-kategori) begitu dicatat, dan sisanya bisa dirapikan per toko.</div></div> : null}
    </> : null}

    {p.months.length ? <>
      <div className="dpx-glabel" style={{ marginTop: 16 }}>Per bulan</div>
      <div className="dpx-ip-months">
        <AnimatePresence initial={false}>{months.map((m) => <motion.div key={m.month} layout className="m" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
          <span className="lb">{monthName(m.month)}<small>{m.count}</small></span>
          <span className="bars" aria-hidden="true">{m.income ? <i className="in" style={{ width: `${Math.max(3, (m.income / maxMonth) * 100)}%` }} /> : null}{m.expense ? <i style={{ width: `${Math.max(3, (m.expense / maxMonth) * 100)}%` }} /> : null}</span>
          <span className="v">{m.income ? <b className="in">+{compact(m.income)}</b> : null}{m.expense ? <b>−{compact(m.expense)}</b> : null}</span>
        </motion.div>)}</AnimatePresence>
        {p.months.length > 4 ? <Btn type="button" className="dpx-linkbtn" onClick={() => setAllMonths((v) => !v)}>{allMonths ? "Ringkas" : `Lihat ${p.months.length - 4} bulan lainnya`}</Btn> : null}
      </div>
    </> : null}

    {p.check.count ? <div className="dpx-ip-check">
      <div className="head"><Ic n="warn" size="sm" /><b>{p.check.count} email perlu dicek dulu</b></div>
      {p.check.reasons?.length ? <div className="why">{p.check.reasons.map((r) => <i key={r.why}>{r.count} {WHY[r.why] ?? r.why}</i>)}</div> : null}
      <p>Ini tidak dicatat otomatis. Setelah impor, semuanya masuk antrean tinjau, dikelompokkan per toko supaya bisa disetujui sekaligus.</p>
      <Btn type="button" className="dpx-linkbtn" onClick={onSeeCheck} aria-expanded={showCheck}>{showCheck ? "Sembunyikan contoh" : "Lihat contohnya"}</Btn>
      {showCheck ? <div className="dpx-checks2">{items === null ? <div className="dpx-sub">Memuat…</div> : items.map((it) => <div key={it.id} className="dpx-checkitem"><div><b>{bankName(it.channel)}{it.parsed.amount ? ` · ${rupiah(it.parsed.amount)}` : ""}</b><span>{it.parsed.merchant || it.parsed.subject || "Tanpa judul"}</span></div><Btn type="button" className="dpx-copybtn" onClick={() => onShare(it)}><Ic n="copy" size="sm" /> Salin contoh</Btn></div>)}
        <p className="dpx-hint">“Salin contoh” menyalin teks email dengan nomor dan nama disamarkan, untuk memperbaiki pembaca email.</p></div> : null}
    </div> : null}

    {!total ? <div className="dpx-note"><Ic n="info" /><div><b>Tidak ada pembayaran ditemukan</b> di periode ini. Coba periode yang lebih panjang.</div></div> : null}

    <div className="dpx-ip-bar">
      <Btn type="button" className="dpx-btn dpx-soft" disabled={busy} onClick={onCancel}>Batalkan</Btn>
      {total ? <Btn type="button" className="dpx-btn" disabled={busy} onClick={onCommit} whileTap={{ scale: 0.98 }}>{busy ? "Mencatat…" : p.sure.count ? `Catat ${p.sure.count} transaksi` : "Pindahkan ke antrean tinjau"}</Btn> : null}
    </div>
  </div>;
}
