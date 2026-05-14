import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronDown, Eye, FileSignature, Loader2, MoreHorizontal, PencilLine, PlusCircle, RefreshCw, Search, Trash2, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/client";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { triggerHybridRefresh } from "@/hooks/use-hybrid-pos-data";
import { useHybridApproveApplication, useHybridSetOnboardingStatus, useHybridDeleteApplication, useHybridBulkDeleteApplications } from "@/hooks/use-employee-onboarding-actions";
import { normalizeEmployeeOnboardingSettings } from "@/lib/employee-onboarding-settings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* -------- status meta -------- */
const STATUS_META: Record<string, { label: string; variant: string }> = {
  pending:   { label: "Pending",   variant: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",  variant: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected:  { label: "Ditolak",   variant: "bg-red-100 text-red-700 border-red-200" },
  needs_revision: { label: "Revisi", variant: "bg-purple-100 text-purple-700 border-purple-200" },
  contract_signed: { label: "Selesai ✅", variant: "bg-sky-100 text-sky-700 border-sky-200" },
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "secondary",
  rejected: "destructive",
  needs_revision: "outline",
};

/* -------- transitions -------- */
type Transition = { value: string; label: string; icon: React.ReactNode };

function getValidTransitions(status: string): Transition[] {
  const map: Record<string, Transition[]> = {
    pending: [
      { value: "approve", label: "Setujui", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
      { value: "rejected", label: "Tolak", icon: <XCircle className="h-3.5 w-3.5" /> },
      { value: "needs_revision", label: "Minta Revisi", icon: <PencilLine className="h-3.5 w-3.5" /> },
    ],
    rejected: [
      { value: "pending", label: "Aktifkan Kembali", icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ],
    needs_revision: [
      { value: "approve", label: "Setujui", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
      { value: "rejected", label: "Tolak", icon: <XCircle className="h-3.5 w-3.5" /> },
      { value: "pending", label: "Kembalikan ke Pending", icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ],
  };
  return map[status] ?? [];
}

/* -------- StatusCell component -------- */
function StatusCell({
  app,
  onboardingSettings,
  onStatusChange,
}: {
  app: any;
  onboardingSettings: any;
  onStatusChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const setStatus = useHybridSetOnboardingStatus();
  const approveApp = useHybridApproveApplication();
  const deleteApp = useHybridDeleteApplication();
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const options = useMemo(() => getValidTransitions(app.status), [app.status]);
  const canDelete = app.status !== "approved" && app.status !== "contract_signed";

  async function handleTransition(option: Transition) {
    const name = app.full_name || "Karyawan";

    if (option.value === "approve") {
      const defaultsAvailable = onboardingSettings?.defaultPassword && onboardingSettings?.defaultRoleId;
      if (defaultsAvailable) {
        if (!window.confirm(`Setujui "${name}"? User akan dibuat otomatis dengan pengaturan default.`)) return;
        setSaving(true);
        try {
          const autoUsername = (name.toLowerCase().replace(/[^a-z0-9]/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "") || "user")
            + Math.random().toString(36).slice(2, 6);
          await approveApp({
            applicationId: String(app.id),
            username: autoUsername,
            name,
            roleId: onboardingSettings.defaultRoleId,
            homePin: app.raw?.registrationNumber?.slice(-6) || "123456",
            onboardingApplicationId: String(app.id),
            employment: app.employment || {},
            reviewNotes: null,
            reviewedBy: "admin",
          });
          toast.success(`✅ "${name}" disetujui — username: ${autoUsername}`);
          onStatusChange();
        } catch (e: any) {
          toast.error(e?.message || "Gagal approve");
        } finally {
          setSaving(false);
          setOpen(false);
        }
      } else {
        setOpen(false);
        navigate({
          to: "/admin/operational-team/register/application/$registrationNumber",
          params: { registrationNumber: app.raw?.registrationNumber || app.id },
        });
      }
      return;
    }

    const label = option.label.toLowerCase();
    if (!window.confirm(`${label} "${name}" dari ${app.status}?`)) return;
    setSaving(true);
    try {
      await setStatus({ id: String(app.id), status: option.value as any });
      toast.success(`"${name}" → ${STATUS_META[option.value]?.label || option.value}`);
      onStatusChange();
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengubah status");
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  async function handleDelete() {
    const name = app.full_name || "Karyawan";
    if (!window.confirm(`Hapus pendaftaran "${name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    setDeleting(true);
    try {
      await deleteApp(String(app.id));
      toast.success(`"${name}" dihapus`);
      onStatusChange();
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  }

  const meta = STATUS_META[app.status] || STATUS_META.pending;

  return (
    <div className="flex items-center gap-1">
      {/* Clickable Status Badge */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          disabled={saving || deleting || app.status === "contract_signed"}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-all hover:ring-2 hover:ring-offset-1 ${
            meta.variant
          } ${saving || deleting ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {meta.label}
          {(options.length > 0 || app.status === "pending") && !saving && (
            <ChevronDown className="h-3 w-3" />
          )}
          {app.status === "approved" && app.raw?.pipelineStep === "contract_signed" && (
            <span className="ml-0.5">✓</span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1 w-52 rounded-lg border bg-popover p-1 shadow-lg">
              {options.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">Tidak ada aksi tersedia</div>
              ) : (
                options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTransition(opt)}
                    disabled={saving}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Kebab Menu (⋮) for delete */}
      {canDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive gap-2 text-xs"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/* -------- page -------- */
export function AdminOnboardingPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [pipelineFilter, setPipelineFilter] = useState<string>("");
  const navigate = useNavigate();
  const siteSettings = useHybridSiteSettings();
  const onboardingSettings = useMemo(() => normalizeEmployeeOnboardingSettings(siteSettings?.employeeOnboarding), [siteSettings?.employeeOnboarding]);
  const deleteApp = useHybridDeleteApplication();
  const bulkDeleteApps = useHybridBulkDeleteApplications();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("employee_onboarding_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("[Onboarding] Query error:", error);
          toast.error("Gagal memuat data pendaftaran: " + error.message);
        }
        if (data) setApplications(data as any[]);
        setIsLoading(false);
      });
  }, []);

  function refreshApplications() {
    setIsLoading(true);
    setSelectedIds(new Set());
    const supabase = createClient();
    supabase
      .from("employee_onboarding_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error("[Onboarding] Refresh error:", error);
          toast.error("Gagal refresh: " + error.message);
        }
        if (data) {
          setApplications(data as any[]);
          toast.success(`Data dimuat: ${data.length} pendaftaran`);
        }
        setIsLoading(false);
      });
  }

  /* ---- selection ---- */
  const allSelected = applications.length > 0 && selectedIds.size === applications.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < applications.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(applications.map((a) => String(a.id))));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function deleteSingle(id: string, name: string) {
    if (!window.confirm(`Hapus pendaftaran "${name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    setIsDeleting(true);
    try {
      await deleteApp(id);
      setApplications((prev) => prev.filter((a) => String(a.id) !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success(`Pendaftaran "${name}" dihapus`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus pendaftaran");
    } finally {
      setIsDeleting(false);
    }
  }

  async function deleteBulk() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Hapus ${selectedIds.size} pendaftaran terpilih? Aksi ini tidak bisa dibatalkan.`)) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      await bulkDeleteApps(ids);
      setApplications((prev) => prev.filter((a) => !selectedIds.has(String(a.id))));
      toast.success(`${selectedIds.size} pendaftaran dihapus`);
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus pendaftaran");
    } finally {
      setIsDeleting(false);
    }
  }

  const stats = useMemo(
    () => ({
      pending: applications.filter((a: any) => a.status === "pending").length,
      approved: applications.filter((a: any) => a.status === "approved" && a.raw?.pipelineStep !== "contract_signed").length,
      waitingContract: applications.filter((a: any) => a.status === "approved" && a.raw?.pipelineStep !== "contract_signed").length,
      selesai: applications.filter((a: any) => a.raw?.pipelineStep === "contract_signed" || a.status === "contract_signed").length,
      revision: applications.filter((a: any) => a.status === "needs_revision").length,
    }),
    [applications],
  );

  const filtered = useMemo(() => {
    let list = applications;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a: any) =>
          (a.full_name || "").toLowerCase().includes(q) ||
          (a.phone || "").includes(q) ||
          (a.employment?.roleName || "").toLowerCase().includes(q) ||
          (a.status || "").toLowerCase().includes(q) ||
          (a.raw?.registrationNumber || "").toLowerCase().includes(q),
      );
    }
    if (pipelineFilter) {
      if (pipelineFilter === "waiting_contract") {
        list = list.filter((a: any) => a.status === "approved" && a.raw?.pipelineStep !== "contract_signed");
      } else if (pipelineFilter === "contract_signed") {
        list = list.filter((a: any) => a.raw?.pipelineStep === "contract_signed");
      } else {
        list = list.filter((a: any) => a.status === pipelineFilter);
      }
    }
    return list;
  }, [applications, search, pipelineFilter]);

  /* ---- render ---- */
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-4 sm:py-6 sm:space-y-6">
      {/* ---- header ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge variant="secondary" className="mb-2">
            <FileSignature className="mr-1 h-3 w-3" /> Onboarding Karyawan
          </Badge>
          <h1 className="text-xl font-bold sm:text-3xl">Review Register Karyawan</h1>
          <p className="mt-1 text-muted-foreground text-xs sm:text-sm">
            Approve pendaftaran dari halaman publik /register.
          </p>
          {/* ── CRUD icon badges ── */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="gap-1.5 border-sky-300 bg-sky-50 text-sky-700 text-[11px] font-semibold px-2.5 py-1">
              <PlusCircle className="h-4 w-4" /> Create
            </Badge>
            <Badge variant="outline" className="gap-1.5 border-blue-300 bg-blue-50 text-blue-700 text-[11px] font-semibold px-2.5 py-1">
              <Eye className="h-4 w-4" /> Read
            </Badge>
            <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 text-[11px] font-semibold px-2.5 py-1">
              <PencilLine className="h-4 w-4" /> Update
            </Badge>
            <Badge variant="outline" className="gap-1.5 border-red-300 bg-red-50 text-red-700 text-[11px] font-semibold px-2.5 py-1">
              <Trash2 className="h-4 w-4" /> Delete
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="default" onClick={() => window.open("/register", "_blank")} className="gap-1.5">
            <PlusCircle className="h-4 w-4" /> Tambah Pendaftaran
          </Button>
          <div className="grid grid-cols-5 gap-1.5 text-center sm:gap-2">
          <Stat label="Pending" value={stats.pending} />
          <Stat label="Approved" value={stats.approved} />
          <Stat label="Kontrak" value={stats.waitingContract} />
          <Stat label="Selesai" value={stats.selesai} />
          <Stat label="Revisi" value={stats.revision} />
        </div>
      </div>
    </div>

      {/* ---- search ---- */}
      <Card className="border-border/60">
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, nomor HP, role, status, atau no. registrasi..."
              className="h-9 pl-9 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* ---- pipeline filter ---- */}
      <div className="flex flex-wrap gap-1.5">
        {["", "pending", "approved", "waiting_contract", "contract_signed", "rejected"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={pipelineFilter === s ? "default" : "outline"}
            onClick={() => setPipelineFilter(s)}
            className="h-7 text-[11px] px-2.5"
          >
            {s ? (s === "waiting_contract" ? "Tunggu Kontrak" : s === "contract_signed" ? "Selesai" : s.charAt(0).toUpperCase() + s.slice(1)) : "Semua"}
          </Button>
        ))}
      </div>

      {/* ---- list ---- */}
      <Card className="border sm:rounded-xl">
        <CardHeader className="pb-2 sm:pb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base sm:text-lg">Daftar Pendaftaran</CardTitle>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                disabled={isDeleting}
                onClick={deleteBulk}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Hapus {selectedIds.size} terpilih
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={refreshApplications} disabled={isLoading}>
              {isLoading ? "Memuat..." : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <UserPlus className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">{search ? "Pendaftaran tidak ditemukan" : "Belum ada pendaftaran."}</p>
              <Button size="sm" variant="outline" onClick={() => window.open("/register", "_blank")} className="gap-1.5">
                <PlusCircle className="h-4 w-4" /> Buat Pendaftaran Baru
              </Button>
            </div>
          ) : (
            <>
              {/* ---- desktop table ---- */}
              <div className="hidden overflow-x-auto rounded-xl border sm:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="p-3 w-10">
                        <Checkbox checked={allSelected} data-state={someSelected ? "indeterminate" : undefined} onCheckedChange={toggleSelectAll} />
                      </th>
                      <th className="p-3">Nama</th>
                      <th className="p-3 hidden md:table-cell">Kontak</th>
                      <th className="p-3 hidden md:table-cell">Tanggal</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((app: any) => (
                      <tr key={app.id} className="hover:bg-muted/30">
                        <td className="p-2 sm:p-3">
                          <Checkbox checked={selectedIds.has(String(app.id))} onCheckedChange={() => toggleSelect(String(app.id))} />
                        </td>
                        <td className="p-2 sm:p-3">
                          <Link
                            to="/admin/operational-team/register/application/$registrationNumber"
                            params={{ registrationNumber: app.raw?.registrationNumber || app.id }}
                            className="font-medium hover:text-primary hover:underline cursor-pointer"
                          >
                            {app.full_name}
                          </Link>
                          {app.employment?.roleName && <span className="block text-[11px] text-muted-foreground">{app.employment.roleName}</span>}
                        </td>
                        <td className="p-2 sm:p-3 hidden md:table-cell text-xs text-muted-foreground">{app.phone}
                          {app.email && <span className="block truncate">{app.email}</span>}
                        </td>
                        <td className="p-2 sm:p-3 hidden md:table-cell text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</td>
                        <td className="p-2 sm:p-3">
                          <StatusCell
                            app={app}
                            onboardingSettings={onboardingSettings}
                            onStatusChange={refreshApplications}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ---- mobile cards ---- */}
              <div className="flex flex-col gap-2 px-3 sm:hidden">
                {filtered.map((app: any) => (
                  <div key={app.id} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox checked={selectedIds.has(String(app.id))} onCheckedChange={() => toggleSelect(String(app.id))} />
                        <div>
                          <Link
                            to="/admin/operational-team/register/application/$registrationNumber"
                            params={{ registrationNumber: app.raw?.registrationNumber || app.id }}
                            className="font-medium text-sm hover:text-primary hover:underline"
                          >
                            {app.full_name}
                          </Link>
                          <div className="text-muted-foreground text-xs">{app.employment?.roleName ?? "-"}</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-muted-foreground text-xs">{app.phone} &middot; {app.email}</div>
                    <div className="text-muted-foreground text-xs">{new Date(app.created_at).toLocaleDateString("id-ID")}</div>
                    <div className="flex items-center gap-2">
                      <StatusCell
                        app={app}
                        onboardingSettings={onboardingSettings}
                        onStatusChange={refreshApplications}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

/* -------- stat mini -------- */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-1.5 sm:rounded-xl sm:p-3">
      <div className="text-base font-bold sm:text-2xl">{value}</div>
      <div className="text-[10px] text-muted-foreground sm:text-xs">{label}</div>
    </div>
  );
}

export const Route = createLazyFileRoute("/admin/onboarding" as any)({ component: AdminOnboardingPage });
