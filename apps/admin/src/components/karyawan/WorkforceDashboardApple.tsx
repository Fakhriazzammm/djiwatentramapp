import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
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
import { useHybridAdminAttendanceLogs, useHybridCurrentlyInStore, useHybridPayrollReport } from "@/hooks/use-hybrid-attendance-data";
import { useHybridAttendanceSchedules } from "@/hooks/use-hybrid-attendance-schedules";

type AnyRow = Record<string, any>;
const numberFormatter = new Intl.NumberFormat("id-ID");
const dateFormatter = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" });

function formatNumber(value: number) { return numberFormatter.format(Math.max(0, Math.round(value))); }
function dateKey(value: string | number | Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(value)); }
function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return minutes ? `${hours}j ${minutes}m` : `${hours}j`;
}
function startMinutes(value: unknown) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2}):?(\d{2})?/);
  return match ? Number(match[1]) * 60 + Number(match[2] ?? 0) : null;
}
function logType(row: AnyRow) { return String(row.type ?? row.eventType ?? "").toLowerCase(); }

function SkeletonCard() { return <div className="rounded-[24px] bg-white p-5 shadow-[0_2px_14px_rgba(0,0,0,0.04)]"><Skeleton className="h-4 w-28" /><Skeleton className="mt-5 h-9 w-24" /><Skeleton className="mt-3 h-3 w-36" /></div>; }

function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) {
  return <div className="flex min-h-[230px] flex-col items-center justify-center rounded-[18px] bg-[#f5f5f7] px-5 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#8e8e93] shadow-sm"><CalendarClock className="h-5 w-5" /></span><p className="mt-4 text-sm font-semibold text-[#1d1d1f]">{title}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#6e6e73]">{description}</p>{href && action && <Link className="mt-4 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-transform active:scale-[.97]" to={href}>{action}<ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>}</div>;
}

function HeroMetric({ present, scheduled, activeUsers }: { present: number; scheduled: number; activeUsers: number }) {
  const hasSchedule = scheduled > 0;
  return <Card className="overflow-hidden rounded-[28px] border-0 bg-[#0b2342] text-white shadow-[0_12px_30px_rgba(11,35,66,0.16)]"><CardContent className="relative p-6 sm:p-7"><div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#2d8cff]/20 blur-2xl" /><div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-sm text-white/70"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"><Activity className="h-4 w-4" /></span>Kehadiran workforce</div><div className="mt-5 flex items-end gap-3"><span className="font-display text-5xl font-bold tracking-[-0.06em] tabular-nums">{formatNumber(present)}</span><span className="mb-2 text-sm text-white/65">check-in tercatat</span></div><p className="mt-2 text-sm text-white/65">{hasSchedule ? `${formatNumber(present)} dari ${formatNumber(scheduled)} jadwal` : "Belum ada jadwal untuk menghitung persentase"}</p></div><div className="grid grid-cols-2 gap-2 sm:min-w-[250px]"><div className="rounded-[18px] bg-white/10 p-4"><p className="text-xs text-white/60">Karyawan aktif</p><p className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(activeUsers)}</p></div><div className="rounded-[18px] bg-white/10 p-4"><p className="text-xs text-white/60">Status metrik</p><p className="mt-1 text-sm font-semibold">{hasSchedule ? "Siap dianalisis" : "Menunggu jadwal"}</p></div></div></div></CardContent></Card>;
}

function SmallMetric({ label, value, detail, icon: Icon, href, tone = "blue" }: { label: string; value: string; detail: string; icon: typeof Users; href: string; tone?: "blue" | "green" | "orange" | "violet" }) {
  const tones = { blue: "bg-[#eaf3ff] text-[#007aff]", green: "bg-[#e9f8ef] text-[#248a3d]", orange: "bg-[#fff4e5] text-[#b45f06]", violet: "bg-[#f1ecff] text-[#6e44c5]" };
  return <Link className="group block" to={href}><Card className="h-full rounded-[22px] border-0 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.04)] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[.99]"><CardContent className="p-5"><div className="flex items-start justify-between"><span className={`flex h-9 w-9 items-center justify-center rounded-[12px] ${tones[tone]}`}><Icon className="h-[18px] w-[18px]" /></span><ArrowUpRight className="h-4 w-4 text-[#aeaeb2] transition-colors group-hover:text-primary" /></div><p className="mt-5 text-sm font-medium text-[#6e6e73]">{label}</p><p className="mt-1 font-display text-[28px] font-bold tracking-[-0.04em] text-[#1d1d1f] tabular-nums">{value}</p><p className="mt-1 text-xs text-[#8e8e93]">{detail}</p></CardContent></Card></Link>;
}

