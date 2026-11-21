import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Btn, spring } from "../shell/dpx-ui";
import { DragRow } from "./story-charts";

/** Calendar day in the device's own time zone, "YYYY-MM-DD". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const monthKey = (d: Date) => dayKey(d).slice(0, 7);
const WEEKDAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const LONG_DAY = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" });
const LONG_MONTH = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });

type Item = { key: string; small: string; main: string; label: string; has: boolean; today: boolean };

/**
 * A row where the CHOSEN item is always the one in the middle. Swiping or dragging scrolls the row and, once it settles, whichever
 * item sits at the centre becomes the chosen one; tapping an item glides it to the centre. The pill slides between items, a dot
 * marks items that have records, and the arrow keys step through. `lead` is an extra button fixed at the left (e.g. "Semua").
 */
function CenterStrip({ items, value, onPick, label, pillId, lead }: { items: Item[]; value: string; onPick: (key: string) => void; label: string; pillId: string; lead?: ReactNode }) {
  const refs = useRef(new Map<string, HTMLElement>()), lock = useRef(0), timer = useRef(0), first = useRef(true), shape = useRef(""), valueRef = useRef(value);
  valueRef.current = value;
  const center = (key: string, smooth: boolean) => {
    const el = refs.current.get(key), row = el?.closest<HTMLElement>(".dpx-ds-row");
    if (!el || !row) return;
    lock.current = Date.now() + (smooth ? 700 : 160);   // our own scrolling must not be read back as a pick
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
  };
  const sig = `${items[0]?.key}|${items.length}`;
  useEffect(() => {   // chosen item to the middle: jump when the row is new, glide afterwards
    if (value === "all" || !refs.current.has(value)) return;
    const fresh = first.current || shape.current !== sig;
    first.current = false; shape.current = sig;
    center(value, !fresh);
  }, [value, sig]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (Date.now() < lock.current) return;
    const row = e.currentTarget;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {   // settled: the item nearest the middle is the new pick
      const mid = row.scrollLeft + row.clientWidth / 2; let best = "", d = Infinity;
      refs.current.forEach((el, k) => { const dd = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (dd < d) { d = dd; best = k; } });
      if (best && best !== valueRef.current) onPick(best);
    }, 110);
  };
  const step = (dir: number) => { const i = items.findIndex((x) => x.key === value); const n = Math.max(0, Math.min(items.length - 1, (i < 0 ? items.length - 1 : i) + dir)); if (items[n]) onPick(items[n].key); };
  return <div className="dpx-ds" role="group" aria-label={label} onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); step(1); } }}>
    {lead}
    <DragRow className="dpx-ds-row" onScroll={onScroll}>
      {items.map((it) => {
        const on = value === it.key;
        return <Btn key={it.key} type="button" ref={(el: HTMLElement | null) => { if (el) refs.current.set(it.key, el); else refs.current.delete(it.key); }} className={`dpx-ds-day ${on ? "on" : ""} ${it.has ? "has" : ""} ${it.today ? "today" : ""}`}
          aria-pressed={on} aria-label={it.label} onClick={() => onPick(it.key)} whileTap={{ scale: 0.92 }}>
          {on ? <motion.span layoutId={pillId} className="dpx-ds-pill" transition={spring} /> : null}
          <small>{it.small}</small><b>{it.main}</b><i aria-hidden="true" />
        </Btn>;
      })}
    </DragRow>
  </div>;
}

/** Every day of one month (28–31), centred on the chosen day. "Semua" clears the day so the whole month shows. */
export function DayStrip({ month, today, counts, value, onPick }: { month: string; today: Date; counts: Map<string, number>; value: string; onPick: (key: string) => void }) {
  const todayKey = dayKey(today);
  const items = useMemo<Item[]>(() => {
    const [y, m] = month.split("-").map(Number), n = new Date(y, m, 0).getDate();
    return Array.from({ length: n }, (_, i) => { const d = new Date(y, m - 1, i + 1), k = dayKey(d), c = counts.get(k) ?? 0; return { key: k, small: WEEKDAY[d.getDay()], main: String(i + 1), has: c > 0, today: k === todayKey, label: `${LONG_DAY.format(d)}${k === todayKey ? ", hari ini" : ""}, ${c ? `${c} catatan` : "tanpa catatan"}` }; });
  }, [month, counts, todayKey]);
  return <CenterStrip items={items} value={value} onPick={onPick} label="Pilih tanggal" pillId="dpx-ds-pill-day"
    lead={<Btn type="button" className={`dpx-ds-all ${value === "all" ? "on" : ""}`} aria-pressed={value === "all"} onClick={() => onPick("all")} whileTap={{ scale: 0.94 }}>
      {value === "all" ? <motion.span layoutId="dpx-ds-pill-day" className="dpx-ds-pill" transition={spring} /> : null}<span>Semua</span></Btn>} />;
}

/** One item per month, oldest left, current month right, centred on the chosen month. */
export function MonthStrip({ months, today, counts, value, onPick }: { months: string[]; today: Date; counts: Map<string, number>; value: string; onPick: (key: string) => void }) {
  const nowKey = monthKey(today);
  const items = useMemo<Item[]>(() => months.map((k) => { const [y, m] = k.split("-").map(Number), c = counts.get(k) ?? 0; return { key: k, small: String(y), main: MONTH[m - 1], has: c > 0, today: k === nowKey, label: `${LONG_MONTH.format(new Date(y, m - 1, 1))}${k === nowKey ? ", bulan ini" : ""}, ${c ? `${c} catatan` : "tanpa catatan"}` }; }), [months, counts, nowKey]);
  return <CenterStrip items={items} value={value} onPick={onPick} label="Pilih bulan" pillId="dpx-ds-pill-month" />;
}
