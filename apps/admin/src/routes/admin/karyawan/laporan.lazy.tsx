import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FileBarChart, RefreshCw, ShieldAlert, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridAdminAttendanceLogs, useHybridPayrollReport } from "@/hooks/use-hybrid-attendance-data";

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}
function csvCell(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export const Route = createLazyFileRoute("/admin/karyawan/laporan")({ component: EmployeeReportsPage });

function EmployeeReportsPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const attendance = useHybridAdminAttendanceLogs(500, month, year) as any[] | null | undefined;
  const payroll = useHybridPayrollReport({ month, year }) as { rows?: any[] } | null | undefined;
  const payrollRows = payroll?.rows;
  const rows = Array.isArray(payrollRows) ? payrollRows : [];
  const logs = Array.isArray(attendance) ? attendance : [];
  const isLoading = attendance === undefined || payroll === undefined;
  const hasSourceError = attendance === null || payroll === null;

  const summary = useMemo(() => ({
    staff: rows.filter((row) => row.isActive !== false).length,
    attendanceLogs: logs.length,
    presentSessions: logs.filter((row) => String(row.type ?? row.eventType ?? "").toLowerCase().includes("in")).length,
    netSalary: rows.reduce((total, row) => total + Number(row.netSalary ?? 0), 0),
  }), [logs, rows]);

  const exportCsv = () => {
    const header = ["Nama", "Role", "Hari kerja", "Total jam", "Telat (menit)", "Gaji bersih"];
    const body = rows.map((row) => [row.name, row.roleName, row.daysWorked ?? 0, row.totalHours ?? 0, row.totalLateMinutes ?? 0, row.netSalary ?? 0]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `laporan-karyawan-${year}-${String(month).padStart(2, "0")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <main className="flex flex-col gap-4 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Karyawan App</p><h1 className="text-2xl font-black tracking-tight">Laporan Karyawan</h1><p className="mt-1 text-sm text-muted-foreground">Ringkasan kehadiran dan payroll berdasarkan periode yang dipilih.</p></div>
      <div className="flex flex-wrap gap-2"><select aria-label="Bulan laporan" className="h-11 rounded-xl border border-input bg-card px-3 text-sm" onChange={(event) => setMonth(Number(event.target.value))} value={month}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date(2020, index, 1))}</option>)}</select><input aria-label="Tahun laporan" className="h-11 w-24 rounded-xl border border-input bg-card px-3 text-sm" max={2100} min={2020} onChange={(event) => setYear(Number(event.target.value) || now.getFullYear())} type="number" value={year} /><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:bg-muted" onClick={exportCsv} type="button"><Download className="h-4 w-4" /> CSV</button></div>
    </header>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{([
      { label: "Karyawan aktif", value: summary.staff, Icon: Users },
      { label: "Log absensi", value: summary.attendanceLogs, Icon: FileBarChart },
      { label: "Sesi check-in", value: summary.presentSessions, Icon: RefreshCw },
      { label: "Total gaji bersih", value: formatCurrency(summary.netSalary), Icon: FileBarChart },
    ] satisfies Array<{ label: string; value: string | number; Icon: LucideIcon }>).map(({ label, value, Icon }) => <div className="rounded-2xl border border-border bg-card p-4" key={label}><Icon className="h-5 w-5 text-primary" /><p className="mt-3 text-xs font-bold text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>)}</section>

    {hasSourceError && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Sebagian sumber laporan tidak tersedia.</p><p className="mt-1 text-xs">Angka kosong tidak dianggap nol bisnis; periksa koneksi dan permission sumber data.</p></div></div>}

    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-black">Ringkasan per karyawan</h2><p className="text-xs text-muted-foreground">{rows.length} baris payroll untuk periode aktif</p></div></div>{isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4, 5].map((item) => <Skeleton className="h-11 w-full rounded-xl" key={item} />)}</div> : rows.length === 0 ? <div className="p-10 text-center"><FileBarChart className="mx-auto h-9 w-9 text-muted-foreground/40" /><p className="mt-3 text-sm font-bold">Belum ada data payroll untuk periode ini.</p><p className="mt-1 text-xs text-muted-foreground">Pilih periode lain atau pastikan data attendance/payroll sudah tersedia.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Karyawan</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Hari kerja</th><th className="px-4 py-3">Jam kerja</th><th className="px-4 py-3">Keterlambatan</th><th className="px-4 py-3 text-right">Gaji bersih</th></tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr className="hover:bg-muted/20" key={row._id ?? row.slug ?? row.name}><td className="px-4 py-3 font-bold">{row.name ?? "Tanpa nama"}</td><td className="px-4 py-3 text-muted-foreground">{row.roleName ?? "—"}</td><td className="px-4 py-3">{row.daysWorked ?? 0}</td><td className="px-4 py-3">{Number(row.totalHours ?? 0).toFixed(1)} jam</td><td className="px-4 py-3">{row.totalLateMinutes ?? 0} menit</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(row.netSalary)}</td></tr>)}</tbody></table></div>}</section>
  </main>;
}
