import { createLazyFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
/* HERMES: rebuild trigger — live payslip + bonus target */
import { createContext, useContext, useState, useEffect } from "react";
import { useYumiAuth, useHybridStaffBySlug } from "@yumipos/web-shared";
import { BottomNavbar } from "@yumipos/web-shared/components/layout/BottomNavbar";
import { HomeClockOutBanner } from "@yumipos/web-shared/components/home/home-clockout-banner";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { motion } from "framer-motion";
import { Clock, UserCircle, ShieldCheck } from "lucide-react";

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


