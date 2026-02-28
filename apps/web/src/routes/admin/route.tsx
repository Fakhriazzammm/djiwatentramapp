import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { api } from "@tkmpos/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	Archive,
	Calculator,
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	Coffee,
	Grid3X3,
	LayoutDashboard,
	LogOut,
	MoreHorizontal,
	Package,
	Percent,
	Settings,
	Sparkles,
	User,
	Wallet,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/admin")({
	component: AdminLayout,
});

// Page title map for mobile header
const PAGE_TITLES: Record<string, string> = {
	"/admin": "Dasbor",
	"/admin/products": "Produk",
	"/admin/inventory": "Inventaris",
	"/admin/finance": "Keuangan",
	"/admin/orders": "Pesanan",
	"/admin/discounts": "Promosi",
	"/admin/hpp-calculator": "HPP Kalkulator",
	"/admin/ai-chat": "Yumi AI",
	"/admin/settings": "Pengaturan",
	"/admin/forecasting": "Forecasting",
};

// Bottom nav items (Yumi AI at center index 2)
const BOTTOM_NAV_ITEMS = [
	{ to: "/admin", icon: LayoutDashboard, label: "Dasbor", exact: true },
	{ to: "/admin/orders", icon: ClipboardList, label: "Pesanan" },
	{
		to: "/admin/ai-chat",
		icon: Sparkles,
		label: "Yumi",
		exact: true,
		isCenter: true,
	},
	{ to: "/admin/finance", icon: Wallet, label: "Keuangan" },
	{ to: "", icon: MoreHorizontal, label: "Lainnya", isMore: true },
];

// Pages that belong to "Lainnya" menu
const MORE_MENU_PATHS = [
	"/admin/products",
	"/admin/inventory",
	"/admin/discounts",
	"/admin/hpp-calculator",
	"/admin/forecasting",
	"/admin/settings",
];

// Quick menu items (accessible from bottom sheet)
const QUICK_MENU_ITEMS = [
	{ to: "/admin/products", icon: Package, label: "Produk" },
	{ to: "/admin/inventory", icon: Archive, label: "Inventaris" },
	{ to: "/admin/discounts", icon: Percent, label: "Promosi" },
	{ to: "/admin/hpp-calculator", icon: Calculator, label: "HPP" },
	{ to: "/admin/forecasting", icon: Grid3X3, label: "Forecast" },
	{ to: "/admin/settings", icon: Settings, label: "Pengaturan" },
];

