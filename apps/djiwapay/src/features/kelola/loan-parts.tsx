import "./loan.css";
import { Ic } from "../shell/dpx-ui";
import { bpsLabel, dayLabel, pct2, useBiRate } from "../../lib/finance/rates";

/** Bank Indonesia's policy rate, with the last decision. It is a signal for floating KPR rates, not the rate a bank charges. */
export function BiRateChip() {
  const bi = useBiRate(), c = bi?.current;
  if (!bi) return <div className="dpx-ln-bi"><Ic n="bank" /><div><b>BI-Rate</b><small>Memuat dari Bank Indonesia…</small></div></div>;
  if (!c) return <div className="dpx-ln-bi"><Ic n="bank" /><div><b>BI-Rate</b><small>Belum tersedia. Coba lagi nanti.</small></div></div>;
  const bps = c.lastChange && c.lastChange.day === c.day ? c.lastChange.bps : 0, cls = bps > 0 ? "dpx-ln-up" : bps < 0 ? "dpx-ln-down" : "dpx-ln-flat";
  return <a className="dpx-ln-bi" href={bi.sourceUrl} target="_blank" rel="noreferrer" aria-label={`BI-Rate ${pct2(c.rate)}, keputusan ${dayLabel(c.day)}. Sumber Bank Indonesia`}>
    <Ic n="bank" /><div><b>BI-Rate {pct2(c.rate)}</b><small>Keputusan {dayLabel(c.day)} · sumber Bank Indonesia{bi.stale ? " · data lama" : ""}</small></div>
    <span className={`dpx-ln-tag ${cls}`}>{bps === 0 ? (c.lastChange ? `tetap sejak ${dayLabel(c.lastChange.day).replace(/ \d{4}$/, "")}` : "tetap") : `${bps > 0 ? "▲" : "▼"} ${bpsLabel(bps)}`}</span>
  </a>;
}
