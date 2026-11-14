import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { CH, donutHTML, fmtRp, spark, svgArea, svgHBars } from "../charts";
import { Empty, Ic, hm, rp } from "../ui";

type Data = {
  days: number;
  cash: { income: number; expense: number; net: number };
  sales: { key: string; orders: number; revenue: number }[];
  transactions: { source_id: string; tx_type: string; amount: string; category: string | null; description: string | null; merchant: string | null; tx_date: number; payment_method: string | null }[];
  byCategory: { category: string; total: number }[];
  daily: { day: string; type: string; total: number }[];
  channels: { name: string; total: number }[];
  methods: { name: string; total: number }[];
};
const CHAN: Record<string, string> = { pos: "POS", app: "Djiwa App", booking: "Booking", gofood: "GoFood", grabfood: "GrabFood", shopeefood: "ShopeeFood", telegram: "Telegram", unknown: "Lainnya" };
const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

export function FinanceView() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [trend, setTrend] = useState<"both" | "in" | "out">("both");

  useEffect(() => {
    setData(null);
    api<Data>(`/api/manager/finance?days=${days}`).then(setData).catch(() => toast.error("Keuangan belum bisa dimuat"));
  }, [days]);

  const v = useMemo(() => {
    if (!data) return null;
    const labels = data.sales.map((s) => s.key.slice(5).replace("-", "/"));
    const sum = (type: string, day: string) => data.daily.filter((d) => d.type === type && d.day === day).reduce((a, b) => a + b.total, 0);
    const inSeries = data.sales.map((s) => s.revenue);
    const outSeries = data.sales.map((s) => sum("expense", s.key));
    const orders = data.sales.reduce((a, s) => a + s.orders, 0);
    const revenue = inSeries.reduce((a, b) => a + b, 0);
    const half = Math.floor(inSeries.length / 2) || 1;
    const prev = inSeries.slice(0, half).reduce((a, b) => a + b, 0), curr = inSeries.slice(half).reduce((a, b) => a + b, 0);
    const dIn = prev ? ((curr - prev) / prev) * 100 : 0;
    const profit = revenue - data.cash.expense;
    return { labels, inSeries, outSeries, orders, revenue, dIn, profit, margin: revenue ? (profit / revenue) * 100 : 0 };
  }, [data]);

  const k = data && v ? [
    ["Pemasukan", v.revenue, sgn(v.dIn), v.inSeries, CH.blue],
    ["Pengeluaran", data.cash.expense, "", v.outSeries, CH.red],
    ["Laba kotor", v.profit, `margin ${v.margin.toFixed(0)}%`, v.inSeries.map((x, i) => x - v.outSeries[i]), CH.green],
    ["Order", v.orders, "", v.inSeries, CH.ink],
    ["Rata-rata / order", v.orders ? Math.round(v.revenue / v.orders) : 0, "", v.inSeries, CH.amber],
  ] as const : [];
  const series = v ? (trend === "in" ? [{ name: "Pemasukan", data: v.inSeries, color: CH.blue }] : trend === "out" ? [{ name: "Pengeluaran", data: v.outSeries, color: CH.red }] : [{ name: "Pemasukan", data: v.inSeries, color: CH.blue }, { name: "Pengeluaran", data: v.outSeries, color: CH.red }]) : [];

  return (
    <div className="fin">
      <div className="fh">
        <div className="tabs" style={{ margin: 0 }}>{[[1, "Kemarin"], [7, "7 hari"], [30, "30 hari"]].map(([d, l]) => <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(Number(d))}>{l}</button>)}</div>
        <span className="meta">data nyata · pos.orders &amp; pos.financial_transactions</span>
      </div>
      {!data && <div className="empty">Memuat…</div>}
      {data && v && (<>
        <div className="kpis fk" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
          {k.map((x) => (
            <div key={x[0]}><div className="kl" style={{ margin: "0 0 6px" }}>{x[0]}</div><b>{x[0] === "Order" ? x[1] : rp(x[1])}</b>{x[2] && <div className={`ks ${x[2].startsWith("−") ? "dn" : "up"}`} style={{ marginTop: 4 }}>{x[2]}</div>}
              <div className="spk" dangerouslySetInnerHTML={{ __html: spark(x[3].length > 1 ? [...x[3]] : [0, ...x[3]], x[4]) }} /></div>
          ))}
        </div>
        <div className="fgrid">
          <div className="panel s8">
            <div className="ph"><span className="lab">Tren pemasukan dan pengeluaran</span>
              <div className="tabs" style={{ margin: 0 }}>{[["both", "Keduanya"], ["in", "Pemasukan"], ["out", "Pengeluaran"]].map(([t, l]) => <button key={t} className={trend === t ? "on" : ""} onClick={() => setTrend(t as typeof trend)}>{l}</button>)}</div></div>
            <div className="pad" dangerouslySetInnerHTML={{ __html: svgArea(v.labels, series) }} />
          </div>
          <div className="panel s4">
            <div className="ph"><span className="lab">Sumber transaksi</span></div>
            <div className="pad">{data.channels.length ? <div dangerouslySetInnerHTML={{ __html: donutHTML(data.channels.map((c) => [CHAN[c.name] ?? c.name, c.total])) }} /> : <Empty>BELUM ADA DATA</Empty>}</div>
            <div className="ph" style={{ borderTop: "1px solid var(--line)" }}><span className="lab">Metode pembayaran</span></div>
            <div className="pad">{data.methods.length ? <div dangerouslySetInnerHTML={{ __html: donutHTML(data.methods.map((c) => [c.name, c.total])) }} /> : <Empty>BELUM ADA DATA</Empty>}</div>
          </div>
          <div className="panel s6">
            <div className="ph"><span className="lab">Pengeluaran per kategori</span></div>
            <div className="pad">{data.byCategory.length ? <div dangerouslySetInnerHTML={{ __html: svgHBars(data.byCategory.map((c) => [c.category.replace(/_/g, " "), c.total]), { fmtVal: fmtRp, colors: [CH.red, CH.amber, CH.purple, CH.gray] }) }} /> : <Empty>BELUM ADA PENGELUARAN</Empty>}</div>
          </div>
          <div className="panel s6">
            <div className="ph"><span className="lab">Ringkasan kas</span><span className="meta">{days} hari</span></div>
            <div className="mr"><span>Pemasukan (transaksi tercatat)</span><b className="up">{rp(data.cash.income)}</b></div>
            <div className="mr"><span>Pengeluaran</span><b style={{ color: "var(--red)" }}>{rp(data.cash.expense)}</b></div>
            <div className="mr"><span>Selisih kas</span><b>{rp(data.cash.net)}</b></div>
            <div className="mr"><span className="meta">Pemasukan dari POS, Djiwa App, dan aplikasi lain masuk otomatis ke sistem.</span></div>
          </div>
          <div className="panel s12">
            <div className="ph"><span className="lab g">Transaksi terbaru</span><span className="meta"><span className="live" style={{ padding: "3px 9px" }}>LIVE</span></span></div>
            <div className="tw2"><table>
              <thead><tr><th>Waktu</th><th>Keterangan</th><th>Kategori</th><th>Metode</th><th style={{ textAlign: "right" }}>Nominal</th></tr></thead>
              <tbody>{data.transactions.slice(0, 30).map((t) => (
                <tr key={t.source_id} className="txr">
                  <td className="mono">{hm(t.tx_date)}</td><td>{t.merchant || t.description || "Transaksi"}</td><td><span className="tg">{t.category ?? "—"}</span></td><td className="mono">{t.payment_method ?? "—"}</td>
                  <td className="mono" style={{ textAlign: "right", color: t.tx_type === "expense" ? "var(--red)" : "var(--ok)" }}>{t.tx_type === "expense" ? "−" : "+"}{rp(Number(t.amount))}</td>
                </tr>))}
              </tbody>
            </table>{data.transactions.length === 0 && <Empty>BELUM ADA TRANSAKSI</Empty>}</div>
          </div>
          <div className="panel s12 pad">
            <span className="lab"><Ic n="spark" /> Insight untuk Owner</span>
            <div className="meta" style={{ marginTop: 10 }}>Buat dokumen keuangan harian, mingguan, atau bulanan dari tab Laporan (templat “Laporan Keuangan”). Laporan terkirim ke Owner di admin.djiwatentram.web.id.</div>
          </div>
        </div>
      </>)}
    </div>
  );
}
