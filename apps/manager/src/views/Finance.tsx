import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";

type Data = {
  days: number;
  cash: { income: number; expense: number; net: number };
  sales: { key: string; orders: number; revenue: number }[];
  transactions: { source_id: string; tx_type: string; amount: string; category: string | null; description: string | null; merchant: string | null; tx_date: number; payment_method: string | null }[];
  byCategory: { category: string; total: number }[];
};
const money = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

export function FinanceView() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Data>(`/api/manager/finance?days=${days}`)
      .then(setData)
      .catch(() => toast.error("Keuangan belum bisa dimuat"))
      .finally(() => setLoading(false));
  }, [days]);

  const max = Math.max(1, ...(data?.sales.map((s) => s.revenue) ?? [1])) * 1.05;
  const expenseMax = Math.max(1, ...(data?.byCategory.map((s) => s.total) ?? [1]));

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[7, 30].map((d) => <button key={d} className={`btn ${days === d ? "btn-dark" : ""}`} onClick={() => setDays(d)}>{d} hari</button>)}
      </div>
      {loading && !data && <div className="label">Memuat…</div>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="panel p-3"><div className="label">Pemasukan</div><div className="mt-1 text-base font-bold">{money(data.cash.income)}</div></div>
            <div className="panel p-3"><div className="label">Pengeluaran</div><div className="mt-1 text-base font-bold">{money(data.cash.expense)}</div></div>
            <div className="panel p-3"><div className="label">Selisih</div><div className={`mt-1 text-base font-bold ${data.cash.net < 0 ? "text-brand" : ""}`}>{money(data.cash.net)}</div></div>
          </div>

          <section className="panel p-3">
            <div className="label mb-3">Penjualan per hari</div>
            <div className="flex h-32 items-end gap-1">
              {data.sales.map((s) => (
                <div key={s.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${s.key}: ${money(s.revenue)}`}>
                  <div className="w-full rounded-t bg-ink/80" style={{ height: `${Math.max(2, (s.revenue / max) * 100)}%` }} />
                  <span className="label !text-[8px]">{s.key.slice(5)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-3">
            <div className="label mb-2">Pengeluaran per kategori</div>
            {data.byCategory.length === 0 && <p className="text-sm text-mute">Belum ada pengeluaran pada periode ini.</p>}
            {data.byCategory.map((c) => (
              <div key={c.category} className="mb-2">
                <div className="flex justify-between text-[13px]"><span className="capitalize">{c.category.replace(/_/g, " ")}</span><b>{money(c.total)}</b></div>
                <div className="mt-1 h-1.5 rounded bg-line"><div className="h-full rounded bg-brand" style={{ width: `${Math.max(2, (c.total / expenseMax) * 100)}%` }} /></div>
              </div>
            ))}
          </section>

          <section className="panel p-3">
            <div className="label mb-2">Transaksi terakhir</div>
            {data.transactions.length === 0 && <p className="text-sm text-mute">Belum ada transaksi.</p>}
            <ul className="divide-y">
              {data.transactions.map((t) => (
                <li key={t.source_id} className="flex items-start justify-between gap-2 py-2 text-[13px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.merchant || t.description || t.category || "Transaksi"}</div>
                    <div className="label">{new Date(t.tx_date).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" })}{t.payment_method ? ` · ${t.payment_method}` : ""}</div>
                  </div>
                  <b className={t.tx_type === "expense" ? "text-brand" : "text-emerald-600"}>{t.tx_type === "expense" ? "−" : "+"}{money(Number(t.amount))}</b>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
