import { createLazyFileRoute, Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
/* HERMES: rebuild trigger — live payslip + bonus target + attendance reminder */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useYumiAuth, useHybridStaffBySlug, useHybridCurrentlyInStore } from "@djiwaapps/web-shared";
import { DsButton, DsNote, DsRoot, DsTabBar, ds3d } from "@djiwaapps/web-shared/components/ds";
import { AbsenSheet } from "@/components/karyawan/AbsenSheet";
import { PermissionGate } from "@/components/karyawan/PermissionGate";
import { OnboardingGuide, guideSeen } from "@/components/karyawan/OnboardingGuide";
import { useTodayAttendance, type TodayAttendance } from "@/components/karyawan/use-staff-data";
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
	/** Status absen hari ini (sumber tunggal untuk tombol tengah dan Beranda). */
	today: TodayAttendance;
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

function AttendanceReminder({ userId, username: routeUsername }: { userId?: string; userName?: string; username?: string }) {
  const [missed, setMissed] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    let off = false;
    (async () => {
      try {
        const supabase = createClient();
        const nowWib = new Date(Date.now() + 7 * 3600_000);
        const today = wibTodayStr();
        const startStr = `${today.slice(0, 8)}01`;
        const endStr = new Date(nowWib.getTime() - 86400_000).toISOString().slice(0, 10);
        if (endStr < startStr) return; // hari pertama bulan
        try { const st = localStorage.getItem(`${DISMISS_KEY_MISSED}${userId}`); if (st && st >= endStr) return; } catch { /* */ }

        const [{ data: schedules }, { data: logs }, { data: reqs }] = await Promise.all([
          supabase.schema("pos").from("attendance_schedules").select("date, shift_name, status").eq("user_id", userId).gte("date", startStr).lte("date", endStr).not("shift_name", "ilike", "%off%"),
          supabase.from("pos_attendance_logs").select("timestamp").eq("userId", userId).eq("type", "check_in").gte("timestamp", Date.parse(`${startStr}T00:00:00+07:00`)).lt("timestamp", Date.parse(`${today}T00:00:00+07:00`)),
          // Hari yang sudah diajukan izin/cuti/sakit/koreksi (menunggu atau disetujui) tidak dianggap terlewat.
          supabase.from("attendance_leave_requests").select("leave_type,start_date,end_date,status").eq("user_id", userId).in("status", ["pending", "approved"]).lte("start_date", endStr).gte("end_date", startStr),
        ]);
        const worked = new Set((logs ?? []).map((l: any) => tsToWibDateStr(l.timestamp)));
        const covered = (d: string) => (reqs ?? []).some((r: any) => r.leave_type !== "tukar_shift" && r.start_date <= d && r.end_date >= d);
        const list = (schedules ?? []).filter((x: any) => x.status !== "off" && !worked.has(x.date) && !covered(x.date)).map((x: any) => x.date as string).sort();
        if (!off) setMissed(list);
      } catch { /* diam: pengingat bukan fitur kritis */ }
    })();
    return () => { off = true; };
  }, [userId]);

  const dismiss = useCallback(() => {
    setMissed([]);
    const y = new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    try { localStorage.setItem(`${DISMISS_KEY_MISSED}${userId}`, y); } catch { /* */ }
  }, [userId]);

  if (missed.length === 0) return null;
  const label = missed.length > 3 ? `${missed.length} hari (${formatDateId(missed[0])} – ${formatDateId(missed[missed.length - 1])})` : missed.map(formatDateId).join(", ");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-2">
      <DsNote tone="danger" icon={<BellRing aria-hidden="true" size={22} />} action={<DsButton size="sm" variant="danger" onClick={() => navigate({ to: "/$username/koreksi-absen" as any, params: { username: routeUsername! }, search: { date: missed[0], type: "check_in" } } as any)}>Koreksi</DsButton>}>
        <b>Absen masuk terlewat · {label}</b>
        Ada jadwal tapi tidak ada catatan absen masuk, dan ini memengaruhi gaji. Ajukan koreksi bila kamu sebenarnya masuk.{" "}
        <button type="button" onClick={dismiss} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", font: "inherit" }}>Tutup</button>
      </DsNote>
    </div>
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
	const today = useTodayAttendance(authUser?._id ?? staff?._id, refreshKey);
	const [, bump] = useState(0);
	useEffect(() => { const h = () => bump((n) => n + 1); window.addEventListener("kx-guide-closed", h); return () => window.removeEventListener("kx-guide-closed", h); }, []);

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

	const isIn = today.loading ? (currentlyIn?.some((x: any) => x._id === staff?._id) ?? false) : today.isIn;
	const fabState = isIn ? "out" : today.finished ? "done" : "in";
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
		today,
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
						<button type="button" className="ds-fab" data-state={fabState} aria-label={isIn ? "Absen keluar" : today.finished ? "Absen hari ini selesai" : "Absen masuk"} disabled={today.finished && !isIn} onClick={() => setAbsenOpen(true)}>
							{today.finished && !isIn
								? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
								: isIn
								? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
								: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11v4" /><path d="M8 15a4 4 0 0 1 8 0" /><path d="M5 12a7 7 0 0 1 14 0" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>}
						</button>
					}
				/>
				{authUser?.slug === username && <OnboardingGuide userId={authUser._id} autoOpen />}
				{authUser?.slug === username && guideSeen(authUser._id) && <PermissionGate hasFace={Boolean(authUser?.hasFace)} onEnroll={() => navigate({ to: "/$username/absensi" as any, params: { username }, search: { enroll: 1 } } as any)} />}
				{absenOpen && (
					<AbsenSheet
						isIn={isIn}
						token={token}
						onRecorded={() => { today.reload(); setRefreshKey((k) => k + 1); }}
						onClose={() => setAbsenOpen(false)}
						onClosing={() => { setAbsenOpen(false); go("absen-keluar"); }}
						onHistory={() => { setAbsenOpen(false); go("jadwal"); }}
					/>
				)}
			</DsRoot>
		</StaffProfileCtx.Provider>
	);
}
