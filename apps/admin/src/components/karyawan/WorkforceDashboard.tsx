import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileClock,
  RefreshCw,
  ShieldAlert,
  Users,
  UserRoundCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridStaffRoles, useHybridStaffUsers, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridAdminAttendanceLogs, useHybridCurrentlyInStore } from "@/hooks/use-hybrid-attendance-data";
import { useHybridAttendanceSchedules } from "@/hooks/use-hybrid-attendance-schedules";
import { useHybridPayrollReport } from "@/hooks/use-hybrid-attendance-data";

type AnyRow = Record<string, any>;
const numberFormatter = new Intl.NumberFormat("id-ID");
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" });

function formatNumber(value: number) {
  return numberFormatter.format(Math.max(0, Math.round(value)));
}

function dateKey(value: string | number | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(value));
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0j";
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return minutes ? `${hours}j ${minutes}m` : `${hours}j`;
}

function startMinutes(value: unknown) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2}):?(\d{2})?/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

function logType(row: AnyRow) {
  return String(row.type ?? row.eventType ?? "").toLowerCase();
}

function CardSkeleton() {
  return <div className="space-y-3 rounded-[24px] border border-border/70 bg-card p-5"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-24" /><Skeleton className="h-3 w-36" /></div>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-[250px] items-center justify-center rounded-[16px] border border-dashed border-border text-center text-sm text-muted-foreground">{message}</div>;
}

function MetricCard({ label, value, detail, icon: Icon, href }: { label: string; value: string; detail: string; icon: typeof Users; href: string }) {
  return <Link className="group block" to={href}>
    <Card className="h-full rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[.99]">
      <CardContent className="p-5">
        <div className="mb-5 flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="text-xs text-muted-foreground">Detail →</span></div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  </Link>;
}