export default function WorkforceDashboardApple() {
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
    const scheduleByUserDay = new Map<string, AnyRow>();
    const openCheckIns = new Map<string, number>();
    const dayRows = new Map<string, { date: string; hadir: number; terlambat: number; terjadwal: number; selesai: number }>();
    const ensureDay = (day: string) => dayRows.get(day) ?? (() => { const row = { date: day, hadir: 0, terlambat: 0, terjadwal: 0, selesai: 0 }; dayRows.set(day, row); return row; })();
    for (const row of schedules) scheduleByUserDay.set(`${String(row.userId ?? row.user_id ?? "")}:${String(row.date).slice(0, 10)}`, row);
    let onTime = 0; let late = 0; let workedMs = 0;
    for (const row of [...logs].sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))) {
      const userId = String(row.userId ?? row.user_id ?? ""); const timestamp = Number(row.timestamp ?? 0); const key = `${userId}:${dateKey(timestamp)}`;
      if (logType(row).includes("check_in")) {
        checkInByUserDay.set(key, row); openCheckIns.set(key, timestamp); ensureDay(dateKey(timestamp)).hadir += 1;
        const scheduled = startMinutes(scheduleByUserDay.get(key)?.startTime ?? scheduleByUserDay.get(key)?.start_time);
        const actual = new Date(timestamp).toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", minute: "numeric", hour12: false }); const actualMinutes = startMinutes(actual);
        if (scheduled !== null && actualMinutes !== null && actualMinutes <= scheduled + 5) onTime += 1;
        else if (scheduled !== null) { late += 1; ensureDay(dateKey(timestamp)).terlambat += 1; }
      } else if (logType(row).includes("check_out")) { const start = openCheckIns.get(key); if (start) workedMs += Math.max(0, timestamp - start); openCheckIns.delete(key); }
    }
    for (const start of openCheckIns.values()) workedMs += Math.max(0, Date.now() - start);
    for (const schedule of schedules) { const row = ensureDay(String(schedule.date).slice(0, 10)); if (!["off", "cancelled"].includes(String(schedule.status))) row.terjadwal += 1; if (String(schedule.status) === "completed") row.selesai += 1; }
    const trend = [...dayRows.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-range).map((row) => ({ ...row, label: dateFormatter.format(new Date(`${row.date}T12:00:00`)) }));
    const roleMap = new Map((roles ?? []).map((role) => [String(role._id), String(role.name ?? role.roleName ?? "Tanpa role")])); const roleStats = new Map<string, { role: string; hadir: number; terjadwal: number }>();
    for (const schedule of schedules) { if (["off", "cancelled"].includes(String(schedule.status))) continue; const role = String(schedule.roleName ?? roleMap.get(String(schedule.roleId)) ?? "Tanpa role"); const current = roleStats.get(role) ?? { role, hadir: 0, terjadwal: 0 }; current.terjadwal += 1; if (checkInByUserDay.has(`${String(schedule.userId ?? schedule.user_id ?? "")}:${String(schedule.date).slice(0, 10)}`)) current.hadir += 1; roleStats.set(role, current); }
    const scheduledCount = schedules.filter((schedule) => !["off", "cancelled"].includes(String(schedule.status))).length; const completedShifts = schedules.filter((schedule) => String(schedule.status) === "completed").length;
    return { trend, roleStats: [...roleStats.values()].sort((a, b) => b.terjadwal - a.terjadwal), scheduledCount, presentCount: checkInByUserDay.size, completedShifts, attendanceRate: scheduledCount ? Math.round((checkInByUserDay.size / scheduledCount) * 100) : null, punctuality: onTime + late ? Math.round((onTime / (onTime + late)) * 100) : null, workedHours: workedMs / 3600000, checkInByUserDay, checkOuts };
  }, [logs, range, roles, schedules]);

  const attention = useMemo(() => ({ incomplete: [...derived.checkInByUserDay.keys()].filter((key) => !derived.checkOuts.some((row) => `${String(row.userId ?? row.user_id ?? "")}:${dateKey(Number(row.timestamp ?? 0))}` === key)).length, openShifts: schedules.filter((row) => ["scheduled", "confirmed"].includes(String(row.status)) && String(row.date).slice(0, 10) <= dateKey(now)).length }), [derived.checkInByUserDay, derived.checkOuts, schedules]);
  const payrollRows = payroll?.rows ?? [];
  const trendHasData = derived.trend.some((row) => row.hadir || row.terjadwal || row.terlambat || row.selesai);
  const periodValue = `${year}-${String(month).padStart(2, "0")}`;
  const changePeriod = (value: string) => { const [nextYear, nextMonth] = value.split("-").map(Number); setYear(nextYear); setMonth(nextMonth); };

  return <main className="min-h-full bg-[#f5f5f7] px-4 py-6 md:px-7 md:py-8"><div className="mx-auto w-full max-w-[1380px] space-y-6">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold text-primary">Karyawan App</p><h1 className="mt-1 font-display text-[32px] font-bold tracking-[-0.045em] text-[#1d1d1f] sm:text-[38px]">Dashboard Karyawan</h1><p className="mt-2 max-w-xl text-[15px] leading-6 text-[#6e6e73]">Satu tampilan untuk memahami kehadiran, jam kerja, dan kesiapan workforce.</p></div><div className="flex min-h-11 flex-wrap items-center gap-2"><label className="sr-only" htmlFor="workforce-period">Periode</label><input aria-label="Periode dashboard" className="h-11 rounded-[14px] border-0 bg-white px-3 text-sm text-[#1d1d1f] shadow-[0_2px_10px_rgba(0,0,0,0.04)]" id="workforce-period" onChange={(event) => changePeriod(event.target.value)} type="month" value={periodValue} /><Button className="h-11 rounded-[14px] bg-white text-[#1d1d1f] shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:bg-white/80" onClick={() => { triggerHybridRefresh(); toast.success("Data workforce diperbarui"); }} type="button" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div></header>
    {hasSourceError && <div className="flex items-start gap-3 rounded-[18px] border border-amber-200 bg-[#fff8e7] p-4 text-sm text-amber-900"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Sebagian data belum tersedia.</p><p className="mt-1 text-xs leading-5">Angka yang belum tersedia tidak dihitung sebagai nol bisnis.</p></div></div>}
    {isLoading ? <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]"><Skeleton className="h-[250px] rounded-[28px]" /><Skeleton className="h-[250px] rounded-[28px]" /></section> : <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]"><HeroMetric activeUsers={activeUsers.length} present={derived.presentCount} scheduled={derived.scheduledCount} /><Card className="rounded-[28px] border-0 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.04)]"><CardContent className="flex h-full flex-col justify-between p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[#1d1d1f]">Kualitas kehadiran</p><p className="mt-1 text-sm text-[#6e6e73]">Periode {new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1))}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#eaf3ff] text-[#007aff]"><Clock3 className="h-[18px] w-[18px]" /></span></div><div className="mt-7 flex items-end justify-between gap-5"><div><p className="font-display text-5xl font-bold tracking-[-0.06em] text-[#1d1d1f]">{derived.attendanceRate === null ? "—" : `${derived.attendanceRate}%`}</p><p className="mt-2 text-sm text-[#6e6e73]">{derived.attendanceRate === null ? "Belum dapat dihitung" : "tingkat kehadiran"}</p></div><div className="text-right"><p className="text-xs text-[#8e8e93]">Tepat waktu</p><p className="mt-1 text-2xl font-bold text-[#1d1d1f]">{derived.punctuality === null ? "—" : `${derived.punctuality}%`}</p></div></div><div className="mt-6 rounded-[16px] bg-[#f5f5f7] px-4 py-3 text-xs leading-5 text-[#6e6e73]">{derived.scheduledCount ? "Dihitung dari jadwal dan check-in aktual." : "Buat jadwal terlebih dahulu untuk mengaktifkan metrik persentase."}</div></CardContent></Card></section>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{isLoading ? Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} />) : <><SmallMetric detail="total periode berjalan" href="/admin/karyawan/laporan" icon={CalendarClock} label="Total jam kerja" tone="blue" value={formatHours(derived.workedHours)} /><SmallMetric detail="dari jadwal yang tersedia" href="/admin/karyawan/kehadiran/jadwal" icon={CheckCircle2} label="Shift selesai" tone="green" value={derived.scheduledCount ? `${Math.round((derived.completedShifts / derived.scheduledCount) * 100)}%` : "—"} /><SmallMetric detail="masih aktif sekarang" href="/admin/karyawan/kehadiran" icon={UserRoundCheck} label="Sedang bekerja" tone="orange" value={formatNumber(currentlyInStore?.length ?? 0)} /><SmallMetric detail="baris payroll tersedia" href="/admin/karyawan/laporan" icon={Users} label="Payroll periode" tone="violet" value={formatNumber(payrollRows.length)} /></>}</section>
    <section className="grid gap-5 xl:grid-cols-[1.55fr_1fr]"><Card className="rounded-[24px] border-0 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.04)]"><CardHeader className="flex flex-col gap-4 border-b border-[#f0f0f2] px-6 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="font-display text-xl tracking-[-0.025em] text-[#1d1d1f]">Tren kehadiran</CardTitle><p className="mt-1 text-sm text-[#6e6e73]">Pergerakan hadir, terlambat, dan shift selesai.</p></div><div className="flex w-fit rounded-[12px] bg-[#f5f5f7] p-1">{([7, 14, 30] as const).map((item) => <button className={`min-h-9 rounded-[10px] px-3 text-xs font-semibold transition-colors ${range === item ? "bg-white text-primary shadow-sm" : "text-[#6e6e73]"}`} key={item} onClick={() => setRange(item)} type="button">{item} hari</button>)}</div></CardHeader><CardContent className="p-6">{isLoading ? <Skeleton className="h-[250px] rounded-[18px]" /> : trendHasData ? <ResponsiveContainer height={250} width="100%"><AreaChart data={derived.trend} margin={{ left: -20, right: 8 }}><defs><linearGradient id="apple-workforce-present" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#007aff" stopOpacity={0.22} /><stop offset="95%" stopColor="#007aff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#f0f0f2" strokeDasharray="3 3" /><XAxis axisLine={false} dataKey="label" tick={{ fill: "#8e8e93", fontSize: 11 }} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#8e8e93", fontSize: 11 }} tickLine={false} /><Tooltip /><Legend /><Area dataKey="hadir" fill="url(#apple-workforce-present)" name="Hadir" stroke="#007aff" strokeWidth={2} type="monotone" /><Line dataKey="terlambat" name="Terlambat" stroke="#ff9500" strokeWidth={2} type="monotone" /><Line dataKey="selesai" name="Shift selesai" stroke="#34c759" strokeWidth={2} type="monotone" /></AreaChart></ResponsiveContainer> : <EmptyState action="Buka jadwal" description="Belum ada jadwal atau check-in pada periode ini. Tambahkan jadwal untuk mulai melihat tren workforce." href="/admin/karyawan/kehadiran/jadwal" title="Belum ada data kehadiran" />}</CardContent></Card><Card className="rounded-[24px] border-0 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.04)]"><CardHeader className="border-b border-[#f0f0f2] px-6 pb-5"><CardTitle className="font-display text-xl tracking-[-0.025em] text-[#1d1d1f]">Kehadiran per role</CardTitle><p className="mt-1 text-sm text-[#6e6e73]">Hadir dibanding jadwal yang tersedia.</p></CardHeader><CardContent className="p-6">{isLoading ? <Skeleton className="h-[250px] rounded-[18px]" /> : derived.roleStats.length ? <ResponsiveContainer height={250} width="100%"><BarChart data={derived.roleStats} layout="vertical" margin={{ left: 0, right: 8 }}><CartesianGrid stroke="#f0f0f2" strokeDasharray="3 3" /><XAxis allowDecimals={false} axisLine={false} tick={{ fill: "#8e8e93", fontSize: 11 }} tickLine={false} type="number" /><YAxis axisLine={false} dataKey="role" tick={{ fill: "#6e6e73", fontSize: 11 }} tickLine={false} type="category" width={72} /><Tooltip /><Legend /><Bar dataKey="hadir" fill="#007aff" name="Hadir" radius={[0, 6, 6, 0]} /><Bar dataKey="terjadwal" fill="#d8d8dc" name="Terjadwal" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer> : <EmptyState action="Kelola jadwal" description="Role belum memiliki jadwal pada periode ini, jadi perbandingan belum dapat ditampilkan." href="/admin/karyawan/kehadiran/jadwal" title="Belum ada jadwal role" />}</CardContent></Card></section>
    <section className="grid gap-5 xl:grid-cols-[1.1fr_1fr]"><Card className="rounded-[24px] border-0 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.04)]"><CardHeader className="px-6 pb-4"><CardTitle className="font-display text-xl tracking-[-0.025em] text-[#1d1d1f]">Perlu perhatian</CardTitle><p className="mt-1 text-sm text-[#6e6e73]">Tindakan yang dapat dilakukan dari data periode ini.</p></CardHeader><CardContent className="grid gap-3 px-6 pb-6 sm:grid-cols-3"><Link className="rounded-[18px] bg-[#fff4e5] p-4 transition-transform hover:-translate-y-0.5" to="/admin/karyawan/kehadiran"><AlertTriangle className="h-5 w-5 text-[#b45f06]" /><p className="mt-4 text-sm font-semibold text-[#1d1d1f]">Absensi belum lengkap</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#1d1d1f]">{formatNumber(attention.incomplete)}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">Masuk tanpa check-out.</p></Link><Link className="rounded-[18px] bg-[#eaf3ff] p-4 transition-transform hover:-translate-y-0.5" to="/admin/karyawan/kehadiran/jadwal"><FileClock className="h-5 w-5 text-[#007aff]" /><p className="mt-4 text-sm font-semibold text-[#1d1d1f]">Shift belum ditutup</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#1d1d1f]">{formatNumber(attention.openShifts)}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">Masih terjadwal atau dikonfirmasi.</p></Link><Link className="rounded-[18px] bg-[#f1ecff] p-4 transition-transform hover:-translate-y-0.5" to="/admin/karyawan/laporan"><CalendarCheck2 className="h-5 w-5 text-[#6e44c5]" /><p className="mt-4 text-sm font-semibold text-[#1d1d1f]">Payroll periode</p><p className="mt-1 text-2xl font-bold tabular-nums text-[#1d1d1f]">{formatNumber(payrollRows.length)}</p><p className="mt-1 text-xs leading-5 text-[#6e6e73]">Data siap ditinjau.</p></Link></CardContent></Card><Card className="rounded-[24px] border-0 bg-white shadow-[0_2px_14px_rgba(0,0,0,0.04)]"><CardHeader className="px-6 pb-4"><CardTitle className="font-display text-xl tracking-[-0.025em] text-[#1d1d1f]">Status workforce</CardTitle><p className="mt-1 text-sm text-[#6e6e73]">Ringkasan singkat tanpa ranking individual.</p></CardHeader><CardContent className="space-y-4 px-6 pb-6"><div className="flex items-center justify-between rounded-[18px] bg-[#f5f5f7] p-4"><span className="text-sm text-[#6e6e73]">Ranking performa</span><span className="text-sm font-semibold text-[#8e8e93]">Belum diaktifkan</span></div><p className="text-xs leading-5 text-[#6e6e73]">Ranking individual menunggu sumber atribusi tugas/order yang tervalidasi.</p><Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" to="/admin/karyawan/laporan">Buka laporan workforce<ChevronRight className="ml-1 h-4 w-4" /></Link></CardContent></Card></section>
  </div></main>;
}
