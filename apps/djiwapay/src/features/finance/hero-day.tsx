import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber, Btn, I3, Ic, spring } from "../shell/dpx-ui";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";

type Safe = { limit: number; used: number; left: number; daysLeft: number; perDay: number; percent: number };
type Props = {
  empty: boolean; safe: Safe | null; visible: boolean; spent: number; now: Date; templates: Entry[]; ring: ReactNode;
  onAddTemplate: (e: Entry) => void; onOpenBudget: () => void; onOpenCatat: () => void;
};

const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const mask = (visible: boolean, text: string) => (visible ? text : "•••••");
const PRESETS = [1_500_000, 3_000_000, 5_000_000, 8_000_000];
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
  const [limit, setLimit] = useState(3_000_000);
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
    const left = limit - spent, perDay = Math.max(0, Math.floor(left / daysLeft));
    const usedPct = Math.min(100, Math.round((spent / limit) * 100));
    return <motion.div className="dpx-hd dpx-hd-plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="dpx-hd-eyebrow">Rencana bulan ini</div>
      <h2 className="dpx-hd-h">Berapa jatah belanjamu?</h2>
      <div className="dpx-hd-big" aria-live="polite">
        <small>Aman dibelanjakan per hari</small>
        <b><span>Rp</span>{visible ? <AnimatedNumber value={perDay} /> : "•••••"}</b>
      </div>
      <input className="dpx-hd-range" type="range" min={500_000} max={15_000_000} step={250_000} value={limit} aria-label="Simulasi anggaran bulanan" onChange={(e) => setLimit(Number(e.target.value))}
        style={{ ["--pct" as string]: `${((limit - 500_000) / 14_500_000) * 100}%` }} />
      <div className="dpx-hd-presets">{PRESETS.map((v) => <Btn key={v} type="button" className={`dpx-hd-pre ${limit === v ? "on" : ""}`} onClick={() => setLimit(v)} aria-pressed={limit === v}>{short(v)}</Btn>)}</div>
      <div className="dpx-hd-stats">
        <div><small>Anggaran</small><b>{mask(visible, rupiah(limit))}</b></div>
        <div><small>Terpakai</small><b>{mask(visible, rupiah(spent))}</b></div>
        <div><small>Sisa hari</small><b>{daysLeft} hari</b></div>
      </div>
      <div className="dpx-hd-track" aria-hidden="true"><motion.i animate={{ width: `${usedPct}%` }} transition={spring} className={left < 0 ? "bad" : ""} /></div>
      <Btn type="button" className="dpx-hd-btn wide" onClick={p.onOpenBudget}>Atur anggaran sungguhan <Ic n="chev" size="sm" /></Btn>
      <p className="dpx-hd-note">Geser untuk simulasi. Anggaran baru tersimpan setelah Anda mengaturnya.</p>
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
