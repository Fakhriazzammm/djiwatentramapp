import { createLazyFileRoute, Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
/* HERMES: rebuild trigger — live payslip + bonus target + attendance reminder */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useYumiAuth, useHybridStaffBySlug, useHybridCurrentlyInStore } from "@djiwaapps/web-shared";
import { DsRoot, DsTabBar, ds3d } from "@djiwaapps/web-shared/components/ds";
import { AbsenSheet } from "@/components/karyawan/AbsenSheet";
import { createClient } from "@djiwaapps/web-shared/lib/client";
import { HomeClockOutBanner } from "@djiwaapps/web-shared/components/home/home-clockout-banner";
import { Button } from "@djiwaapps/web-shared/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, UserCircle, ShieldCheck, BellRing, X } from "lucide-react";

/* Force Vite code-split untuk leaderboard */
void import("./$username/leaderboard.lazy");

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
	notifCount: number;
	openAbsen: () => void;
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

function AttendanceReminder({ userId, userName, username: routeUsername }: { userId?: string; userName?: string; username?: string }) {
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
        <section aria-labelledby="attendance-reminder-title" className="karyawan-card relative flex items-start gap-3 border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <BellRing aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <h2 id="attendance-reminder-title" className="text-sm font-bold">Absensi Terlewat</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-800">
              Kamu tidak check-in sebanyak <strong>{count} hari</strong>: {label}.
              Data absensi ini memengaruhi penggajian. Silakan hubungi atasan jika ada kendala.
            </p>
            <button
              onClick={() => navigate({ to: "/$username/absensi" as any, params: { username: routeUsername! } })}
              className="karyawan-control mt-2 bg-rose-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-rose-700 active:scale-[.97]"
            >
              Buka Riwayat Absensi
            </button>
          </div>
          <button
            onClick={dismiss}
            aria-label="Tutup pengingat absensi"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-rose-500 transition-colors hover:bg-rose-100 hover:text-rose-700"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </section>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Main layout ────────────────────────────────── */
function StaffProfileLayout() {
	const { username } = useParams({ from: "/$username" as any }) as { username: string };
	const navigate = useNavigate();
	const { user: authUser, isAdmin, isAuthenticated, token, isLoading: isAuthLoading } = useYumiAuth();

	const [refreshKey, setRefreshKey] = useState(0);
	const [notifCount, setNotifCount] = useState(0);
	const [absenOpen, setAbsenOpen] = useState(false);
	const location = useLocation();
	const currentlyIn = useHybridCurrentlyInStore();

	// Auto-unlock if current user is the owner or an admin
	const isUnlocked = useMemo(() => {
		if (!isAuthenticated || !authUser) return false;
		const isOwner = authUser.slug === username || authUser._id === username;
		return isOwner || isAdmin;
	}, [isAuthenticated, authUser, isAdmin, username]);

		// Auto-refresh when page gains focus
	useEffect(() => {
		const onFocus = () => setRefreshKey((k) => k + 1);
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, []);

	// Prevent browser back button from returning to /login
	useEffect(() => {
		if (isUnlocked) {
			window.history.pushState(null, "", window.location.href);
		}
	}, [isUnlocked]);

	/*
	 * Guard akses profil. Dijalankan sebagai efek, bukan di tengah render —
	 * versi lama memanggil window.location.replace("/login") langsung di body
	 * render, yang berarti efek samping saat render (dobel di StrictMode) dan
	 * reload halaman penuh, bukan navigasi SPA.
	 */
	useEffect(() => {
		if (isAuthLoading || isUnlocked) return;

		if (!isAuthenticated) {
			navigate({ to: "/login" as any, replace: true });
			return;
		}

		// Sudah login tapi membuka profil orang lain → arahkan ke profilnya sendiri.
		const ownHandle = authUser?.slug || authUser?._id;
		if (ownHandle && ownHandle !== username) {
			navigate({ to: "/$username", params: { username: ownHandle }, replace: true } as any);
		}
	}, [isAuthLoading, isUnlocked, isAuthenticated, authUser, username, navigate]);

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

	// Guard: belum ter-unlock → tampilkan loader sementara efek di atas
	// mengalihkan halaman. Jangan render isi profil siapa pun di sini.
	if (!isUnlocked) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
					<Clock className="h-8 w-8 text-primary opacity-50" />
				</motion.div>
			</div>
		);
	}

	const isIn = currentlyIn?.some((x: any) => x._id === staff?._id) ?? false;
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
		notifCount,
		openAbsen: () => setAbsenOpen(true),
	};

	const path = location.pathname;
	const base = `/${username}`;
	const active = path.startsWith(`${base}/jadwal`) ? "jadwal" : path.startsWith(`${base}/gaji`) || path.startsWith(`${base}/slip-gaji`) ? "gaji" : path.startsWith(`${base}/profil`) ? "profil" : "beranda";
	const go = (to: string) => navigate({ to: `/$username/${to}` as any, params: { username } });

	return (
		<StaffProfileCtx.Provider value={outletContext}>
			<DsRoot className="karyawan-shell ds-legacy fixed inset-0 flex min-w-0 flex-col" >
				<main id="main-content" className="ds-screen min-w-0 flex-1 overflow-y-auto overscroll-contain">
					<div className="mx-auto w-full max-w-[560px]">
						<div className="pt-2"><HomeClockOutBanner userId={authUser?._id} /></div>
						<AttendanceReminder userId={staff?._id ?? authUser?._id} userName={staff?.name ?? authUser?.name} username={username} />
						<Outlet />
					</div>
				</main>
				<DsTabBar
					active={active}
					onSelect={go}
					tabs={[
						{ id: "beranda", label: "Beranda", icon: ds3d("employee-home") },
						{ id: "jadwal", label: "Jadwal", icon: ds3d("employee-schedule") },
						{ id: "gaji", label: "Gaji", icon: ds3d("employee-salary") },
						{ id: "profil", label: "Profil", icon: ds3d("employee-nav-profile") },
					]}
					center={
						<button type="button" className="ds-fab" data-state={isIn ? "in" : undefined} aria-label={isIn ? "Absen keluar" : "Absen masuk"} onClick={() => setAbsenOpen(true)}>
							{isIn
								? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
								: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11v4" /><path d="M8 15a4 4 0 0 1 8 0" /><path d="M5 12a7 7 0 0 1 14 0" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>}
						</button>
					}
				/>
				{absenOpen && (
					<AbsenSheet
						isIn={isIn}
						onClose={() => setAbsenOpen(false)}
						onClosing={() => { setAbsenOpen(false); go("absen-keluar"); }}
						onHistory={() => { setAbsenOpen(false); go("jadwal"); }}
					/>
				)}
			</DsRoot>
		</StaffProfileCtx.Provider>
	);
}
