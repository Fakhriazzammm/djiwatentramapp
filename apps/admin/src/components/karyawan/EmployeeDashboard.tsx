import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarClock, ClipboardCheck, FileSignature, RefreshCw, Users, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHybridStaffRoles, useHybridStaffUsers, triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridCurrentlyInStore } from "@/hooks/use-hybrid-attendance-data";
import { createClient } from "@/lib/client";

type OnboardingSummary = {
  pending: number;
  approved: number;
  needsRevision: number;
};

const numberFormatter = new Intl.NumberFormat("id-ID");

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  href: string;
}) {
  return (
    <Link className="group block" to={href}>
      <Card className="h-full rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[.99]">
        <CardContent className="p-5">
          <div className="mb-5 flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function SummaryState({ isLoading, error, onRetry }: { isLoading: boolean; error: string | null; onRetry: () => void }) {
  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-[16px]" />;
  }
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[16px] border border-destructive/20 bg-destructive/5 p-4 text-sm">
        <span>{error}</span>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">Coba lagi</Button>
      </div>
    );
  }
  return null;
}

export default function EmployeeDashboard() {
  const users = useHybridStaffUsers();
  const roles = useHybridStaffRoles();
  const currentlyInStore = useHybridCurrentlyInStore();
  const [onboarding, setOnboarding] = useState<OnboardingSummary | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const loadOnboarding = async () => {
    setOnboardingLoading(true);
    setOnboardingError(null);
    try {
      const { data, error } = await createClient()
        .from("employee_onboarding_applications")
        .select("status");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ status?: string | null }>;
      setOnboarding({
        pending: rows.filter((row) => row.status === "pending").length,
        approved: rows.filter((row) => row.status === "approved").length,
        needsRevision: rows.filter((row) => row.status === "needs_revision").length,
      });
    } catch (error) {
      setOnboardingError(error instanceof Error ? error.message : "Data onboarding tidak dapat dimuat");
    } finally {
      setOnboardingLoading(false);
    }
  };

  useEffect(() => {
    void loadOnboarding();
  }, []);

  const activeUsers = useMemo(() => (users ?? []).filter((user) => user.isActive !== false), [users]);
  const inactiveUsers = useMemo(() => (users ?? []).filter((user) => user.isActive === false), [users]);
  const roleDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    activeUsers.forEach((user) => {
      const label = user.roleName?.trim() || "Tanpa role";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [activeUsers]);
  const dataLoading = users === undefined || roles === undefined || currentlyInStore === undefined;
  const maxRoleCount = Math.max(...roleDistribution.map(([, count]) => count), 1);

  const refresh = () => {
    triggerHybridRefresh();
    void loadOnboarding();
    toast.success("Data karyawan diperbarui");
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-5 md:px-6 md:py-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KARYAWAN APP</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">Dashboard Karyawan</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Ringkasan kondisi karyawan dan pekerjaan administrasi yang membutuhkan perhatian.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={refresh} size="sm" type="button" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
          <Link className="inline-flex h-9 items-center justify-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:bg-primary/90 active:scale-[.97]" to="/admin/karyawan/data">Kelola data</Link>
        </div>
      </header>

      <section aria-label="Ringkasan karyawan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard detail="terdaftar di sistem" href="/admin/karyawan/data" icon={Users} label="Total karyawan" value={dataLoading ? "—" : formatNumber(users?.length ?? 0)} />
        <MetricCard detail="status aktif" href="/admin/karyawan/data" icon={UserRoundCheck} label="Karyawan aktif" value={dataLoading ? "—" : formatNumber(activeUsers.length)} />
        <MetricCard detail="sedang tercatat masuk" href="/admin/karyawan/kehadiran" icon={CalendarClock} label="Sedang bekerja" value={dataLoading ? "—" : formatNumber(currentlyInStore?.length ?? 0)} />
        <MetricCard detail="menunggu tindakan admin" href="/admin/karyawan/onboarding" icon={ClipboardCheck} label="Approval pending" value={onboardingLoading ? "—" : formatNumber(onboarding?.pending ?? 0)} />
      </section>

      <SummaryState error={onboardingError} isLoading={false} onRetry={() => void loadOnboarding()} />

      <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card className="rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)]">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="font-display text-lg">Komposisi karyawan aktif</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Distribusi berdasarkan role yang tersimpan di data karyawan.</p>
            </div>
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <div className="space-y-4">{[1, 2, 3].map((item) => <Skeleton className="h-8 w-full rounded-lg" key={item} />)}</div>
            ) : roleDistribution.length === 0 ? (
              <div className="rounded-[16px] border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada data karyawan aktif.</div>
            ) : (
              <div className="space-y-4">
                {roleDistribution.map(([role, count]) => (
                  <div className="space-y-2" key={role}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium">{role}</span>
                      <span className="text-muted-foreground">{formatNumber(count)}</span>
                    </div>
                    <div aria-label={`${role}: ${count}`} className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.round((count / maxRoleCount) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border-border/70 shadow-[0_4px_24px_rgba(9,9,11,0.05)]">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="font-display text-lg">Perlu perhatian</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Pekerjaan administrasi yang belum selesai.</p>
            </div>
            <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          </CardHeader>
          <CardContent className="space-y-3">
            {onboardingLoading ? <Skeleton className="h-24 w-full rounded-[16px]" /> : (
              <>
                <Link className="flex items-center justify-between rounded-[16px] border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5" to="/admin/karyawan/onboarding">
                  <span><span className="block text-sm font-semibold">Onboarding pending</span><span className="text-xs text-muted-foreground">Review dan tindak lanjuti pendaftaran</span></span>
                  <span className="font-display text-xl font-bold text-primary">{formatNumber(onboarding?.pending ?? 0)}</span>
                </Link>
                <Link className="flex items-center justify-between rounded-[16px] border p-4 transition-colors hover:border-primary/40 hover:bg-primary/5" to="/admin/karyawan/onboarding/kontrak">
                  <span><span className="block text-sm font-semibold">Perlu revisi</span><span className="text-xs text-muted-foreground">Data onboarding yang perlu dilengkapi</span></span>
                  <span className="font-display text-xl font-bold text-amber-600">{formatNumber(onboarding?.needsRevision ?? 0)}</span>
                </Link>
                <div className="flex items-center justify-between rounded-[16px] border border-dashed p-4">
                  <span><span className="block text-sm font-semibold">Data nonaktif</span><span className="text-xs text-muted-foreground">Tidak dihitung dalam operasional aktif</span></span>
                  <span className="font-display text-xl font-bold">{dataLoading ? "—" : formatNumber(inactiveUsers.length)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <Link className="group rounded-[24px] border border-border/70 bg-card p-5 shadow-[0_4px_24px_rgba(9,9,11,0.04)] transition-colors hover:border-primary/40" to="/admin/karyawan/kehadiran/jadwal">
          <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="mt-4 font-display font-semibold">Atur jadwal & shift</p>
          <p className="mt-1 text-sm text-muted-foreground">Kelola jadwal tanpa berpindah ke menu operasional.</p>
        </Link>
        <Link className="group rounded-[24px] border border-border/70 bg-card p-5 shadow-[0_4px_24px_rgba(9,9,11,0.04)] transition-colors hover:border-primary/40" to="/admin/karyawan/payroll">
          <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="mt-4 font-display font-semibold">Buka payroll</p>
          <p className="mt-1 text-sm text-muted-foreground">Lihat periode, aturan role, dan slip gaji.</p>
        </Link>
        <Link className="group rounded-[24px] border border-border/70 bg-card p-5 shadow-[0_4px_24px_rgba(9,9,11,0.04)] transition-colors hover:border-primary/40" to="/admin/karyawan/onboarding/kontrak">
          <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" />
          <p className="mt-4 font-display font-semibold">Dokumen & kontrak</p>
          <p className="mt-1 text-sm text-muted-foreground">Akses template dan riwayat kontrak karyawan.</p>
        </Link>
      </section>
    </main>
  );
}