function AdminLayout() {
	const navigate = useNavigate();
	const [isCollapsed, setIsCollapsed] = useState(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("admin-sidebar-collapsed") === "true";
		}
		return false;
	});
	const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);

	const settings = useQuery(api.site_settings.getSettings);
	const storeName = settings?.storeName || "TKM Admin";
	const appName = settings?.appName || "Yumi POS";

	useEffect(() => {
		localStorage.setItem("admin-sidebar-collapsed", String(isCollapsed));
	}, [isCollapsed]);

	const location = useLocation();
	const isAIChat = location.pathname === "/admin/ai-chat";
	const currentPageTitle = PAGE_TITLES[location.pathname] || "Admin";

	// Close quick menu on route change
	useEffect(() => {
		setIsQuickMenuOpen(false);
	}, []);

	return (
		<div className="flex h-full w-full overflow-hidden bg-background">
			{/* === DESKTOP SIDEBAR (hidden on mobile) === */}
			<aside
				className={`relative hidden flex-col border-border border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out md:flex ${
					isCollapsed ? "w-16" : "w-64"
				}`}
			>
				<div className="flex h-14 items-center gap-2 border-border border-b px-4">
					<div className="shrink-0 rounded-md bg-primary p-1.5">
						<Coffee className="h-4 w-4 text-primary-foreground" />
					</div>
					<AnimatePresence>
						{!isCollapsed && (
							<motion.span
								animate={{ opacity: 1, x: 0 }}
								className="truncate font-bold text-base tracking-tight"
								exit={{ opacity: 0, x: -10 }}
								initial={{ opacity: 0, x: -10 }}
							>
								{storeName}
							</motion.span>
						)}
					</AnimatePresence>
				</div>

				{/* Toggle Button */}
				<button
					className="absolute top-20 -right-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-transform hover:scale-110 active:scale-95"
					onClick={() => setIsCollapsed(!isCollapsed)}
					type="button"
				>
					{isCollapsed ? (
						<ChevronRight className="h-3 w-3" />
					) : (
						<ChevronLeft className="h-3 w-3" />
					)}
				</button>

				<nav className="flex-1 space-y-1 p-2">
					<DesktopNavLink
						icon={<Sparkles />}
						isCollapsed={isCollapsed}
						label="Yumi AI"
						to="/admin/ai-chat"
					/>
					<DesktopNavLink
						activeOptions={{ exact: true }}
						icon={<LayoutDashboard />}
						isCollapsed={isCollapsed}
						label="Dasbor"
						to="/admin"
					/>
					<DesktopNavLink
						icon={<Package />}
						isCollapsed={isCollapsed}
						label="Produk"
						to="/admin/products"
					/>
					<DesktopNavLink
						icon={<Archive />}
						isCollapsed={isCollapsed}
						label="Inventaris"
						to="/admin/inventory"
					/>
					<DesktopNavLink
						icon={<Wallet />}
						isCollapsed={isCollapsed}
						label="Keuangan"
						to="/admin/finance"
					/>
					<DesktopNavLink
						icon={<ClipboardList />}
						isCollapsed={isCollapsed}
						label="Pesanan"
						to="/admin/orders"
					/>
					<DesktopNavLink
						icon={<Percent />}
						isCollapsed={isCollapsed}
						label="Promosi"
						to="/admin/discounts"
					/>
					<DesktopNavLink
						icon={<Calculator />}
						isCollapsed={isCollapsed}
						label="HPP Kalkulator"
						to="/admin/hpp-calculator"
					/>
					<DesktopNavLink
						icon={<Settings />}
						isCollapsed={isCollapsed}
						label="Pengaturan"
						to="/admin/settings"
					/>
				</nav>

				<div className="border-border border-t p-2">
					<Link
						className={`flex w-full items-center gap-2 rounded-md p-2 text-muted-foreground text-xs transition-colors hover:bg-destructive/10 hover:text-destructive ${
							isCollapsed ? "justify-center" : ""
						}`}
						title={isCollapsed ? "Keluar" : undefined}
						to="/"
					>
						<LogOut className="h-4 w-4 shrink-0" />
						<AnimatePresence>
							{!isCollapsed && (
								<motion.span
									animate={{ opacity: 1, x: 0 }}
									className="font-medium"
									exit={{ opacity: 0, x: -5 }}
									initial={{ opacity: 0, x: -5 }}
								>
									Keluar
								</motion.span>
							)}
						</AnimatePresence>
					</Link>
				</div>
			</aside>

			{/* === MAIN CONTENT === */}
			<main className="flex flex-1 flex-col overflow-hidden bg-background">
				{/* Mobile Header */}
				<header className="flex h-14 shrink-0 items-center justify-between border-border border-b px-4 md:px-4">
					{/* Mobile: Show page title + store brand */}
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary md:hidden">
							<Coffee className="h-4 w-4 text-primary-foreground" />
						</div>
						<div>
							<h1 className="font-bold text-base leading-tight md:text-lg">
								{currentPageTitle}
							</h1>
							<p className="text-[10px] text-muted-foreground leading-none md:hidden">
								{storeName}
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger
								render={(props) => (
									<button
										{...props}
										className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs transition-all hover:scale-105 hover:bg-primary/20 active:scale-95"
										type="button"
									>
										A
									</button>
								)}
							/>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuLabel>Akun Admin</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => navigate({ to: "/admin/settings" })}
								>
									<Settings className="mr-2 h-4 w-4" />
									<span>Pengaturan</span>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
									<User className="mr-2 h-4 w-4" />
									<span>Profil</span>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => {
										authClient.signOut({
											fetchOptions: {
												onSuccess: () => {
													navigate({ to: "/" });
												},
											},
										});
									}}
								>
									<LogOut className="mr-2 h-4 w-4" />
									<span>Keluar</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</header>

				{/* Page Content - AI Chat uses internal scroll, others use page scroll */}
				<div
					className={isAIChat ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto p-3 pb-20 md:p-4 md:pb-4"}
				>
					<Outlet />
				</div>

				{/* Footer - visible on both desktop and mobile */}
				{!isAIChat && (
					<footer className="border-border border-t bg-muted/20 px-4 py-2 text-center text-muted-foreground text-xs">
						<div className="flex flex-col items-center gap-0.5 md:flex-row md:gap-2">
							<span>
								{appName} {APP_VERSION.semantic} by Zantara Technology
							</span>
							<span className="hidden md:inline text-muted-foreground/40">·</span>
							<span className="text-[10px] text-muted-foreground/60">
								{APP_VERSION.buildDate}
							</span>
						</div>
					</footer>
				)}
			</main>

			{/* === MOBILE QUICK MENU OVERLAY === */}
			<AnimatePresence>
				{isQuickMenuOpen && (
					<>
						{/* Backdrop */}
						<motion.div
							animate={{ opacity: 1 }}
							className="fixed inset-0 z-40 bg-black/50 md:hidden"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={() => setIsQuickMenuOpen(false)}
						/>
						{/* Quick Menu Panel */}
						<motion.div
							animate={{ y: 0, opacity: 1 }}
							className="fixed right-0 bottom-0 left-0 z-50 rounded-t-2xl border-border border-t bg-card px-4 pt-4 pb-6 shadow-2xl md:hidden"
							exit={{ y: "100%", opacity: 0 }}
							initial={{ y: "100%", opacity: 0 }}
							transition={{ type: "spring", damping: 25, stiffness: 300 }}
						>
							{/* Handle bar */}
							<div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />

							{/* Header */}
							<div className="mb-4 flex items-center justify-between">
								<h3 className="font-semibold text-foreground">Menu</h3>
								<button
									className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 active:scale-95"
									onClick={() => setIsQuickMenuOpen(false)}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>

							{/* Grid Menu - 2 rows, 4 columns */}
							<div className="grid grid-cols-4 gap-2">
								{QUICK_MENU_ITEMS.map((item) => (
									<Link
										className="flex flex-col items-center gap-1 rounded-lg bg-muted p-2.5 transition-colors active:bg-muted/80"
										key={item.to}
										onClick={() => setIsQuickMenuOpen(false)}
										to={item.to}
									>
										<div
											className={`flex h-9 w-9 items-center justify-center rounded-md ${
												location.pathname === item.to
													? "bg-primary text-primary-foreground"
													: "bg-background text-foreground"
											}`}
										>
											<item.icon className="h-4 w-4" />
										</div>
										<span className="text-center font-medium text-[10px] text-foreground leading-tight">
											{item.label}
										</span>
									</Link>
								))}
								{/* Logout button */}
								<button
									className="flex flex-col items-center gap-1 rounded-lg bg-destructive/10 p-2.5 transition-colors active:bg-destructive/20"
									onClick={() => {
										setIsQuickMenuOpen(false);
										authClient.signOut({
											fetchOptions: {
												onSuccess: () => {
													navigate({ to: "/" });
												},
											},
										});
									}}
									type="button"
								>
									<div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive text-destructive-foreground">
										<LogOut className="h-4 w-4" />
									</div>
									<span className="text-center font-medium text-[10px] text-destructive leading-tight">
										Keluar
									</span>
								</button>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>

			{/* === MOBILE BOTTOM NAVIGATION === */}
			<nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-30 border-border border-t bg-background/95 backdrop-blur-md md:hidden">
				<div className="flex items-stretch px-2">
					{BOTTOM_NAV_ITEMS.map((item, index) => {
						const isCenter = index === 2; // AI Chat at center
						const isMore = "isMore" in item && item.isMore;

						const isActive = isMore
							? MORE_MENU_PATHS.some((p) =>
									location.pathname.startsWith(p),
								)
							: item.exact
								? location.pathname === item.to
								: location.pathname.startsWith(item.to);

						// Center AI button - Circular FAB style (Instagram/Tinder)
						if (isCenter) {
							return (
								<Link
									className="relative -top-4 flex flex-1 justify-center transition-transform active:scale-95"
									key={item.to}
									to={item.to}
								>
									{/* FAB Container */}
									<div className="relative">
										{/* Glow effect */}
										<div
											className={`absolute inset-0 rounded-full transition-all duration-300 ${
												isActive
													? "animate-pulse bg-primary/40 blur-md"
													: "bg-primary/20 blur-sm"
											}`}
											style={{ width: 56, height: 56 }}
										/>
										{/* Main FAB */}
										<div
											className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300 ${
												isActive
													? "scale-105 bg-gradient-to-br from-primary via-primary to-accent shadow-primary/50 shadow-xl"
													: "bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30"
											}`}
										>
											{isActive ? (
												<Sparkles className="h-6 w-6 animate-spin-slow text-white" />
											) : (
												<Sparkles className="h-6 w-6 text-white" />
											)}
										</div>
										{/* Label below FAB */}
										<span
											className={`absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold text-[10px] ${
												isActive ? "text-primary" : "text-muted-foreground"
											}`}
										>
											AI
										</span>
									</div>
								</Link>
							);
						}

						// Lainnya button - opens quick menu sheet
						if (isMore) {
							return (
								<button
									className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors active:scale-95"
									key="lainnya"
									onClick={() => setIsQuickMenuOpen(true)}
									type="button"
								>
									<div
										className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
											isActive || isQuickMenuOpen
												? "bg-primary text-primary-foreground shadow-sm"
												: "text-muted-foreground"
										}`}
									>
										<item.icon className="h-4 w-4" />
									</div>
									<span
										className={`font-medium text-[9px] leading-tight ${
											isActive || isQuickMenuOpen
												? "text-primary"
												: "text-muted-foreground"
										}`}
									>
										{item.label}
									</span>
								</button>
							);
						}

						// Regular navigation items
						return (
							<Link
								className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors active:scale-95"
								key={item.to}
								to={item.to}
							>
								<div
									className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
										isActive
											? "bg-primary text-primary-foreground shadow-sm"
											: "text-muted-foreground"
									}`}
								>
									<item.icon className="h-4 w-4" />
								</div>
								<span
									className={`font-medium text-[9px] leading-tight ${
										isActive ? "text-primary" : "text-muted-foreground"
									}`}
								>
									{item.label}
								</span>
							</Link>
						);
					})}
				</div>
			</nav>
		</div>
	);
}

/* Desktop Sidebar NavLink (unchanged logic, renamed) */
function DesktopNavLink({
	to,
	icon,
	label,
	activeOptions,
	isCollapsed,
}: {
	to: string;
	icon: React.ReactNode;
	label: string;
	activeOptions?: { exact?: boolean };
	isCollapsed: boolean;
}) {
	return (
		<Link
			activeOptions={activeOptions}
			activeProps={{
				className: "bg-primary text-primary-foreground shadow-sm",
			}}
			className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-all ${
				isCollapsed ? "justify-center px-0" : ""
			}`}
			inactiveProps={{
				className: "text-muted-foreground hover:bg-muted hover:text-foreground",
			}}
			title={isCollapsed ? label : undefined}
			to={to}
		>
			<span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
			<AnimatePresence>
				{!isCollapsed && (
					<motion.span
						animate={{ opacity: 1, x: 0 }}
						className="truncate"
						exit={{ opacity: 0, x: -5 }}
						initial={{ opacity: 0, x: -5 }}
					>
						{label}
					</motion.span>
				)}
			</AnimatePresence>
		</Link>
	);
}
