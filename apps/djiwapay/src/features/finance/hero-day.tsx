import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber, Btn, I3, Ic, spring } from "../shell/dpx-ui";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";
import "./hero-data.css";

type Safe = { limit: number; used: number; left: number; daysLeft: number; perDay: number; percent: number };
/** Real figures for the month so far, used when no budget is set. Nothing here is a simulation. */
export type SpendPlan = {
  day: number; total: number; spent: number; perDay: number; projected: number; prevToDate: number; prevOut: number; avgPrev: number | null; suggested: number | null;
  top: { id: string; name: string; amount: number; pct: number }[];
};
type Props = {
  empty: boolean; safe: Safe | null; visible: boolean; spent: number; now: Date; templates: Entry[]; ring: ReactNode; plan: SpendPlan;
  onAddTemplate: (e: Entry) => void; onOpenBudget: () => void; onOpenCatat: () => void;
};

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const mask = (visible: boolean, text: string) => (visible ? text : "•••••");
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : `${Math.round(n / 1000)} rb`);

function QuickAdd({ templates, onAdd }: { templates: Entry[]; onAdd: (e: Entry) => void }) {
  const [done, setDone] = useState<string | null>(null);
  if (!templates.length) return null;
  return <div className="dpx-hd-quick">
    <div className="dpx-hd-quick-t">Catat ulang cepat</div>
    <div className="dpx-hd-quick-row" role="list">
      {templates.map((e) => <Btn key={e.id} role="listitem" type="button" className={`dpx-hd-chip ${done === e.id ? "ok" : ""}`} onClick={() => { onAdd(e); setDone(e.id); setTimeout(() => setDone(null), 1400); }} aria-label={`Catat ulang ${e.note} ${rupiah(e.amount)}`}>
        <span className="dpx-hd-chip-i">{done === e.id ? <Ic n="check" size="sm" /> : <Ic n="plus" size="sm" />}</span>
        <span className="dpx-hd-chip-n">{e.note}</span><b>{short(e.amount)}</b>
      </Btn>)}
    </div>
  </div>;
}

