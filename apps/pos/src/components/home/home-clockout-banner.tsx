import { useState, useEffect } from "react";
import { AlertCircle, Clock, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

const DISMISS_KEY = "home_remind_clockout_dismiss";
const WIB_OFFSET = 7 * 60 * 60 * 1000;

function getTodayKey(): string {
  const now = new Date(Date.now() + WIB_OFFSET);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(`${DISMISS_KEY}_${getTodayKey()}`) === "1";
  } catch { return false; }
}

function markDismissed(): void {
  try { localStorage.setItem(`${DISMISS_KEY}_${getTodayKey()}`, "1"); } catch { /* */ }
}

interface Props {
  isWorking: boolean;
  lastCheckIn: number | null;
}

export function HomeClockOutBanner({ isWorking, lastCheckIn }: Props) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(isDismissed);

  // Reset if no longer working
  useEffect(() => { if (!isWorking) setDismissed(false); }, [isWorking]);

  if (!isWorking || dismissed || !lastCheckIn) return null;

  // Jangan tampilkan jika baru clock-in <30 menit
  const elapsed = Date.now() - lastCheckIn;
  if (elapsed < 30 * 60 * 1000) return null;

  const wibHour = new Date(Date.now() + WIB_OFFSET).getUTCHours();
  const isAfterHours = wibHour >= 18;
  const checkInTime = new Date(lastCheckIn).toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="relative mb-4 overflow-hidden rounded-xllll border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm dark:border-amber-800/40 dark:from-amber-950/20 dark:to-orange-950/10">
      <button
        type="button"
        onClick={() => { markDismissed(); setDismissed(true); }}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3 p-4 pr-10">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-amber-800 text-sm dark:text-amber-200">
            {isAfterHours
              ? "Kamu belum absen keluar!"
              : "Kamu sedang absen masuk"}
          </h4>
          <p className="mt-0.5 text-amber-700 text-xs dark:text-amber-300/70">
            Sejak {checkInTime}
            {isAfterHours
              ? ". Jam operasional sudah selesai."
              : `. Jangan lupa absen keluar ya.`}
            {" "}Durasi: {Math.floor(elapsed / 3600000)}j {Math.floor((elapsed % 3600000) / 60000)}m
          </p>

          <button
            type="button"
            onClick={() => navigate({ to: "/attendance" as any })}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Clock-Out Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