export default function WorkforceDashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const users = useHybridStaffUsers() as AnyRow[] | null | undefined;
  const roles = useHybridStaffRoles() as AnyRow[] | null | undefined;
  const currentlyInStore = useHybridCurrentlyInStore() as AnyRow[] | null | undefined;
  const attendance = useHybridAdminAttendanceLogs(1000, month, year) as AnyRow[] | null | undefined;
  const schedulesResult = useHybridAttendanceSchedules(month, year);
  const payroll = useHybridPayrollReport({ month, year }) as { rows?: AnyRow[] } | null | undefined;
  const schedules = useMemo(() => Object.values(schedulesResult.data ?? {}).flat() as AnyRow[], [schedulesResult.data]);
  const activeUsers = useMemo(() => (users ?? []).filter((user) => user.isActive !== false), [users]);
  const activeIds = useMemo(() => new Set(activeUsers.map((user) => String(user._id))), [activeUsers]);
  const logs = useMemo(() => (attendance ?? []).filter((row) => activeIds.has(String(row.userId ?? row.user_id))), [attendance, activeIds]);
  const isLoading = users === undefined || attendance === undefined || schedulesResult.isLoading || payroll === undefined;
  const hasSourceError = users === null || attendance === null || schedulesResult.data === null || payroll === null;

  const derived = useMemo(() => {
    const checkIns = logs.filter((row) => logType(row).includes("check_in"));
    const checkOuts = logs.filter((row) => logType(row).includes("check_out"));
    const checkInByUserDay = new Map<string, AnyRow>();
    for (const row of checkIns) {
      const userId = String(row.userId ?? row.user_id ?? "");
      checkInByUserDay.set(`${userId}:${dateKey(Number(row.timestamp ?? 0))}`, row);
    }
    const scheduleByUserDay = new Map<string, AnyRow>();
    for (const row of schedules) scheduleByUserDay.set(`${String(row.userId ?? row.user_id ?? "")}:${String(row.date).slice(0, 10)}`, row);
    const monthDays = new Set<string>();
    let onTime = 0;
    let late = 0;
    let workedMs = 0;
    const openCheckIns = new Map<string, number>();
    const dayRows = new Map<string, { date: string; hadir: number; terlambat: number; terjadwal: number; selesai: number }>();
    const ensureDay = (day: string) => dayRows.get(day) ?? (() => { const row = { date: day, hadir: 0, terlambat: 0, terjadwal: 0, selesai: 0 }; dayRows.set(day, row); return row; })();

    for (const row of logs.sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))) {
      const userId = String(row.userId ?? row.user_id ?? "");
      const timestamp = Number(row.timestamp ?? 0);
      const key = `${userId}:${dateKey(timestamp)}`;
      if (logType(row).includes("check_in")) {
        openCheckIns.set(key, timestamp);
        monthDays.add(key);
        ensureDay(dateKey(timestamp)).hadir += 1;
        const schedule = scheduleByUserDay.get(key);
        const scheduled = startMinutes(schedule?.startTime ?? schedule?.start_time);
        const actual = new Date(timestamp).toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", minute: "numeric", hour12: false });
        const actualMinutes = startMinutes(actual);
        if (scheduled !== null && actualMinutes !== null && actualMinutes <= scheduled + 5) onTime += 1;
        else if (scheduled !== null) { late += 1; ensureDay(dateKey(timestamp)).terlambat += 1; }
      } else if (logType(row).includes("check_out")) {
        const start = openCheckIns.get(key);
        if (start) workedMs += Math.max(0, timestamp - start);
        openCheckIns.delete(key);
      }
    }
    for (const [key, start] of openCheckIns) {
      if (key && start) workedMs += Math.max(0, Date.now() - start);
    }
    for (const schedule of schedules) {
      const day = String(schedule.date).slice(0, 10);
      const row = ensureDay(day);
      if (!row) continue;
      if (!["off", "cancelled"].includes(String(schedule.status))) row.terjadwal += 1;
      if (String(schedule.status) === "completed") row.selesai += 1;
    }
    const trend = [...dayRows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-range).map((row) => ({ ...row, label: dateFormatter.format(new Date(`${row.date}T12:00:00`)) }));
    const roleMap = new Map((roles ?? []).map((role) => [String(role._id), String(role.name ?? role.roleName ?? "Tanpa role")]));
    const roleStats = new Map<string, { role: string; hadir: number; terjadwal: number }>();
    for (const schedule of schedules) {
      if (["off", "cancelled"].includes(String(schedule.status))) continue;
      const role = String(schedule.roleName ?? roleMap.get(String(schedule.roleId)) ?? "Tanpa role");
      const current = roleStats.get(role) ?? { role, hadir: 0, terjadwal: 0 };
      current.terjadwal += 1;
      if (checkInByUserDay.has(`${String(schedule.userId ?? schedule.user_id ?? "")}:${String(schedule.date).slice(0, 10)}`)) current.hadir += 1;
      roleStats.set(role, current);
    }
    const scheduledCount = schedules.filter((schedule) => !["off", "cancelled"].includes(String(schedule.status))).length;
    const presentCount = [...checkInByUserDay.keys()].length;
    const completedShifts = schedules.filter((schedule) => String(schedule.status) === "completed").length;
    const attendanceRate = scheduledCount ? Math.round((presentCount / scheduledCount) * 100) : 0;
    const punctuality = onTime + late ? Math.round((onTime / (onTime + late)) * 100) : 0;
    return { trend, roleStats: [...roleStats.values()].sort((a, b) => b.terjadwal - a.terjadwal), scheduledCount, presentCount, completedShifts, attendanceRate, punctuality, late, workedHours: workedMs / 3600000, checkInByUserDay, checkOuts };
  }, [logs, range, roles, schedules]);

  const attention = useMemo(() => ({
    incomplete: [...derived.checkInByUserDay.keys()].filter((key) => !derived.checkOuts.some((row) => `${String(row.userId ?? row.user_id ?? "")}:${dateKey(Number(row.timestamp ?? 0))}` === key)).length,
    openShifts: schedules.filter((row) => ["scheduled", "confirmed"].includes(String(row.status)) && String(row.date).slice(0, 10) <= dateKey(now)).length,
    pendingLeave: 0,
  }), [derived.checkInByUserDay, derived.checkOuts, schedules]);
  const avgHours = activeUsers.length ? derived.workedHours / activeUsers.length : 0;
  const payrollRows = payroll?.rows ?? [];

  const refresh = () => { triggerHybridRefresh(); toast.success("Data workforce diperbarui"); };
  const changePeriod = (value: string) => { const [nextYear, nextMonth] = value.split("-").map(Number); setYear(nextYear); setMonth(nextMonth); };
  const periodValue = `${year}-${String(month).padStart(2, "0")}`;

  return <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-5 md:px-6 md:py-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KARYAWAN APP · WORKFORCE ANALYTICS</p><h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">Dashboard Karyawan</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Pantau kehadiran, ketepatan waktu, jam kerja, dan penyelesaian shift berdasarkan data aktual.</p></div>
      <div className="flex flex-wrap items-center gap-2"><input aria-label="Periode dashboard" className="h-10 rounded-[14px] border border-input bg-card px-3 text-sm" onChange={(event) => changePeriod(event.target.value)} type="month" value={periodValue} /><Button onClick={refresh} size="sm" type="button" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    </header>

    {hasSourceError && <div className="flex items-start gap-3 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Sebagian sumber data workforce tidak tersedia.</p><p className="mt-1 text-xs">Angka yang tidak tersedia tidak dianggap sebagai nol bisnis.</p></div></div>}

    <section aria-label="KPI workforce" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {isLoading ? Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />) : <>
        <MetricCard detail="status aktif" href="/admin/karyawan/data" icon={Users} label="Karyawan aktif" value={formatNumber(activeUsers.length)} />
        <MetricCard detail="dari jadwal periode" href="/admin/karyawan/kehadiran" icon={UserRoundCheck} label="Hadir" value={formatNumber(derived.presentCount)} />
        <MetricCard detail="jadwal yang terisi" href="/admin/karyawan/kehadiran/jadwal" icon={CalendarCheck2} label="Kehadiran" value={`${derived.attendanceRate}%`} />
        <MetricCard detail="check-in sesuai jadwal" href="/admin/karyawan/kehadiran" icon={Clock3} label="Tepat waktu" value={`${derived.punctuality}%`} />
        <MetricCard detail="akumulasi periode" href="/admin/karyawan/laporan" icon={CalendarClock} label="Jam kerja rata-rata" value={formatHours(avgHours)} />
        <MetricCard detail={`${derived.completedShifts} dari ${derived.scheduledCount} shift`} href="/admin/karyawan/kehadiran/jadwal" icon={CheckCircle2} label="Shift selesai" value={`${derived.scheduledCount ? Math.round((derived.completedShifts / derived.scheduledCount) * 100) : 0}%`} />
      </>}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <Card className="rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)]"><CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0"><div><CardTitle className="font-display text-lg">Tren kehadiran</CardTitle><p className="mt-1 text-sm text-muted-foreground">Perbandingan jadwal, hadir, terlambat, dan shift selesai.</p></div><div className="flex rounded-[12px] bg-muted p-1">{([7, 14, 30] as const).map((item) => <button className={`min-h-8 rounded-[10px] px-2.5 text-xs font-semibold ${range === item ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`} key={item} onClick={() => setRange(item)} type="button">{item} hari</button>)}</div></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[250px] w-full rounded-[16px]" /> : derived.trend.length ? <ResponsiveContainer height={250} width="100%"><AreaChart data={derived.trend}><defs><linearGradient id="workforce-present" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Area dataKey="hadir" fill="url(#workforce-present)" name="Hadir" stroke="hsl(var(--primary))" type="monotone" /><Line dataKey="terlambat" name="Terlambat" stroke="#f59e0b" strokeWidth={2} type="monotone" /><Line dataKey="selesai" name="Shift selesai" stroke="#22c55e" strokeWidth={2} type="monotone" /></AreaChart></ResponsiveContainer> : <EmptyChart message="Belum ada jadwal atau log absensi pada periode ini." />}</CardContent></Card>

      <Card className="rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)]"><CardHeader><CardTitle className="font-display text-lg">Kehadiran berdasarkan role</CardTitle><p className="text-sm text-muted-foreground">Hadir dibandingkan jadwal yang tersedia.</p></CardHeader><CardContent>{isLoading ? <Skeleton className="h-[250px] w-full rounded-[16px]" /> : derived.roleStats.length ? <ResponsiveContainer height={250} width="100%"><BarChart data={derived.roleStats} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis allowDecimals={false} type="number" /><YAxis dataKey="role" tick={{ fontSize: 10 }} type="category" width={74} /><Tooltip /><Legend /><Bar dataKey="hadir" fill="hsl(var(--primary))" name="Hadir" radius={[0, 5, 5, 0]} /><Bar dataKey="terjadwal" fill="#cbd5e1" name="Terjadwal" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <EmptyChart message="Belum ada data role dan jadwal." />}</CardContent></Card>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Card className="rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)]"><CardHeader><CardTitle className="font-display text-lg">Perlu perhatian</CardTitle><p className="text-sm text-muted-foreground">Data operasional workforce yang perlu ditindaklanjuti.</p></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><Link className="rounded-[16px] border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5" to="/admin/karyawan/kehadiran"><AlertTriangle className="h-5 w-5 text-amber-500" /><p className="mt-3 text-sm font-semibold">Absensi belum lengkap</p><p className="mt-1 text-2xl font-bold">{formatNumber(attention.incomplete)}</p><p className="text-xs text-muted-foreground">Masih tercatat masuk tanpa check-out.</p></Link><Link className="rounded-[16px] border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5" to="/admin/karyawan/kehadiran/jadwal"><FileClock className="h-5 w-5 text-primary" /><p className="mt-3 text-sm font-semibold">Shift belum ditutup</p><p className="mt-1 text-2xl font-bold">{formatNumber(attention.openShifts)}</p><p className="text-xs text-muted-foreground">Jadwal terjadwal atau dikonfirmasi.</p></Link><Link className="rounded-[16px] border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5" to="/admin/karyawan/cuti-izin"><CalendarClock className="h-5 w-5 text-violet-500" /><p className="mt-3 text-sm font-semibold">Cuti & izin</p><p className="mt-1 text-2xl font-bold">—</p><p className="text-xs text-muted-foreground">Buka halaman untuk status approval live.</p></Link><Link className="rounded-[16px] border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5" to="/admin/karyawan/laporan"><Users className="h-5 w-5 text-primary" /><p className="mt-3 text-sm font-semibold">Payroll periode</p><p className="mt-1 text-2xl font-bold">{formatNumber(payrollRows.length)}</p><p className="text-xs text-muted-foreground">Baris payroll yang tersedia.</p></Link></CardContent></Card>

      <Card className="rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)]"><CardHeader><CardTitle className="font-display text-lg">Ringkasan jam kerja & status</CardTitle><p className="text-sm text-muted-foreground">Berdasarkan pairing check-in dan check-out aktual.</p></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-[16px] bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Total jam kerja</p><p className="mt-1 text-xl font-bold">{formatHours(derived.workedHours)}</p></div><div className="rounded-[16px] bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Sedang bekerja</p><p className="mt-1 text-xl font-bold">{formatNumber(currentlyInStore?.length ?? 0)}</p></div></div><div className="rounded-[16px] border p-4"><div className="flex items-center justify-between text-sm"><span>Data payroll tersedia</span><span className="font-semibold">{formatNumber(payrollRows.length)} karyawan</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${activeUsers.length ? Math.min(100, (payrollRows.length / activeUsers.length) * 100) : 0}%` }} /></div></div><div className="flex items-center justify-between rounded-[16px] border border-dashed p-4 text-sm"><span className="text-muted-foreground">Ranking performa individual</span><span className="font-semibold text-muted-foreground">Belum diaktifkan</span></div><p className="text-xs text-muted-foreground">Ranking tidak ditampilkan sebelum atribusi tugas/order dan sumber penilaian tervalidasi.</p></CardContent></Card>
    </section>
  </main>;
}
