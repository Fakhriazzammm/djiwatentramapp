import { createLazyFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
/* HERMES: rebuild trigger — live payslip + bonus target + attendance reminder */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useYumiAuth, useHybridStaffBySlug } from "@yumipos/web-shared";
import { createClient } from "@yumipos/web-shared/lib/client";
import { BottomNavbar } from "@yumipos/web-shared/components/layout/BottomNavbar";
import { HomeClockOutBanner } from "@yumipos/web-shared/components/home/home-clockout-banner";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, UserCircle, ShieldCheck, BellRing, X } from "lucide-react";

/** Shared context for child routes */
export interface StaffProfileContext {
	username: string;
	staff: any;
	isUnlocked: boolean;
	isAdmin: boolean;
	authUser: any;
	isAuthenticated: boolean;
	token: string | null;
	navigate: ReturnType<typeof useNavigate>;
	refreshKey: number;
}

export const StaffProfileCtx = createContext<StaffProfileContext | null>(null);

export function useStaffProfile() {
	const ctx = useContext(StaffProfileCtx);
	if (!ctx) throw new Error("useStaffProfile must be used inside /$username layout");
	return ctx;
}

export const Route = createLazyFileRoute("/$username")({
	component: StaffProfileLayout,
});

/* ── Attendance check-in reminder ───────────────── */
const DISMISS_KEY_MISSED = "checkin_remind_missed_";

