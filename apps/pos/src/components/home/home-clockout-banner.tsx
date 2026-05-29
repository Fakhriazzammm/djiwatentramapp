import { useState, useEffect } from "react";
import { AlertCircle, CalendarClock, X, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { createClient } from "@/lib/client";

const DISMISS_PREFIX = "prev_shift_clockout_dismiss_";
const WIB_OFFSET = 7 * 60 * 60 * 1000;

function getTodayKey(): string {
  const now = new Date(Date.now() + WIB_OFFSET);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a + WIB_OFFSET);
  const db = new Date(b + WIB_OFFSET);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

function isDismissed(checkInDate: string): boolean {
  try {
    return localStorage.getItem(`${DISMISS_PREFIX}${checkInDate}`) === "1";
  } catch { return false; }
}

function markDismissed(checkInDate: string): void {
  try { localStorage.setItem(`${DISMISS_PREFIX}${checkInDate}`, "1"); } catch { /* */ }
}

interface Props {
  userId?: string;
}

export function HomeClockOutBanner({ userId }: Props) {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "none" | "show">("loading");
  const [checkInTime, setCheckInTime] = useState<number>(0);
  const [clocking, setClocking] = useState(false);

  useEffect(() => {
    if (!userId) { setState("none"); return; }

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("get_currently_in_store");

        if (error) throw error;
        if (!data || !Array.isArray(data)) { setState("none"); return; }

        // Cari user saat ini
        const myEntry = (data as any[]).find(
          (u: any) => String(u.user_id) === userId,
        );

        if (!myEntry) { setState("none"); return; }

        const checkInTs = Number(myEntry.check_in_time ?? 0);
        if (!checkInTs) { setState("none"); return; }

        // Cek apakah check-in dari HARI SEBELUMNYA
        const now = Date.now();
        if (isSameDay(checkInTs, now)) {
          // Check-in hari ini → bukan notifikasi yg kita cari
          setState("none");
          return;
        }

        // Check-in dari hari sebelumnya! Cek dismiss
        const checkInDate = new Date(checkInTs + WIB_OFFSET);
        const dateKey = `${checkInDate.getUTCFullYear()}-${String(checkInDate.getUTCMonth() + 1).padStart(2, "0")}-${String(checkInDate.getUTCDate()).padStart(2, "0")}`;

        if (isDismissed(dateKey)) {
          setState("none");
          return;
        }

        setCheckInTime(checkInTs);
        setState("show");
      } catch (err) {
        console.error("[HomeClockOutBanner] Error:", err);
        setState("none");
      }
    })();
  }, [userId]);

  if (state !== "show") return null;

  const checkInDate = new Date(checkInTime + WIB_OFFSET);
  const dateStr = checkInDate.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeStr = checkInDate.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit",
  });
  const elapsed = Date.now() - checkInTime;
  const daysLate = Math.floor(elapsed / 86400000);

  const handleClockOut = async () => {
    setClocking(true);
    // Navigasi ke /attendance — handleFaceProcessed akan handle clock-out
    navigate({ to: "/attendance" as any });
  };

  const handleDismiss = () => {
    const d = new Date(checkInTime + WIB_OFFSET);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    markDismissed(key);
    setState("none");
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-xllll border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 shadow-sm dark:border-red-800/40 dark:from-red-950/20 dark:to-orange-950/10">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 p-4 pr-10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
          <CalendarClock className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-red-800 text-sm dark:text-red-200">
            Kamu lupa absen keluar!
          </h4>
          <p className="mt-0.5 text-red-700 text-xs dark:text-red-300/70">
            Kamu masih terdaftar absen masuk sejak{" "}
            <strong>{dateStr}</strong> pukul <strong>{timeStr}</strong>
            {daysLate > 0 && (
              <> ({daysLate} hari yang lalu)</>
            )}.
            {" "}Clock-out dulu sebelum absen masuk hari ini.
          </p>

          <button
            type="button"
            onClick={handleClockOut}
            disabled={clocking}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {clocking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            Clock-out Sekarang & Absen Masuk
          </button>
        </div>
      </div>
    </div>
  );
}
