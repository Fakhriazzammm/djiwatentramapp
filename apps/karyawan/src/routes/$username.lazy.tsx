import { createLazyFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
/* HERMES: rebuild trigger — live payslip + bonus target */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useYumiAuth, useHybridStaffBySlug } from "@yumipos/web-shared";
import { Footer } from "@yumipos/web-shared/components/layout/Footer";
import { BottomNavbar } from "@yumipos/web-shared/components/layout/BottomNavbar";
import { HomeClockOutBanner } from "@yumipos/web-shared/components/home/home-clockout-banner";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { motion } from "framer-motion";
import { Camera, Clock, Lock, ShieldCheck, UserCircle } from "lucide-react";

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

function StaffProfileLayout() {
	const { username } = useParams({ from: "/$username" as any }) as { username: string };
	const navigate = useNavigate();
	const { user: authUser, isAdmin, isAuthenticated, token, logout } = useYumiAuth();

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

	// Guard: loading
	if (staff === undefined) {
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
				<Button onClick={() => navigate({ to: "/attendance" as any })}>Kembali ke Portal</Button>
			</div>
		);
	}

	// Guard: locked (public view — not logged in as this user)
	if (!isUnlocked) {
		return <LockedView staff={staff} navigate={navigate} username={username} />;
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
			<div className="min-h-screen bg-background pb-16">
				{/* Navigation Header */}
				<header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-2 backdrop-blur-md">
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
				<div className="mx-auto max-w-2xl px-4 pt-4">
					<HomeClockOutBanner userId={authUser?._id} />
				</div>

				{/* Child route content */}
				<main className="mx-auto max-w-2xl px-4 py-3 pb-4">
					<Outlet />
				</main>

				{/* Bottom Navbar */}
				<BottomNavbar baseRoute={`/${username}`} />

				<Footer className="mt-6 pb-6" />
			</div>
		</StaffProfileCtx.Provider>
	);
}

// ── Locked View (public profile) ──────────────────────────────────────
function LockedView({ staff, navigate, username }: { staff: any; navigate: ReturnType<typeof useNavigate>; username: string }) {
	return (
		<div className="min-h-screen bg-background">
			<main className="mx-auto max-w-2xl px-4 py-10">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.95 }}
					className="space-y-10"
				>
					{/* Header Profile */}
					<div className="flex flex-col items-center text-center">
						<div className="relative mb-4">
							{staff.photoUrl ? (
								<img src={staff.photoUrl} alt={staff.name} className="h-20 w-20 rounded-2xl object-cover shadow-inner" />
							) : (
								<div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-3xl font-black text-primary shadow-inner">
									{staff.name.charAt(0)}
								</div>
							)}
							<div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-lg">
								<Lock className="h-4 w-4" />
							</div>
						</div>
						<h1 className="text-2xl font-black tracking-tight">{staff.name}</h1>
						<p className="mt-0.5 font-bold text-primary uppercase tracking-wider text-xs">{staff.roleName}</p>
					</div>

					{/* Access Restriction View */}
					<div className="mx-auto max-w-[320px] space-y-6 text-center">
						<div className="space-y-1">
							<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Akses Terbatas</p>
							<p className="text-xs text-muted-foreground">Detail riwayat absen & slip gaji hanya dapat dilihat setelah login.</p>
						</div>
						<div className="pt-2 space-y-2.5">
							<Button
								className="h-12 w-full rounded-xl text-base font-bold shadow-lg shadow-primary/20"
								onClick={() => navigate({ to: "/login" as any })}
							>
								MASUK KE SISTEM
							</Button>
							<Button
								variant="outline"
								className="h-12 w-full rounded-xl border-dashed border-primary/30 font-bold text-sm"
								onClick={() => navigate({ to: "/attendance" as any })}
							>
								<Camera className="mr-2 h-4 w-4" />
								LANGSUNG ABSENSI
							</Button>
						</div>
					</div>
				</motion.div>
			</main>
			<Footer className="mt-6 pb-6" />
		</div>
	);
}