/* Helper: format epoch-ms timestamp → WIB date string (YYYY-MM-DD) */
function tsToWibDateStr(ts: number): string {
  const d = new Date(ts + 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/* Helper: today's date in WIB as YYYY-MM-DD */
function wibTodayStr(): string {
  const now = new Date(Date.now() + 7 * 3600_000);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

/** Human-readable date in Indonesian format */
function formatDateId(iso: string): string {
  const m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d} ${months[m - 1]}`;
}

function AttendanceReminder({ userId, userName }: { userId?: string; userName?: string }) {
  const [state, setState] = useState<"loading" | "none" | "show">("loading");
  const [missedDates, setMissedDates] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) { setState("none"); return; }
    (async () => {
      try {
        const supabase = createClient();
        const nowWib = new Date(Date.now() + 7 * 3600_000);

        // Rentang: 1 bulan berjalan → kemarin (WIB)
        const startStr = `${nowWib.getUTCFullYear()}-${String(nowWib.getUTCMonth() + 1).padStart(2, "0")}-01`;
        const yesterdayWib = new Date(nowWib.getTime() - 86400_000);
        const endStr = `${yesterdayWib.getUTCFullYear()}-${String(yesterdayWib.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayWib.getUTCDate()).padStart(2, "0")}`;

        // Cek dismiss — simpan tanggal terakhir dismissed
        try {
          const stored = localStorage.getItem(`${DISMISS_KEY_MISSED}${userId}`);
          if (stored && stored >= endStr) {
            setState("none"); return;
          }
        } catch { /* */ }

        // Skip jika masih 1 Juni dan belum ada hari kemarin (masih di hari pertama)
        if (startStr === wibTodayStr()) {
          setState("none"); return;
        }

        // 1. Ambil semua jadwal (non-OFF) dalam rentang
        const { data: schedules } = await supabase
          .schema("pos")
          .from("attendance_schedules")
          .select("date, shift_name")
          .eq("user_id", userId)
          .gte("date", startStr)
          .lte("date", endStr)
          .not("shift_name", "ilike", "%off%");

        if (!schedules || schedules.length === 0) {
          setState("none"); return;
        }

        // 2. Ambil semua check-in dalam rentang
        const startTs = Date.UTC(nowWib.getUTCFullYear(), nowWib.getUTCMonth(), 1) - 7 * 3600_000;
        const endTs = yesterdayWib.getTime() + 86400_000 - 1;

        const { data: logs } = await supabase
          .from("pos_attendance_logs")
          .select("timestamp")
          .eq("userName", userName)
          .eq("type", "check_in")
          .gte("timestamp", startTs)
          .lt("timestamp", endTs);

        // Set of dates where user DID check in
        const checkedInDates = new Set<string>();
        if (logs) {
          for (const log of logs) {
            checkedInDates.add(tsToWibDateStr(log.timestamp));
          }
        }

        // 3. Cari jadwal tanpa check-in
        const missed: string[] = [];
        for (const s of schedules) {
          if (!checkedInDates.has(s.date)) {
            missed.push(s.date);
          }
        }

        if (missed.length === 0) {
          setState("none"); return;
        }

        setMissedDates(missed);
        setState("show");
      } catch {
        setState("none");
      }
    })();
  }, [userId, userName]);

  const dismiss = useCallback(() => {
    setState("none");
    const nowWib = new Date(Date.now() + 7 * 3600_000);
    const yesterdayWib = new Date(nowWib.getTime() - 86400_000);
    const endStr = `${yesterdayWib.getUTCFullYear()}-${String(yesterdayWib.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterdayWib.getUTCDate()).padStart(2, "0")}`;
    try { localStorage.setItem(`${DISMISS_KEY_MISSED}${userId}`, endStr); } catch { /* */ }
  }, [userId]);

  if (state !== "show") return null;

  const count = missedDates.length;
  const label = count > 3
    ? `${count} hari (${formatDateId(missedDates[0])} – ${formatDateId(missedDates[missedDates.length - 1])})`
    : missedDates.map(formatDateId).join(", ");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mx-auto w-full max-w-2xl px-4 pt-2"
      >
        <div className="relative flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 shadow-sm">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Absensi Terlewat!</p>
            <p className="mt-0.5 text-xs text-rose-700">
              Kamu tidak check-in sebanyak <strong>{count} hari</strong>: {label}.
              Data absensi ini memengaruhi penggajian. Silakan hubungi atasan jika ada kendala.
            </p>
            <button
              onClick={() => navigate({ to: `/${userName}/absensi` as any, params: { userName: userName! } } as any)}
              className="mt-2 rounded-lg bg-rose-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 transition-colors"
            >
              Buka Riwayat Absensi
            </button>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Main layout ────────────────────────────────── */
function StaffProfileLayout() {
	const { username } = useParams({ from: "/$username" as any }) as { username: string };
	const navigate = useNavigate();
	const { user: authUser, isAdmin, isAuthenticated, token, isLoading: isAuthLoading } = useYumiAuth();

	const [isUnlocked, setIsUnlocked] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const [notifCount, setNotifCount] = useState(0);

		// Auto-refresh when page gains focus
	useEffect(() => {
		const onFocus = () => setRefreshKey((k) => k + 1);
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, []);

	// Auto-unlock if current user is the owner or an admin
	useEffect(() => {
		if (isAuthenticated && authUser) {
			const isOwner = authUser.slug === username || authUser._id === username;
			if (isOwner || isAdmin) {
				setIsUnlocked(true);
			}
		}
	}, [isAuthenticated, authUser, isAdmin, username]);

	// Prevent browser back button from returning to /login
	useEffect(() => {
		if (isUnlocked) {
			window.history.pushState(null, "", window.location.href);
		}
	}, [isUnlocked]);

	const staff = useHybridStaffBySlug(username);

	// Read notification unread count from localStorage
	useEffect(() => {
		const readCount = () => {
			try {
				const stored = localStorage.getItem(`yumi_notif_count_${staff?._id || username}`);
				setNotifCount(stored ? parseInt(stored, 10) : 0);
			} catch { setNotifCount(0); }
		};
		readCount();
		window.addEventListener("storage", readCount);
		const iv = setInterval(readCount, 30000);
		return () => {
			window.removeEventListener("storage", readCount);
			clearInterval(iv);
		};
	}, [staff?._id, username]);
	// Guard: loading staff OR auth not yet resolved
	if (staff === undefined || isAuthLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
					<Clock className="h-8 w-8 text-primary opacity-50" />
				</motion.div>
			</div>
		);
	}

	// Guard: not found
	if (staff === null) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
				<div className="mb-6 rounded-full bg-destructive/10 p-6 text-destructive">
					<UserCircle className="h-16 w-16" />
				</div>
				<h2 className="mb-2 text-2xl font-bold">Profil Tidak Ditemukan</h2>
				<p className="mb-8 text-muted-foreground">Staff dengan username "{username}" tidak terdaftar atau nonaktif.</p>
				<Button onClick={() => navigate({ to: "/$username/beranda" as any, params: { username } })}>Kembali ke Portal</Button>
			</div>
		);
	}

	// Guard: after auth has resolved, if still locked → redirect to login
	if (!isUnlocked) {
		window.location.replace("/login");
		return null;
	}

	// Context shared with child routes
	const outletContext: StaffProfileContext = {
		username,
		staff,
		isUnlocked,
		isAdmin,
		authUser,
		isAuthenticated,
		token,
		navigate,
		refreshKey,
	};

	return (
		<StaffProfileCtx.Provider value={outletContext}>
			<div className="fixed inset-0 flex flex-col bg-background">
				{/* Navigation Header */}
				<header className="shrink-0 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur-md">
					<div className="mx-auto flex max-w-2xl items-center justify-center">
						<div className="flex items-center gap-2">
							<ShieldCheck className={`h-4 w-4 ${isUnlocked ? "text-emerald-500" : "text-muted-foreground"}`} />
							<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{isUnlocked ? "Private Access" : "Data Restricted"}
							</span>
						</div>
					</div>
				</header>

				{/* Clock-out reminder */}
				<div className="shrink-0 mx-auto w-full max-w-2xl px-4 pt-4">
					<HomeClockOutBanner userId={authUser?._id} />
				</div>

				{/* Attendance check-in reminder */}
				<AttendanceReminder userId={staff?._id ?? authUser?._id} userName={staff?.name ?? authUser?.name} />

				{/* Scrollable content */}
				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-2xl px-4 py-3">
						<Outlet />
					</div>
				</main>

				{/* Bottom Navbar — fixed at bottom */}
				<div className="shrink-0 border-t bg-background">
					<BottomNavbar
						baseRoute={`/${username}`}
						unreadCounts={{ notifikasi: notifCount }}
					/>
				</div>
			</div>
		</StaffProfileCtx.Provider>
	);
}
