import type { ReactNode } from "react";

export type BreakdownLine = { name: string; /** Text as printed, when it is another language. */ orig?: string; sub?: string; subs?: string[]; amount: string };
export type BreakdownRow = { label: string; value: string; strong?: boolean };

/** One receipt-style rincian used for scanned receipts, payment e-mails and manual notes. */
export function Breakdown({ title, count, lines, rows, empty, children }: { title: string; count?: string; lines: BreakdownLine[]; rows: BreakdownRow[]; empty?: string; children?: ReactNode }) {
  return <section className="dpx-receipt-breakdown" aria-label={title}>
    <h3 className="dpx-receipt-heading">{title}{count ? <span className="dpx-rb-count">{count}</span> : null}</h3>
    {lines.length
      ? <ul className="dpx-rb-items">{lines.map((l, k) => <li key={k}><div className="dpx-rb-main"><b>{l.name}</b>{l.orig ? <small className="dpx-rb-orig">{l.orig}</small> : null}{l.sub ? <small>{l.sub}</small> : null}{l.subs?.map((s, n) => <small className="dpx-rb-sub" key={n}>{s}</small>)}</div><span className="dpx-rb-amt">{l.amount}</span></li>)}</ul>
      : <p className="dpx-hint">{empty ?? "Rincian item belum tersedia."}</p>}
    {rows.length ? <div className="dpx-rb-sum">{rows.map((r, k) => <div className={`dpx-kv ${r.strong ? "dpx-rb-total" : ""}`} key={k}><span>{r.label}</span><b>{r.value}</b></div>)}</div> : null}
    {children}
  </section>;
}
