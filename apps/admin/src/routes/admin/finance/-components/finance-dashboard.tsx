import { FinanceDataTable } from "@/components/finance/finance-data-table";
import { useHybridCashFlowReport } from "@/hooks/use-hybrid-finance-analytics-data";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
const PERIODS = [
  { id: "today", label: "Hari Ini" },
  { id: "yesterday", label: "Kemarin" },
  { id: "this_week", label: "Minggu Ini" },
  { id: "last_week", label: "Minggu Kemarin" },
  { id: "month", label: "Bulan Ini" },
  { id: "last_month", label: "Bulan Kemarin" },
] as const;

function getRange(selected: string): { startDate?: number; endDate?: number } {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  switch (selected) {
    case "today":
      return { startDate: today };
    case "yesterday":
      return { startDate: today - 86400000, endDate: today - 1 };
    case "this_week": {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return { startDate: new Date(d.setDate(diff)).setHours(0, 0, 0, 0) };
    }
    case "last_week": {
      const d2 = new Date(now);
      const day2 = d2.getDay();
      const diff2 = d2.getDate() - day2 + (day2 === 0 ? -13 : -6);
      const lws = new Date(d2.setDate(diff2)).setHours(0, 0, 0, 0);
      return { startDate: lws, endDate: lws + 7 * 86400000 - 1 };
    }
    case "month":
      return {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      };
    case "last_month": {
      const flm = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const llm = new Date(now.getFullYear(), now.getMonth(), 0).setHours(
        23,
        59,
        59,
        999,
      );
      return { startDate: flm, endDate: llm };
    }
    default:
      return {};
  }
}

const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

export function FinanceDashboard() {
  const [selectedRange, setSelectedRange] = useState("month");
  const range = getRange(selectedRange);
  const report = useHybridCashFlowReport(range);
  const rows = Object.entries(report?.byPaymentMethod ?? {}).map(
    ([method, value]) => ({
      method,
      ...(value as { inflow: number; outflow: number }),
    }),
  );
  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Rekening & arus kas</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Pergerakan dana tercatat per metode pembayaran. Nilai bersih periode
          bukan saldo rekening bank.
        </p>
      </header>
      <nav className="flex flex-wrap gap-1" aria-label="Periode keuangan">
        {PERIODS.map((p) => (
          <button
            type="button"
            key={p.id}
            aria-pressed={selectedRange === p.id}
            className={`border px-3 py-2 font-mono text-xs ${selectedRange === p.id ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setSelectedRange(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>
      {report === null ? (
        <p role="alert">
          Data arus kas gagal dimuat. Muat ulang halaman untuk mencoba lagi.
        </p>
      ) : !report ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <p className="finance-summary-line">
            Masuk {fmt(report.totalInflow)} · Keluar {fmt(report.totalOutflow)}{" "}
            · Bersih periode {fmt(report.netCashFlow)}
          </p>
          <FinanceDataTable
            label="Arus kas per metode"
            rows={rows}
            rowKey={(r) => r.method}
            columns={[
              {
                key: "method",
                label: "Metode / sumber",
                value: (r) => r.method,
              },
              {
                key: "in",
                label: "Penerimaan",
                value: (r) => r.inflow,
                render: (r) => fmt(r.inflow),
              },
              {
                key: "out",
                label: "Pengeluaran",
                value: (r) => r.outflow,
                render: (r) => fmt(r.outflow),
              },
              {
                key: "net",
                label: "Bersih periode",
                value: (r) => r.inflow - r.outflow,
                render: (r) => fmt(r.inflow - r.outflow),
              },
            ]}
          />
          <h2 className="pt-4 font-mono text-xs uppercase">Arus kas harian</h2>
          <FinanceDataTable
            label="Arus kas harian"
            rows={report.dailyCashFlow}
            rowKey={(r: any) => r.date}
            columns={[
              { key: "date", label: "Tanggal", value: (r: any) => r.date },
              {
                key: "in",
                label: "Masuk",
                value: (r: any) => r.inflow,
                render: (r: any) => fmt(r.inflow),
              },
              {
                key: "out",
                label: "Keluar",
                value: (r: any) => r.outflow,
                render: (r: any) => fmt(r.outflow),
              },
              {
                key: "net",
                label: "Bersih",
                value: (r: any) => r.net,
                render: (r: any) => fmt(r.net),
              },
              {
                key: "balance",
                label: "Akumulasi periode",
                value: (r: any) => r.balance,
                render: (r: any) => fmt(r.balance),
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
