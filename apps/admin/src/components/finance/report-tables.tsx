import { FinanceDataTable } from "./finance-data-table";
import {
  useHybridProfitLossReport,
  useHybridCashFlowReport,
} from "@/hooks/use-hybrid-finance-analytics-data";
import { Skeleton } from "@/components/ui/skeleton";
import type { DateRange } from "@/routes/admin/finance/reports/-components/period-selector";
const money = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
export function ProfitLossTable({ range }: { range: DateRange }) {
  const data = useHybridProfitLossReport(range);
  if (data === null)
    return (
      <p role="alert">
        Data laporan gagal dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>
    );
  if (!data) return <Skeleton className="h-40 w-full" />;
  const rows = [
    ...data.income.sources.map((r: { category: string; amount: number }) => ({
      label: r.category,
      group: "Pendapatan",
      amount: r.amount,
    })),
    {
      label: "Potongan penjualan",
      group: "Potongan pendapatan",
      amount: -data.income.totalDiscount,
    },
    {
      label: "Penjualan bersih",
      group: "Subtotal pendapatan",
      amount: data.income.salesRevenue,
    },
    {
      label: "HPP / COGS tercatat",
      group: "Harga pokok",
      amount: data.expense.hppAmount,
    },
    ...data.expense.operatingExpenses.map(
      (r: { category: string; amount: number }) => ({
        label: r.category,
        group: "Beban operasional",
        amount: r.amount,
      }),
    ),
    { label: "Laba bersih", group: "Hasil periode", amount: data.netProfit },
  ];
  return (
    <>
      <p className="finance-summary-line">
        Pendapatan {money(data.income.total)} · HPP{" "}
        {money(data.expense.hppAmount)} · Beban {money(data.expense.total)} ·
        Laba bersih {money(data.netProfit)}
      </p>
      <FinanceDataTable
        label="Laba rugi"
        rows={rows}
        rowKey={(r) => r.group + ":" + r.label}
        columns={[
          { key: "label", label: "Pos laporan", value: (r) => r.label },
          { key: "group", label: "Kelompok", value: (r) => r.group },
          { key: "period", label: "Periode", value: () => range.label },
          {
            key: "amount",
            label: "Nilai tercatat",
            value: (r) => r.amount,
            render: (r) => money(r.amount),
          },
          {
            key: "ratio",
            label: "% pendapatan",
            value: (r) =>
              data.income.total ? (r.amount / data.income.total) * 100 : "",
            render: (r) =>
              data.income.total
                ? ((r.amount / data.income.total) * 100).toFixed(1) + "%"
                : "—",
          },
        ]}
      />
    </>
  );
}
export function CashFlowTable({ range }: { range: DateRange }) {
  const data = useHybridCashFlowReport(range);
  if (data === null)
    return (
      <p role="alert">
        Data laporan gagal dimuat. Muat ulang halaman untuk mencoba lagi.
      </p>
    );
  if (!data) return <Skeleton className="h-40 w-full" />;
  return (
    <>
      <p className="finance-summary-line">
        Masuk {money(data.totalInflow)} · Keluar {money(data.totalOutflow)} ·
        Bersih {money(data.netCashFlow)}
      </p>
      <FinanceDataTable
        label="Arus kas"
        rows={
          data.dailyCashFlow as Array<{
            date: string;
            inflow: number;
            outflow: number;
            net: number;
            balance: number;
          }>
        }
        rowKey={(r) => r.date}
        columns={[
          { key: "date", label: "Tanggal", value: (r) => r.date },
          {
            key: "inflow",
            label: "Penerimaan",
            value: (r) => r.inflow,
            render: (r) => money(r.inflow),
          },
          {
            key: "outflow",
            label: "Pengeluaran kas",
            value: (r) => r.outflow,
            render: (r) => money(r.outflow),
          },
          {
            key: "net",
            label: "Bersih harian",
            value: (r) => r.net,
            render: (r) => money(r.net),
          },
          {
            key: "balance",
            label: "Akumulasi periode",
            value: (r) => r.balance,
            render: (r) => money(r.balance),
          },
        ]}
      />
    </>
  );
}
