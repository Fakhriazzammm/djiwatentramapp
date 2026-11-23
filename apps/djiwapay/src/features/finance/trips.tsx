import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring } from "../shell/dpx-ui";
import { NewBadge } from "../shell/new-badge";
import { useNewFeature } from "../../lib/finance/new-feature";
import { fmtMoney, infoOf, parseTrip } from "../../lib/finance/currency";
import { rupiah } from "../../lib/djiwa-pay-format";
import type { Entry } from "../../lib/finance/types";
import type { FinCtx } from "./fin-pages";

export type Trip = { tag: string; currency: string; month: string; label: string; flag: string; count: number; spent: number; foreign: number; refunded: number };
/** Spending made abroad, grouped by country and month from the `trip:` tag the receipt flow adds. */
export function tripsOf(entries: Entry[]): Trip[] {
  const by = new Map<string, Trip>();
  for (const e of entries) for (const tag of e.tags) {
    const t = parseTrip(tag); if (!t) continue;
    const row = by.get(tag) ?? { tag, currency: t.currency, month: t.month, label: t.label, flag: infoOf(t.currency).flag, count: 0, spent: 0, foreign: 0, refunded: 0 };
    if (e.kind === "out") { row.count++; row.spent += e.amount; row.foreign += e.foreignAmount ?? 0; } else if (e.kind === "in") row.refunded += e.amount;
    by.set(tag, row);
  }
  return [...by.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** Laporan > Ringkasan: what was spent on trips abroad, in rupiah and in the local currency. */
export function TripCard({ ctx }: { ctx: FinCtx }) {
  const trips = useMemo(() => tripsOf(ctx.fin.allRecords), [ctx.fin.allRecords]), reduce = Boolean(useReducedMotion()), nf = useNewFeature<HTMLElement>("trip-card");
  if (!trips.length) return null;
  return <motion.section ref={nf.ref} className={`dpx-trip ${nf.fresh ? "is-new" : ""}`} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label="Perjalanan luar negeri">
    <NewBadge show={nf.fresh} variant="float" />
    <b className="ttl">Perjalanan luar negeri</b>
    <small className="sub">Belanja dari struk berbahasa dan bermata uang asing</small>
    <div className="rows">{trips.map((t) => <button key={t.tag} type="button" className="r" onClick={() => ctx.nav.go(`/riwayat?bulan=${t.month}`)}>
      <span className="fl" aria-hidden="true">{t.flag}</span>
      <span className="tx"><b>{t.label}</b><small>{t.count} pembelian{t.refunded ? ` · pengembalian ${rupiah(t.refunded)}` : ""}</small></span>
      <span className="am"><b>{rupiah(t.spent)}</b>{t.foreign ? <small>{fmtMoney(t.foreign, t.currency)}</small> : null}</span>
    </button>)}</div>
  </motion.section>;
}
