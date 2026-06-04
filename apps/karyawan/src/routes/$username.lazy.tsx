import { createLazyFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
/* HERMES: rebuild trigger — live payslip + bonus target + attendance reminder */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
const DISMISS_PREFIX_ABSEN = "checkin_remind_dismiss_";

function AttendanceReminder({ userId, userName }: { userId?: string; userName?: string }) {
  const [state, setState] = useState<"loading" | "none" | "show">("loading");
  const [scheduleInfo, setScheduleInfo] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) { setState("none"); return; }
    const todayKey = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(`${DISMISS_PREFIX_ABSEN}${todayKey}_${userId}`) === "1") {
        setState("none"); return;
      }
    } catch { /* */ }

    (async () => {
      try {
        const supabase = createClient();
        // Cek jadwal hari ini (WIB)
        const now = new Date(Date.now() + 7 * 3600 * 1000);
        const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

        const { data: schedule } = await supabase
          .schema("pos")
          .from("attendance_schedules")
          .select("shift_name, start_time")
          .eq("user_id", userId)
          .eq("date", todayStr)
          .not("shift_name", "ilike", "%off%")
          .limit(1);

        if (!schedule || schedule.length === 0) {
          setState("none"); return;
        }

        // Cek apakah sudah check-in hari ini
        const dayStart = now.getTime() - (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) * 1000;
        const dayEnd = dayStart + 86400000;

        const { data: logs } = await supabase
          .from("pos_attendance_logs")
          .select("_id")
          .eq("userName", userName)
          .eq("type", "check_in")
          .gte("timestamp", dayStart)
          .lt("timestamp", dayEnd)
          .limit(1);

        if (logs && logs.length > 0) {
          setState("none"); return;
        }

        // Ada jadwal, belum check-in → show popup
        setScheduleInfo(schedule.map((s: any) => s.shift_name).join(", "));
        setState("show");
      } catch {
        setState("none");
      }
    })();
  }, [userId, userName]);

  const dismiss = useCallback(() => {
    setState("none");
    const todayKey = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(`${DISMISS_PREFIX_ABSEN}${todayKey}_${userId}`, "1"); } catch { /* */ }
  }, [userId]);

  if (state !== "show") return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mx-auto w-full max-w-2xl px-4 pt-2"
      >
        <div className="relative flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Belum Absen Masuk!</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Kamu dijadwalkan <strong>{scheduleInfo}</strong> hari ini, tapi belum check-in. 
              Silakan absen di halaman <strong>Absensi</strong>.
            </p>
            <button
              onClick={() => navigate({ to: `/${userName}/absensi` as any, params: { userName: userName! } } as any)}
              className="mt-2 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors"
            >
              Buka Absensi
            </button>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 rounded-full p-1 text-amber-400 hover:bg-amber-100 hover:text-amber-600 transition-colors"
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
					<BottomNavbar baseRoute={`/${username}`} />
				</div>
			</div>
		</StaffProfileCtx.Provider>
	);
}
