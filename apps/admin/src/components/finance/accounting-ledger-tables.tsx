import { useState } from "react";
import { createClient } from "@/lib/client";
import { useSupabaseLiveValue } from "@/hooks/use-supabase-live-value";
import { FinanceDataTable } from "./finance-data-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PeriodSelector,
  getRangeFromPeriod,
  type PeriodOption,
  type DateRange,
} from "@/routes/admin/finance/reports/-components/period-selector";
import { formatDateTimeWIB, formatDateWIB } from "@/lib/wib-utils";
import { formatCurrencyIDR } from "@/lib/export-utils";
type Account = { id: string; code: string; name: string; type: string };
type Entry = {
  id: string;
  coa_id: string;
  entry_type: string;
  amount: number;
  created_at: string;
  transaction_source_id: string;
  description?: string;
};
function useLedger(range: DateRange, allHistory = false) {
  return useSupabaseLiveValue(
    `finance-ledger:${allHistory ? "all" : range.startDate}:${range.endDate}`,
    async () => {
      const client = createClient();
      const accounts = await client
        .from("accounting_chart_of_accounts")
        .select("id,code,name,type")
        .order("code");
      if (accounts.error) throw accounts.error;
      const entries: Entry[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = client
          .from("accounting_entries")
          .select("*")
          .lte("created_at", new Date(range.endDate).toISOString())
          .order("created_at")
          .order("id")
          .range(offset, offset + 499);
        if (!allHistory)
          query = query.gte(
            "created_at",
            new Date(range.startDate).toISOString(),
          );
        const result = await query;
        if (result.error) throw result.error;
        entries.push(...((result.data ?? []) as Entry[]));
        if ((result.data ?? []).length < 500) break;
      }
      return { accounts: (accounts.data ?? []) as Account[], entries };
    },
    [range.startDate, range.endDate, allHistory],
    { tables: ["accounting_entries", "accounting_chart_of_accounts"] },
  );
}
function ReadState({ failed }: { failed: boolean }) {
  return failed ? (
    <p role="alert">
      Jurnal gagal dimuat. Muat ulang halaman untuk mencoba lagi.
    </p>
  ) : (
    <Skeleton className="h-40 w-full" />
  );
}
export function TrialBalanceTable({ range }: { range: DateRange }) {
  const data = useLedger(range, true);
  if (!data) return <ReadState failed={data === null} />;
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const sums = new Map<
    string,
    { debit: number; credit: number; count: number }
  >();
  for (const e of data.entries) {
    const r = sums.get(e.coa_id) ?? { debit: 0, credit: 0, count: 0 };
    if (e.entry_type === "debit") r.debit += Number(e.amount);
    else r.credit += Number(e.amount);
    r.count++;
    sums.set(e.coa_id, r);
  }
  const rows = [...new Set([...accounts.keys(), ...sums.keys()])].map((id) => {
    const a = accounts.get(id);
    const sum = sums.get(id) ?? { debit: 0, credit: 0, count: 0 };
    return {
      id,
      code: a?.code ?? "Tidak ditemukan",
      name: a?.name ?? id,
      type: a?.type ?? "Perlu pemeriksaan",
      ...sum,
      balance: sum.debit - sum.credit,
    };
  });
  const debit = rows.reduce((s, r) => s + Math.max(r.balance, 0), 0),
    credit = rows.reduce((s, r) => s + Math.max(-r.balance, 0), 0);
  return (
    <>
      <h2 className="font-mono text-xs uppercase">Neraca saldo buku</h2>
      <p className="finance-summary-line">
        Seluruh jurnal hingga{" "}
        {formatDateWIB(range.endDate)} · Saldo debit{" "}
        {formatCurrencyIDR(debit)} · Kredit {formatCurrencyIDR(credit)} ·
        Selisih {formatCurrencyIDR(debit - credit)}
      </p>
      <FinanceDataTable
        label="Neraca saldo"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "code", label: "Kode akun", value: (r) => r.code },
          { key: "name", label: "Nama akun", value: (r) => r.name },
          { key: "type", label: "Kelompok", value: (r) => r.type },
          {
            key: "debit",
            label: "Mutasi debit",
            value: (r) => r.debit,
            render: (r) => formatCurrencyIDR(r.debit),
          },
          {
            key: "credit",
            label: "Mutasi kredit",
            value: (r) => r.credit,
            render: (r) => formatCurrencyIDR(r.credit),
          },
          {
            key: "sd",
            label: "Saldo debit",
            value: (r) => Math.max(r.balance, 0),
            render: (r) => formatCurrencyIDR(Math.max(r.balance, 0)),
          },
          {
            key: "sc",
            label: "Saldo kredit",
            value: (r) => Math.max(-r.balance, 0),
            render: (r) => formatCurrencyIDR(Math.max(-r.balance, 0)),
          },
          { key: "count", label: "Baris jurnal", value: (r) => r.count },
        ]}
      />
    </>
  );
}
export function GeneralLedger() {
  const [period, setPeriod] = useState<PeriodOption>("this_month");
  const [range, setRange] = useState(getRangeFromPeriod("this_month"));
  const data = useLedger(range);
  const accounts = new Map(data?.accounts.map((a) => [a.id, a]) ?? []);
  const running = new Map<string, number>();
  const rows = (data?.entries ?? []).map((e) => {
    const balance =
      (running.get(e.coa_id) ?? 0) +
      (e.entry_type === "debit" ? Number(e.amount) : -Number(e.amount));
    running.set(e.coa_id, balance);
    return {
      ...e,
      code: accounts.get(e.coa_id)?.code ?? "—",
      name: accounts.get(e.coa_id)?.name ?? e.coa_id,
      balance,
    };
  });
  return (
    <section className="p-3">
      <PeriodSelector
        value={period}
        onChange={(p, r) => {
          setPeriod(p);
          setRange(r);
        }}
      />
      <p className="finance-summary-line">
        Mutasi per akun · {range.label} · Akumulasi menampilkan debit dikurangi
        kredit pada periode terpilih.
      </p>
      {!data ? (
        <ReadState failed={data === null} />
      ) : (
        <FinanceDataTable
          label="Buku besar"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: "code", label: "Kode akun", value: (r) => r.code },
            { key: "account", label: "Nama akun", value: (r) => r.name },
            {
              key: "date",
              label: "Tanggal jurnal",
              value: (r) => r.created_at,
              render: (r) => formatDateTimeWIB(new Date(r.created_at).getTime()),
            },
            {
              key: "ref",
              label: "Referensi transaksi",
              value: (r) => r.transaction_source_id ?? "—",
            },
            {
              key: "description",
              label: "Uraian",
              value: (r) => r.description ?? "—",
            },
            {
              key: "debit",
              label: "Debit",
              value: (r) => (r.entry_type === "debit" ? Number(r.amount) : 0),
              render: (r) =>
                formatCurrencyIDR(
                  r.entry_type === "debit" ? Number(r.amount) : 0,
                ),
            },
            {
              key: "credit",
              label: "Kredit",
              value: (r) => (["credit", "kredit"].includes(r.entry_type) ? Number(r.amount) : 0),
              render: (r) =>
                formatCurrencyIDR(
                  ["credit", "kredit"].includes(r.entry_type) ? Number(r.amount) : 0,
                ),
            },
            {
              key: "balance",
              label: "Akumulasi mutasi",
              value: (r) => r.balance,
              render: (r) => formatCurrencyIDR(r.balance),
            },
          ]}
        />
      )}
    </section>
  );
}
