import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Btn, spring } from "../shell/dpx-ui";
import { DragRow } from "./story-charts";

/** Calendar day in the device's own time zone, "YYYY-MM-DD". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEKDAY = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const LONG = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" });

/**
 * A strip of days, oldest on the left and today on the right. The chosen day sits in a pill that slides to it and the strip
 * scrolls to centre it; a dot marks days that have records. "Semua" (outside the strip, always reachable) clears the day.
 * Tap, drag with the mouse, swipe, or use the arrow keys.
 */
export function DayStrip({ today, counts, value, onPick, span = 90 }: { today: Date; counts: Map<string, number>; value: string; onPick: (key: string) => void; span?: number }) {
  const days = useMemo(() => Array.from({ length: span }, (_, i) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (span - 1 - i)); return { d, k: dayKey(d) }; }), [today.getFullYear(), today.getMonth(), today.getDate(), span]);   // eslint-disable-line react-hooks/exhaustive-deps
  const refs = useRef(new Map<string, HTMLElement>()), first = useRef(true);
  useEffect(() => {   // bring the chosen day to the middle; jump on first paint, glide afterwards
    const el = refs.current.get(value), row = el?.closest<HTMLElement>(".dpx-ds-row");
    if (!el || !row) return;
    row.scrollTo({ left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2, behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [value]);
  const step = (dir: number) => { const i = days.findIndex((x) => x.k === value); const n = Math.max(0, Math.min(days.length - 1, (i < 0 ? days.length - 1 : i) + dir)); onPick(days[n].k); };
  const todayKey = dayKey(today);
  return <div className="dpx-ds" role="group" aria-label="Pilih tanggal" onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); step(1); } }}>
    <Btn type="button" className={`dpx-ds-all ${value === "all" ? "on" : ""}`} aria-pressed={value === "all"} onClick={() => onPick("all")} whileTap={{ scale: 0.94 }}>
      {value === "all" ? <motion.span layoutId="dpx-ds-pill" className="dpx-ds-pill" transition={spring} /> : null}
      <span>Semua</span>
    </Btn>
    <DragRow className="dpx-ds-row">
      {days.map(({ d, k }, i) => {
        const on = value === k, n = counts.get(k) ?? 0;
        return <span key={k} style={{ display: "contents" }}>
          {d.getDate() === 1 && i > 0 ? <span className="dpx-ds-month" aria-hidden="true">{MONTH[d.getMonth()]}</span> : null}
          <Btn type="button" ref={(el: HTMLElement | null) => { if (el) refs.current.set(k, el); else refs.current.delete(k); }} className={`dpx-ds-day ${on ? "on" : ""} ${n ? "has" : ""} ${k === todayKey ? "today" : ""}`}
            aria-pressed={on} aria-label={`${LONG.format(d)}${k === todayKey ? ", hari ini" : ""}, ${n ? `${n} catatan` : "tanpa catatan"}`} onClick={() => onPick(k)} whileTap={{ scale: 0.92 }}>
            {on ? <motion.span layoutId="dpx-ds-pill" className="dpx-ds-pill" transition={spring} /> : null}
            <small>{WEEKDAY[d.getDay()]}</small><b>{d.getDate()}</b><i aria-hidden="true" />
          </Btn>
        </span>;
      })}
    </DragRow>
  </div>;
}
