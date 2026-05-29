import { useState, useEffect, useCallback } from "react";
import { AlertCircle, CheckCircle, Loader2, Clock, UserCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/client";

const DISMISS_KEY_PREFIX = "attendance_reminder_dismiss_";
const WIB_OFFSET = 7 * 60 * 60 * 1000;

interface CheckedInUser {
  user_id: string;
  user_name: string;
  role_id: string | null;
  check_in_time: number;
}

function getTodayKey(): string {
  const now = new Date(Date.now() + WIB_OFFSET);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY_PREFIX + getTodayKey()) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY_PREFIX + getTodayKey(), "1");
  } catch { /* silent */ }
}

export function AttendanceCloseoutReminder() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<CheckedInUser[]>([]);
  const [bulking, setBulking] = useState(false);
  const [dismissed, setDismissed] = useState(isDismissed());
  const [processed, setProcessed] = useState(false);

  const fetchCheckedIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("get_currently_in_store");
      if (rpcError) throw rpcError;
      setCheckedIn(data ?? []);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCheckedIn();
  }, [fetchCheckedIn]);

  // Only show for users checked in >30 min ago and it's past 6pm WIB
  const now = Date.now();
  const wibHour = new Date(now + WIB_OFFSET).getUTCHours();

  const overdue = checkedIn.filter((u) => {
    const elapsed = now - Number(u.check_in_time ?? 0);
    return elapsed > 30 * 60 * 1000; // > 30 min
  });

  // Auto-hide if no overdue users
  const hasOverdue = overdue.length > 0;
  const isAfterHours = wibHour >= 18; // 6pm WIB
  const shouldShow = hasOverdue && !dismissed && !processed;

  if (loading) return null; // Don't show loading state — silent background

  if (!shouldShow) return null;

  const handleBulkClockOut = async () => {
    setBulking(true);
    const supabase = createClient();
    const now = Date.now();
    let success = 0;
    let failed = 0;

    for (const user of overdue) {
      try {
        const id = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        const { error: insertError } = await supabase
          .schema("legacy_mirror")
          .from("documents")
          .insert({
            table_name: "attendance",
            document_id: id,
            creation_time: now,
            document: {
              userId: user.user_id,
              type: "check_out",
              timestamp: now,
              location: null,
              notes: `Bulk clock-out admin: lupa absen keluar ${getTodayKey()}`,
            },
          });

        if (insertError) throw insertError;
        success++;
      } catch (err: any) {
        console.error(`Failed bulk clock-out for ${user.user_name}:`, err);
        failed++;
      }
    }

    setBulking(false);

    if (success > 0) {
      toast.success(
        `${success} karyawan berhasil di-clock-out!`,
        { id: "bulk-clockout" },
      );
      setProcessed(true);
      // Refresh the list
      fetchCheckedIn();
    }

    if (failed > 0) {
      toast.error(`${failed} gagal — cek console`);
    }
  };

  const handleDismiss = () => {
    markDismissed();
    setDismissed(true);
  };

  return (
    <div className="rounded-xllll border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-amber-800 text-sm dark:text-amber-200">
                {overdue.length} Karyawan Belum Absen Keluar
              </h4>
              <p className="text-amber-700 text-xs dark:text-amber-300/70">
                {isAfterHours
                  ? "Sudah lewat jam operasional. Clock-out manual diperlukan agar besok bisa absen masuk."
                  : "Beberapa karyawan belum clock-out sejak masuk."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {overdue.map((u) => {
              const checkIn = new Date(Number(u.check_in_time ?? 0));
              const duration = Math.round(
                (now - Number(u.check_in_time ?? 0)) / (1000 * 60),
              );
              return (
                <span
                  key={u.user_id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-3 py-1 text-amber-800 text-xs font-medium dark:bg-amber-900/30 dark:text-amber-300"
                >
                  <Clock className="h-3 w-3" />
                  {u.user_name}
                  <span className="text-amber-500 dark:text-amber-400">
                    ({duration}m)
                  </span>
                </span>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              className="h-8 bg-amber-600 text-xs text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
              onClick={handleBulkClockOut}
              disabled={bulking}
            >
              {bulking ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <UserCheck className="mr-1 h-3.5 w-3.5" />
                  Bulk Clock-Out ({overdue.length})
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-amber-700 text-xs hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
              onClick={handleDismiss}
            >
              Tutup
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-amber-600 text-xs hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
              onClick={fetchCheckedIn}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Refresh
            </Button>
          </div>

          {processed && (
            <p className="flex items-center gap-1.5 text-green-700 text-xs dark:text-green-400">
              <CheckCircle className="h-3.5 w-3.5" />
              Clock-out berhasil diproses. Notifikasi ini tidak akan muncul lagi untuk hari ini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