/** Atas Beranda: tiga keadaan (belum ada catatan, belum ada anggaran, ada anggaran) dengan interaksi. */
export function HeroDay(p: Props) {
  const { empty, safe, visible, spent, now } = p;
  const total = daysInMonth(now), day = now.getDate(), daysLeft = Math.max(1, total - day + 1);
  const [mode, setMode] = useState<"day" | "month">("day");

  if (empty && !safe) return <motion.div className="dpx-hd dpx-hd-first" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
    <I3 name="sales-report" px={96} style={{ position: "absolute", right: 8, top: 40 }} />
    <div className="dpx-hd-eyebrow">Belum ada catatan</div>
    <h2 className="dpx-hd-h">Mulai dari satu catatan.</h2>
    <p className="dpx-hd-p">Tulis “kopi 25rb”, foto struk, atau atur anggaran. Sisanya kami hitung.</p>
    <div className="dpx-hd-cta">
      <Btn type="button" className="dpx-hd-btn" onClick={p.onOpenCatat}><Ic n="plus" size="sm" /> Catat pertama</Btn>
      <Btn type="button" className="dpx-hd-btn soft" onClick={p.onOpenBudget}>Atur anggaran</Btn>
    </div>
  </motion.div>;

  if (!safe) {
    const pl = p.plan, delta = pl.prevToDate > 0 ? Math.round(((spent - pl.prevToDate) / pl.prevToDate) * 100) : null;
    return <motion.div className="dpx-hd dpx-hd-data" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="dpx-hd-top"><span className="dpx-hd-eyebrow">Pengeluaran bulan ini</span><span className="dpx-hd-eyebrow">Hari ke-{day} dari {total}</span></div>
      <div className="dpx-hd-spent" aria-live="polite"><b><span>Rp</span>{visible ? <AnimatedNumber value={spent} /> : "•••••••"}</b>
        {delta !== null ? <span className={`dpx-hd-delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta)}% dari bulan lalu di tanggal yang sama</span> : <span className="dpx-hd-delta">Belum ada pembanding bulan lalu</span>}</div>
      <div className="dpx-hd-stats">
        <div><small>Rata-rata per hari</small><b>{mask(visible, rupiah(pl.perDay))}</b></div>
        <div><small>Perkiraan akhir bulan</small><b>{mask(visible, rupiah(pl.projected))}</b></div>
        <div><small>Total bulan lalu</small><b>{pl.prevOut ? mask(visible, rupiah(pl.prevOut)) : "—"}</b></div>
      </div>
      {pl.top.length ? <div className="dpx-hd-cats"><div className="dpx-hd-cats-t">Paling banyak ke mana</div>
        {pl.top.map((c) => <div key={c.id} className="dpx-hd-cat"><span>{c.name}</span><div className="dpx-hd-track" aria-hidden="true"><motion.i animate={{ width: `${Math.max(3, c.pct)}%` }} transition={spring} /></div><b>{mask(visible, rupiah(c.amount))}</b></div>)}
      </div> : null}
      <div className="dpx-hd-adv">
        <div><b>Belum ada anggaran</b><span>{pl.suggested ? <>{pl.avgPrev ? `Rata-rata ${rupiah(pl.avgPrev)} per bulan. ` : ""}Anggaran yang pas untukmu sekitar <b>{mask(visible, rupiah(pl.suggested))}</b>.</> : "Atur batas bulanan agar kami bisa menghitung jatah harianmu."}</span></div>
        <Btn type="button" className="dpx-hd-btn" onClick={p.onOpenBudget}>Atur anggaran <Ic n="chev" size="sm" /></Btn>
      </div>
      <QuickAdd templates={p.templates} onAdd={p.onAddTemplate} />
    </motion.div>;
  }

  const over = safe.left < 0;
  const timePct = Math.round((day / total) * 100), spendPct = Math.min(100, Math.round(safe.percent));
  const pace = over ? "bad" : spendPct > timePct + 8 ? "warn" : "ok";
  const label = over ? "Terlampaui" : pace === "warn" ? "Agak boros" : "Aman";
  return <motion.div className={`dpx-hd dpx-hd-safe ${pace}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
    <div className="dpx-hd-top"><span className={`dpx-hd-state ${pace}`}>{label}</span><span className="dpx-hd-eyebrow">Hari ke-{day} dari {total}</span></div>
    <div className="dpx-hd-main">
      <div className="dpx-hd-ring">{p.ring}</div>
      <Btn type="button" className="dpx-hd-swap" onClick={() => setMode((m) => (m === "day" ? "month" : "day"))} aria-label="Ganti tampilan: jatah harian atau sisa bulan ini">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={mode} className="dpx-hd-swap-in" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
            <small>{mode === "day" ? (over ? "Anggaran bulan ini terlampaui" : "Aman dibelanjakan hari ini") : "Sisa anggaran bulan ini"}</small>
            <b className={over ? "bad" : ""}>{mask(visible, mode === "day" ? (over ? "−" : "") + rupiah(over ? -safe.left : safe.perDay) : rupiah(safe.left))}</b>
            <em>{mode === "day" ? (over ? "Kurangi pengeluaran atau naikkan anggaran." : `Sisa ${mask(visible, rupiah(safe.left))} untuk ${safe.daysLeft} hari lagi.`) : `${mask(visible, rupiah(safe.used))} dari ${mask(visible, rupiah(safe.limit))} terpakai`}</em>
          </motion.span>
        </AnimatePresence>
      </Btn>
    </div>
    <div className="dpx-hd-pace" aria-label={`Waktu berjalan ${timePct}%, anggaran terpakai ${spendPct}%`}>
      <div><span>Waktu berjalan</span><b>{timePct}%</b><div className="dpx-hd-track"><motion.i className="time" animate={{ width: `${timePct}%` }} transition={spring} /></div></div>
      <div><span>Anggaran terpakai</span><b>{spendPct}%</b><div className="dpx-hd-track"><motion.i className={pace === "ok" ? "" : pace} animate={{ width: `${spendPct}%` }} transition={spring} /></div></div>
    </div>
    <div className="dpx-hd-tap">Ketuk angka untuk berganti tampilan</div>
    <QuickAdd templates={p.templates} onAdd={p.onAddTemplate} />
  </motion.div>;
}
