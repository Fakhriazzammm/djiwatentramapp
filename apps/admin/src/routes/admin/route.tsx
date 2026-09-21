import {
	createFileRoute,
	Link,
	Outlet,
	useLocation,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
	Archive,
	BookOpen,
	Bell,
	Calculator,
	Calendar,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	ChefHat,
	Beer,
	FileBarChart,
	FileText,
	FileSignature,
	Gauge,
	Gamepad2,
	Grid3X3,
	LayoutDashboard,
	List,
	LogOut,
	Monitor,
	MoreHorizontal,
	Package,
	Percent,
	ShieldAlert,
	Settings,
	Smartphone,
	Sparkles,
	User,
	UserPlus,
	Users,
	Wallet,
	X,
	Receipt,
	ArrowLeft,
	BarChart3,
	CalendarDays,
	CheckCircle2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHybridSiteSettings } from "@/hooks/use-hybrid-pos-data";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { APP_VERSION } from "@/lib/version";
import { Footer } from "@/components/layout/Footer";

export const Route = createFileRoute("/admin")({
	component: AdminRouteLayout,
});

// Page title map for mobile header
const PAGE_TITLES: Record<string, string> = {
	"/admin": "Dasbor",
	"/admin/products": "Produk",
	"/admin/recipe": "Resep",
	"/admin/recipe/hpp": "HPP",
	"/admin/recipe/base": "Base Recipe",
	"/admin/inventory": "Inventaris",
	"/admin/stock-overview": "Ringkasan Stok",
	"/admin/finance": "Keuangan",
	"/admin/finance/reports": "Laporan Keuangan",
	"/admin/finance/shift-reports": "Laporan Shift",
	"/admin/finance/transactions": "Riwayat Transaksi",
	"/admin/finance/accounting": "Chart of Accounts",
	"/admin/finance/expenses": "Pengeluaran",
	"/admin/orders": "Pesanan",
	"/admin/order-mie-yamin": "Order Mie Yamin",
	"/admin/discounts": "Promosi",
	"/admin/ai-chat": "Djiwa Tentram AI",
	"/admin/settings": "Pengaturan",
	"/admin/operational-team": "Tim Operasional",
	"/admin/operational-team/attendance": "Absensi",
	"/admin/operational-team/payroll": "Gaji & Role",
	"/admin/operational-team/payroll/slip": "Slip Gaji",
	"/admin/operational-team/attendance/pengaturan": "Pengaturan Absensi",
	"/admin/operational-team/register": "Register Karyawan",
	"/admin/operational-team/register/onboarding": "Onboarding Karyawan",
	"/admin/operational-team/register/contract": "Kontrak Kerja",
	"/admin/operational-team/karyawan": "Karyawan",
	"/admin/operational-team/karyawan/data": "Data Karyawan",
	"/admin/operational-team/register/riwayat": "Riwayat Kontrak",
	"/admin/operational-team/rekrutmen": "Rekrutmen",
		"/admin/forecasting": "Forecasting",
	"/admin/booking": "Booking",
	"/admin/kitchen": "Dapur",
	"/admin/bar": "Bar",
	"/admin/customer-service": "Layanan Customer",
	"/admin/minigames": "Mini Games",
	"/admin/customers": "Pelanggan",
	"/admin/djiwa-app": "Dashboard",
	"/admin/kol": "KOL",
};

// Bottom nav items (Djiwa Tentram AI at center index 2)
const BOTTOM_NAV_ITEMS = [
	{ to: "/admin", icon: LayoutDashboard, label: "Dasbor", exact: true, permission: "analytics:view" },
	{ to: "/admin/orders", icon: ClipboardList, label: "Pesanan", permission: "orders:view" },
	{
		to: "/admin/ai-chat",
		icon: Sparkles,
		label: "Yumi",
		exact: true,
		isCenter: true,
	},
	{ to: "/admin/finance", icon: Wallet, label: "Keuangan", permission: "finance:view" },
	{ to: "", icon: MoreHorizontal, label: "Lainnya", isMore: true },
];

// Pages that belong to "Lainnya" menu
const MORE_MENU_PATHS = [
	"/admin/order-mie-yamin",
	"/admin/products",
	"/admin/recipe",
	"/admin/recipe/hpp",
	"/admin/recipe/base",
	"/admin/inventory",
	"/admin/stock-overview",
	"/admin/discounts",
	"/admin/forecasting",
	"/admin/booking",
	"/admin/kitchen",
	"/admin/bar",
	"/admin/customer-service",
	"/admin/minigames",
	"/admin/customers",
	"/admin/djiwa-app",
	"/admin/kol",
	"/admin/operational-team/karyawan",
	"/admin/operational-team",
	"/admin/operational-team/attendance",
	"/admin/operational-team/payroll",
	"/admin/operational-team/register",
	"/admin/operational-team/register/onboarding",
	"/admin/operational-team/register/contract",
	"/admin/settings",
];

// Quick menu items grouped by section (accessible from bottom sheet)
const QUICK_MENU_SECTIONS = [
	{
		label: "Manajemen",
		items: [
			{ to: "/admin/order-mie-yamin", icon: ClipboardList, label: "Order Mie Yamin", permission: "orders:view" },
			{ to: "/admin/products", icon: Package, label: "Produk", permission: "products:manage" },
			{ to: "/admin/recipe", icon: BookOpen, label: "Resep", permission: "inventory:manage" },
			{ to: "/admin/recipe/hpp", icon: Calculator, label: "HPP", permission: "inventory:manage" },
			{ to: "/admin/recipe/base", icon: FileText, label: "Base Recipe", permission: "inventory:manage" },
			{ to: "/admin/inventory", icon: Archive, label: "Inventaris", permission: "inventory:manage" },
			{ to: '/admin/stock-overview', icon: BarChart3, label: 'Ringkasan Stok', permission: 'inventory:manage' },
		],
	},
	{
		label: "Keuangan",
		items: [
			{ to: "/admin/finance", icon: Wallet, label: "Keuangan", permission: "finance:view" },
			{ to: "/admin/finance/transactions", icon: ClipboardList, label: "Transaksi", permission: "finance:view" },
			{ to: "/admin/finance/accounting", icon: BookOpen, label: "Akuntansi", permission: "finance:view" },
			{ to: "/admin/finance/expenses", icon: Receipt, label: "Pengeluaran", permission: "finance:view" },
			{ to: "/admin/finance/reports", icon: FileBarChart, label: "Laporan", permission: "finance:view" },
			{ to: "/admin/finance/shift-reports", icon: Users, label: "Laporan Shift", permission: "finance:view" },
			{ to: "/admin/recipe/hpp", icon: Calculator, label: "HPP", permission: "finance:view" },
		],
	},
	{
		label: "Operasional",
		items: [
			{ to: "/admin/kitchen", icon: ChefHat, label: "Dapur" },
			{ to: "/admin/bar", icon: Beer, label: "Bar" },
			{ to: "/admin/customer-service", icon: Bell, label: "Layanan", permission: "orders:view" },
			{ to: "/admin/operational-team/karyawan", icon: Users, label: "Karyawan", permission: "users:manage" },
		],
	},
	{
		label: "BOOKING",
		items: [
			{ to: "/admin/booking", icon: LayoutDashboard, label: "Dashboard", permission: "orders:view" },
			{ to: "/admin/booking/calendar", icon: CalendarDays, label: "Kalender", permission: "orders:view" },
			{ to: "/admin/booking/orders", icon: List, label: "Data Booking", permission: "orders:view" },
			{ to: "/admin/booking/capacity", icon: Gauge, label: "Kapasitas", permission: "orders:view" },
			{ to: "/admin/booking/settings", icon: Settings, label: "Konfigurasi", permission: "orders:view" },
		],
	},
	{
		label: "Djiwa App",
		items: [
			{ to: "/admin/djiwa-app", icon: LayoutDashboard, label: "Dashboard", permission: "analytics:view" },
			{ to: "/admin/customers", icon: Users, label: "Pelanggan" },
		],
	},
	{
		label: "Marketing",
		items: [
			{ to: "/admin/discounts", icon: Percent, label: "Promosi", permission: "products:manage" },
			{ to: "/admin/minigames", icon: Gamepad2, label: "Mini Games", permission: "products:manage" },
			{ to: "/admin/kol", icon: Users, label: "KOL" },
			{ to: "/admin/operational-team/rekrutmen", icon: FileText, label: "Rekrutmen", permission: "users:manage" },
		],
	},
	{
		label: "Lainnya",
		items: [
			{ to: "/admin/forecasting", icon: Grid3X3, label: "Forecast", permission: "analytics:view" },
			{ to: "/admin/settings", icon: Settings, label: "Pengaturan", permission: "settings:manage" },
		],
	},
];

const OPERATIONAL_PATHS = [
  "/admin/kitchen",
  "/admin/bar",
];

// Flat list for backward compat
const QUICK_MENU_ITEMS = QUICK_MENU_SECTIONS.flatMap((s) => s.items);

// Finance sub-routes for auto-expanding the submenu
const FINANCE_PATHS = [
	"/admin/finance",
	"/admin/finance/reports",
	"/admin/finance/shift-reports",
	"/admin/finance/transactions",
	"/admin/finance/accounting",
	"/admin/finance/expenses",
];

const DJIWA_APP_PATHS = [
	"/admin/djiwa-app",
	"/admin/customers",
];

const BOOKING_PATHS = [
	"/admin/booking",
];

const OPERATIONAL_TEAM_PATHS = [
	"/admin/operational-team/karyawan",
	"/admin/operational-team",
	"/admin/operational-team/attendance",
	"/admin/operational-team/payroll",
	"/admin/operational-team/payroll/slip",
	"/admin/operational-team/register",
	"/admin/operational-team/register/onboarding",
	"/admin/operational-team/register/contract",
	"/admin/operational-team/register/riwayat",
	"/admin/operational-team/rekrutmen",
	];

export function AdminRouteLayout() {
	return <AdminLayout />;
}

export function AdminLayout({ children }: { children?: ReactNode }) {
	const navigate = useNavigate();
	const { user: authUser, logout, isAdmin, role, isAuthenticated, isLoading } = useYumiAuth();
	const [isAccessDenied, setIsAccessDenied] = useState(false);

	const hasPermission = (permId?: string) => {
		if (isAdmin) return true;
		if (!permId) return true;
		return role?.permissions?.includes(permId) || false;
	};
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
	const [adminPopupDensity] = useState<"compact" | "normal">(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("admin-popup-density");
			if (saved === "normal" || saved === "compact") return saved;
		}
		return "compact";
	});

	const settings = useHybridSiteSettings();
	const storeName = settings?.storeName || "Djiwa Tentram";
	const appName = settings?.appName || "Djiwa Tentram";
	const developerName = settings?.developerName || "Zantara Technology";
	const headerLogoUrl = settings?.headerLogoUrl || settings?.logoUrl || "";

	const location = useLocation();
	// Use non-strict search to avoid type errors during route tree generation
	const search = useSearch({ strict: false }) as any;
	const isFromHomeEntry = Boolean(
		(location.state as { fromHomeEntry?: boolean } | undefined)?.fromHomeEntry,
	);
	const [isHomeEntryMode, setIsHomeEntryMode] = useState(isFromHomeEntry);
	
	const isAIChat = location.pathname === "/admin/ai-chat";
	const isOperational = OPERATIONAL_PATHS.some(p => location.pathname.startsWith(p));
	const currentPageTitle = PAGE_TITLES[location.pathname] || "Admin";

	// Route Guard
	useEffect(() => {
		if (isAuthenticated && !isLoading) {
			const currentPath = location.pathname;
			const allItems = [...BOTTOM_NAV_ITEMS, ...QUICK_MENU_ITEMS];
			const matchedItem = allItems
				.filter((item) => item.to && currentPath.startsWith(item.to))
				.sort((a, b) => b.to.length - a.to.length)[0];
			
			if (matchedItem?.permission && !hasPermission(matchedItem.permission)) {
				setIsAccessDenied(true);
			} else {
				setIsAccessDenied(false);
			}
		}
	}, [location.pathname, isAuthenticated, isLoading, role, isAdmin]);

	// Auto-open finance submenu if on a finance route
	const isOnFinancePath = FINANCE_PATHS.some((p) =>
		location.pathname.startsWith(p),
	);
	const [isFinanceOpen, setIsFinanceOpen] = useState(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("admin-finance-open");
			if (saved !== null) return saved === "true";
		}
		return isOnFinancePath;
	});

	// Keep finance submenu open when navigating to a finance sub-route
	useEffect(() => {
		if (isOnFinancePath) setIsFinanceOpen(true);
	}, [isOnFinancePath]);

	const isOnOperationalTeamPath = OPERATIONAL_TEAM_PATHS.some((p) =>
		location.pathname.startsWith(p),
	);
	const [isOperationalTeamOpen, setIsOperationalTeamOpen] = useState(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("admin-operational-team-open");
			if (saved !== null) return saved === "true";
		}
		return isOnOperationalTeamPath;
	});

	useEffect(() => {
		if (isOnOperationalTeamPath) setIsOperationalTeamOpen(true);
	}, [isOnOperationalTeamPath]);

	const isOnDjiwaAppPath = DJIWA_APP_PATHS.some((p) => location.pathname.startsWith(p));
	const [isDjiwaAppOpen, setIsDjiwaAppOpen] = useState(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("admin-djiwa-app-open");
			if (saved !== null) return saved === "true";
		}
		return isOnDjiwaAppPath;
	});

	useEffect(() => {
		if (isOnDjiwaAppPath) setIsDjiwaAppOpen(true);
	}, [isOnDjiwaAppPath]);

	const isOnBookingPath = BOOKING_PATHS.some((p) => location.pathname.startsWith(p));
	const [isBookingOpen, setIsBookingOpen] = useState(() => {
		if (typeof window !== "undefined") {
			const saved = localStorage.getItem("admin-booking-open");
			if (saved !== null) return saved === "true";
		}
		return isOnBookingPath;
	});

	useEffect(() => {
		if (isOnBookingPath) setIsBookingOpen(true);
	}, [isOnBookingPath]);

	useEffect(() => {
		localStorage.setItem("admin-sidebar-collapsed", String(isCollapsed));
	}, [isCollapsed]);

	useEffect(() => {
		localStorage.setItem("admin-finance-open", String(isFinanceOpen));
	}, [isFinanceOpen]);

	useEffect(() => {
		localStorage.setItem("admin-operational-team-open", String(isOperationalTeamOpen));
	}, [isOperationalTeamOpen]);

	useEffect(() => {
		localStorage.setItem("admin-djiwa-app-open", String(isDjiwaAppOpen));
	}, [isDjiwaAppOpen]);

	useEffect(() => {
		localStorage.setItem("admin-booking-open", String(isBookingOpen));
	}, [isBookingOpen]);

	useEffect(() => {
		if (isFromHomeEntry) {
			setIsHomeEntryMode(true);
		}
	}, [isFromHomeEntry]);

	// Close quick menu on route change
	useEffect(() => {
		setIsQuickMenuOpen(false);
	}, []);

	useEffect(() => {
		document.body.classList.add("admin-shell");
		document.body.setAttribute("data-admin-density", adminPopupDensity);
		return () => {
			document.body.classList.remove("admin-shell");
			document.body.removeAttribute("data-admin-density");
		};
	}, [adminPopupDensity]);

	return (
		<div
			className="flex h-app w-full overflow-hidden bg-background"
			data-admin-density={adminPopupDensity}
			data-admin-shell="true"
		>
			{/* === DESKTOP SIDEBAR (hidden on mobile) === */}
			<aside
				className={`relative hidden flex-col border-border border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out md:flex ${isCollapsed ? "w-16" : "w-64"
					}`}
			>
				<div className="flex h-14 items-center gap-2 border-border border-b px-4">
					{headerLogoUrl ? (
						<div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background p-1">
							<img alt={`${storeName} logo`} className="h-full w-full object-contain" src={headerLogoUrl}/>
						</div>
					) : (
						<div className="shrink-0 rounded-md bg-primary p-1.5">
							<img alt="Djiwa Tentram" className="h-full w-full object-contain" src="/logo-djiwa.png"/>
						</div>
					)}
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

				<nav className="flex-1 overflow-y-auto p-2">
					{/* Djiwa Tentram AI - standalone at top */}
					<DesktopNavLink
						icon={<Sparkles />}
						isCollapsed={isCollapsed}
						label="Djiwa Tentram AI"
						to="/admin/ai-chat"
					/>

					{/* UTAMA */}
					<SidebarSection isCollapsed={isCollapsed} label="Utama" />
					<DesktopNavLink
						activeOptions={{ exact: true }}
						icon={<LayoutDashboard />}
						isCollapsed={isCollapsed}
						label="Dasbor"
						to="/admin"
						permission="analytics:view"
					/>
					<DesktopNavLink
						icon={<ClipboardList />}
						isCollapsed={isCollapsed}
						label="Pesanan"
						to="/admin/orders"
						permission="orders:view"
					/>
					<DesktopNavLink
						icon={<ClipboardList />}
						isCollapsed={isCollapsed}
						label="Order Mie Yamin"
						to="/admin/order-mie-yamin"
						permission="orders:view"
					/>
					<DesktopNavLink
						icon={<ShieldAlert />}
						isCollapsed={isCollapsed}
						label="Moderasi Komunitas"
						to="/admin/community"
					/>
					<SidebarSection isCollapsed={isCollapsed} label="Manajemen" />
					<DesktopNavLink
						icon={<Package />}
						isCollapsed={isCollapsed}
						label="Produk"
						to="/admin/products"
						permission="products:manage"
					/>
					<DesktopNavLink
						icon={<BookOpen />}
						isCollapsed={isCollapsed}
						label="Resep"
						to="/admin/recipe"
						permission="inventory:manage"
					/>
					<DesktopNavLink
						icon={<Calculator />}
						isCollapsed={isCollapsed}
						label="HPP"
						to="/admin/recipe/hpp"
						permission="inventory:manage"
					/>
					<DesktopNavLink
						icon={<Archive />}
						isCollapsed={isCollapsed}
						label="Inventaris"
						to="/admin/inventory"
						permission="inventory:manage"
					/>
					<DesktopNavLink
						icon={<BarChart3 />}
						isCollapsed={isCollapsed}
						label="Ringkasan Stok"
						to="/admin/stock-overview"
						permission="inventory:manage"
					/>
					{/* OPERASIONAL */}
					<SidebarSection isCollapsed={isCollapsed} label="Operasional" />
					<DesktopNavLink icon={<ChefHat />} isCollapsed={isCollapsed} label="Dapur" to="/admin/kitchen" />
					<DesktopNavLink icon={<Beer />} isCollapsed={isCollapsed} label="Bar" to="/admin/bar" />
					<DesktopNavLink icon={<Bell />} isCollapsed={isCollapsed} label="Layanan Customer" to="/admin/customer-service" permission="orders:view" />
					{isCollapsed ? (
						<>
							<DesktopNavLink icon={<LayoutDashboard />} isCollapsed={isCollapsed} label="Dashboard" to="/admin/operational-team" permission="users:manage" />
							<DesktopNavLink icon={<Users />} isCollapsed={isCollapsed} label="Karyawan" to="/admin/operational-team/karyawan" permission="users:manage" />
							<DesktopNavLink icon={<FileBarChart />} isCollapsed={isCollapsed} label="Absensi" to="/admin/operational-team/attendance" permission="users:manage" />
							<DesktopNavLink icon={<CalendarDays />} isCollapsed={isCollapsed} label="Jadwal" to="/admin/operational-team/attendance/jadwal" permission="users:manage" />
							<DesktopNavLink icon={<Settings />} isCollapsed={isCollapsed} label="Pengaturan Absensi" to="/admin/operational-team/attendance/pengaturan" permission="users:manage" />
							<DesktopNavLink icon={<Wallet />} isCollapsed={isCollapsed} label="Gaji & Role" to="/admin/operational-team/payroll" permission="users:manage" />
							<DesktopNavLink icon={<FileText />} isCollapsed={isCollapsed} label="Slip Gaji" to="/admin/operational-team/payroll/slip" permission="users:manage" />
							<DesktopNavLink icon={<UserPlus />} isCollapsed={isCollapsed} label="Register" to="/admin/operational-team/register" permission="users:manage" />
							<DesktopNavLink icon={<ClipboardList />} isCollapsed={isCollapsed} label="Onboarding" to="/admin/operational-team/register/onboarding" permission="users:manage" />
							<DesktopNavLink icon={<FileSignature />} isCollapsed={isCollapsed} label="Kontrak" to="/admin/operational-team/register/contract" permission="users:manage" />
							<DesktopNavLink icon={<FileText />} isCollapsed={isCollapsed} label="Riwayat Kontrak" to="/admin/operational-team/register/riwayat" permission="users:manage" />
							<DesktopNavLink icon={<FileText />} isCollapsed={isCollapsed} label="Rekrutmen" to="/admin/operational-team/rekrutmen" permission="users:manage" />
						</>
					) : (
						<>
							<button className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-all ${
								isOnOperationalTeamPath ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
							}`} onClick={() => setIsOperationalTeamOpen(!isOperationalTeamOpen)} type="button">
								<span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5"><Users /></span>
								<span className="flex-1 truncate text-left">Tim Operasional</span>
								<motion.span animate={{ rotate: isOperationalTeamOpen ? 180 : 0 }} className="shrink-0" transition={{ duration: 0.2 }}><ChevronDown className="h-4 w-4" /></motion.span>
							</button>
							<AnimatePresence initial={false}>
								{isOperationalTeamOpen && (
									<motion.div animate={{ height: "auto", opacity: 1 }} className="overflow-hidden" exit={{ height: 0, opacity: 0 }} initial={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
										<div className="ml-4 space-y-0.5 border-muted-foreground/20 border-l pl-3 pt-1">
											<DesktopSubNavLink activeOptions={{ exact: true }} icon={<LayoutDashboard />} label="Dashboard" to="/admin/operational-team" permission="users:manage" />
											<DesktopSubNavLink activeOptions={{ exact: true }} icon={<Users />} label="Karyawan" to="/admin/operational-team/karyawan" permission="users:manage" />
											<DesktopSubNavLink icon={<FileText />} label="Data Karyawan" to="/admin/operational-team/karyawan/data" permission="users:manage" />
											<DesktopSubNavLink icon={<FileBarChart />} label="Absensi" to="/admin/operational-team/attendance" permission="users:manage" />
										<DesktopSubNavLink icon={<CalendarDays />} label="Jadwal" to="/admin/operational-team/attendance/jadwal" permission="users:manage" />
										<DesktopSubNavLink icon={<Settings />} label="Pengaturan Absensi" to="/admin/operational-team/attendance/pengaturan" permission="users:manage" />
											<DesktopSubNavLink icon={<Wallet />} label="Gaji & Role" to="/admin/operational-team/payroll" permission="users:manage" />
										<DesktopSubNavLink icon={<FileText />} label="Slip Gaji" to="/admin/operational-team/payroll/slip" permission="users:manage" />
										<DesktopSubNavLink icon={<UserPlus />} label="Register Karyawan" to="/admin/operational-team/register" permission="users:manage" />
										<DesktopSubNavLink icon={<ClipboardList />} label="Onboarding" to="/admin/operational-team/register/onboarding" permission="users:manage" />
										<DesktopSubNavLink icon={<FileSignature />} label="Kontrak Kerja" to="/admin/operational-team/register/contract" permission="users:manage" />
										<DesktopSubNavLink icon={<FileText />} label="Riwayat Kontrak" to="/admin/operational-team/register/riwayat" permission="users:manage" />
									<DesktopSubNavLink icon={<FileText />} label="Rekrutmen" to="/admin/operational-team/rekrutmen" permission="users:manage" />
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</>
					)}

					{/* KEUANGAN - Collapsible */}
					<SidebarSection isCollapsed={isCollapsed} label="Keuangan" />
					{isCollapsed ? (
						<>
							<DesktopNavLink
								icon={<Wallet />}
								isCollapsed={isCollapsed}
								label="Keuangan"
								to="/admin/finance"
								permission="finance:view"
							/>
							<DesktopNavLink
								icon={<ClipboardList />}
								isCollapsed={isCollapsed}
								label="Transaksi"
								to="/admin/finance/transactions"
								permission="finance:view"
							/>
							<DesktopNavLink
								icon={<BookOpen />}
								isCollapsed={isCollapsed}
								label="Akuntansi"
								to="/admin/finance/accounting"
								permission="finance:view"
							/>
							<DesktopNavLink
								icon={<FileBarChart />}
								isCollapsed={isCollapsed}
								label="Laporan"
								to="/admin/finance/reports"
								permission="finance:view"
							/>
							<DesktopNavLink
								icon={<Users />}
								isCollapsed={isCollapsed}
								label="Laporan Shift"
								to="/admin/finance/shift-reports"
								permission="finance:view"
							/>
							<DesktopNavLink
								icon={<Calculator />}
								isCollapsed={isCollapsed}
								label="HPP"
								to="/admin/recipe/hpp"
								permission="finance:view"
							/>
						</>
					) : (
						<>
							{/* Collapsible parent button */}
							<button
								className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-all ${isOnFinancePath
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:bg-muted hover:text-foreground"
									}`}
								onClick={() => setIsFinanceOpen(!isFinanceOpen)}
								type="button"
							>
								<span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5">
									<Wallet />
								</span>
								<span className="flex-1 truncate text-left">Keuangan</span>
								<motion.span
									animate={{ rotate: isFinanceOpen ? 180 : 0 }}
									className="shrink-0"
									transition={{ duration: 0.2 }}
								>
									<ChevronDown className="h-4 w-4" />
								</motion.span>
							</button>

							{/* Collapsible sub-items */}
							<AnimatePresence initial={false}>
								{isFinanceOpen && (
									<motion.div
										animate={{ height: "auto", opacity: 1 }}
										className="overflow-hidden"
										exit={{ height: 0, opacity: 0 }}
										initial={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.2, ease: "easeInOut" }}
									>
										<div className="ml-4 space-y-0.5 border-muted-foreground/20 border-l pl-3 pt-1">
											<DesktopSubNavLink
												activeOptions={{ exact: true }}
												icon={<Wallet />}
												label="Overview"
												to="/admin/finance"
												permission="finance:view"
											/>
									<DesktopSubNavLink
										icon={<ClipboardList />}
										label="Transaksi"
										to="/admin/finance/transactions"
										permission="finance:view"
									/>
									<DesktopSubNavLink
											icon={<BookOpen />}
											label="Akuntansi"
											to="/admin/finance/accounting"
											permission="finance:view"
										/>
										<DesktopSubNavLink
											icon={<Receipt />}
											label="Pengeluaran"
											to="/admin/finance/expenses"
											permission="finance:view"
										/>
										<DesktopSubNavLink
															icon={<FileBarChart />}
															label="Laporan"
												to="/admin/finance/reports"
												permission="finance:view"
											/>
											<DesktopSubNavLink
												icon={<Users />}
												label="Laporan Shift"
												to="/admin/finance/shift-reports"
												permission="finance:view"
											/>
											<DesktopSubNavLink
												icon={<Calculator />}
												label="HPP"
												to="/admin/recipe/hpp"
												permission="finance:view"
											/>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</>
					)}

					{/* BOOKING */}
					{isCollapsed && <SidebarSection isCollapsed={isCollapsed} label="BOOKING" />}
					{isCollapsed ? (
						<DesktopNavLink icon={<CalendarDays />} isCollapsed={isCollapsed} label="Dashboard Booking" to="/admin/booking" permission="orders:view" />
					) : (
						<>
							<button className={`mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-all ${isOnBookingPath ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={() => setIsBookingOpen(!isBookingOpen)} type="button">
								<span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5"><CalendarDays /></span>
								<span className="flex-1 truncate text-left">Booking</span>
								<motion.span animate={{ rotate: isBookingOpen ? 180 : 0 }} className="shrink-0" transition={{ duration: 0.2 }}><ChevronDown className="h-4 w-4" /></motion.span>
							</button>
							<AnimatePresence initial={false}>
								{isBookingOpen && <motion.div animate={{ height: "auto", opacity: 1 }} className="overflow-hidden" exit={{ height: 0, opacity: 0 }} initial={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
									<div className="ml-4 space-y-0.5 border-muted-foreground/20 border-l pl-3 pt-1">
										<DesktopSubNavLink activeOptions={{ exact: true }} icon={<LayoutDashboard />} label="Dashboard" to="/admin/booking" permission="orders:view" />
										<DesktopSubNavLink icon={<List />} label="Data Booking" to="/admin/booking/orders" permission="orders:view" />
										<DesktopSubNavLink icon={<CalendarDays />} label="Kalender" to="/admin/booking/calendar" permission="orders:view" />
										<DesktopSubNavLink icon={<Gauge />} label="Kapasitas" to="/admin/booking/capacity" permission="orders:view" />
										<DesktopSubNavLink icon={<Settings />} label="Konfigurasi" to="/admin/booking/settings" permission="orders:view" />
									</div>
								</motion.div>}
							</AnimatePresence>
						</>
					)}

					{/* DJIWA APP */}
					<SidebarSection isCollapsed={isCollapsed} label="Djiwa App" />
					{isCollapsed ? (
						<>
							<DesktopNavLink icon={<LayoutDashboard />} isCollapsed={isCollapsed} label="Dashboard" to="/admin/djiwa-app" permission="analytics:view" />
							<DesktopNavLink icon={<Users />} isCollapsed={isCollapsed} label="Pelanggan" to="/admin/customers" />
						</>
					) : (
						<>
							<button className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-all ${isOnDjiwaAppPath ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={() => setIsDjiwaAppOpen(!isDjiwaAppOpen)} type="button">
								<span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5"><Smartphone /></span>
								<span className="flex-1 truncate text-left">Djiwa App</span>
								<motion.span animate={{ rotate: isDjiwaAppOpen ? 180 : 0 }} className="shrink-0" transition={{ duration: 0.2 }}><ChevronDown className="h-4 w-4" /></motion.span>
							</button>
							<AnimatePresence initial={false}>
								{isDjiwaAppOpen && <motion.div animate={{ height: "auto", opacity: 1 }} className="overflow-hidden" exit={{ height: 0, opacity: 0 }} initial={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: "easeInOut" }}>
									<div className="ml-4 space-y-0.5 border-muted-foreground/20 border-l pl-3 pt-1">
										<DesktopSubNavLink activeOptions={{ exact: true }} icon={<LayoutDashboard />} label="Dashboard" to="/admin/djiwa-app" permission="analytics:view" />
										<DesktopSubNavLink icon={<Users />} label="Pelanggan" to="/admin/customers" />
									</div>
								</motion.div>}
							</AnimatePresence>
						</>
					)}

					{/* MARKETING */}
					<SidebarSection isCollapsed={isCollapsed} label="Marketing" />
					<DesktopNavLink
						icon={<Percent />}
						isCollapsed={isCollapsed}
						label="Promosi"
						to="/admin/discounts"
						permission="products:manage"
					/>
					<DesktopNavLink
						icon={<Gamepad2 />}
						isCollapsed={isCollapsed}
						label="Mini Games"
						to="/admin/minigames"
						permission="products:manage"
					/>
					<DesktopNavLink
						icon={<Users />}
						isCollapsed={isCollapsed}
						label="KOL"
						to="/admin/kol"
					/>
				</nav>

				{/* Footer: User Profile + Pengaturan + Keluar */}
				<div className="border-border border-t p-2 space-y-1">
					{/* User Profile */}
					<button
						className={`flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50 ${isCollapsed ? "justify-center" : ""
							}`}
						onClick={() => {
							const profilePath = authUser?.slug 
								? `/karyawan/${authUser.slug}` 
								: (authUser as any)?.username 
									? `/karyawan/${(authUser as any).username}` 
									: "/attendance";
							navigate({ to: profilePath as any });
						}}
						title={isCollapsed ? authUser?.name || "Profil" : undefined}
						type="button"
					>
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary text-xs">
							{authUser?.name?.charAt(0) || "U"}
						</div>
						<AnimatePresence>
							{!isCollapsed && (
								<motion.div
									animate={{ opacity: 1, x: 0 }}
									className="min-w-0 flex-1 text-left"
									exit={{ opacity: 0, x: -5 }}
									initial={{ opacity: 0, x: -5 }}
								>
									<p className="truncate font-medium text-foreground text-sm leading-tight">
										{authUser?.name || "User"}
									</p>
									<p className="truncate text-muted-foreground text-[11px] leading-tight">
										{storeName}
									</p>
								</motion.div>
							)}
						</AnimatePresence>
					</button>

					{/* Pengaturan */}
					<DesktopNavLink
						icon={<Settings />}
						isCollapsed={isCollapsed}
						label="Pengaturan"
						to="/admin/settings"
						permission="settings:manage"
					/>

					{/* System Monitor - external link */}
					<a
						href="https://supabase.yumme.id/monitor/"
						target="_blank"
						rel="noopener noreferrer"
						className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 font-medium text-sm transition-all hover:bg-muted hover:text-foreground ${isCollapsed ? "justify-center px-0" : "text-muted-foreground"
						}`}
						title={isCollapsed ? "System Monitor" : undefined}
					>
						<Monitor className="h-5 w-5 shrink-0" />
						<AnimatePresence>
							{!isCollapsed && (
								<motion.span
									animate={{ opacity: 1, x: 0 }}
									className="truncate"
									exit={{ opacity: 0, x: -5 }}
									initial={{ opacity: 0, x: -5 }}
								>
									System Monitor
								</motion.span>
							)}
						</AnimatePresence>
					</a>

					{/* Keluar */}
					<button
						className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 font-medium text-muted-foreground text-sm transition-all hover:bg-destructive/10 hover:text-destructive ${isCollapsed ? "justify-center px-0" : ""
							}`}
						onClick={() => {
							logout();
							navigate({ to: "/" });
						}}
						title={isCollapsed ? "Keluar" : undefined}
						type="button"
					>
						<LogOut className="h-5 w-5 shrink-0" />
						<AnimatePresence>
							{!isCollapsed && (
								<motion.span
									animate={{ opacity: 1, x: 0 }}
									className="truncate"
									exit={{ opacity: 0, x: -5 }}
									initial={{ opacity: 0, x: -5 }}
								>
									Keluar
								</motion.span>
							)}
						</AnimatePresence>
					</button>
				</div>
			</aside>

			{/* === MAIN CONTENT === */}
			<main className="flex flex-1 flex-col overflow-hidden bg-background">
				{/* Mobile Header */}
				<header className="flex h-14 shrink-0 items-center justify-between border-border border-b px-4 md:px-4">
					{/* Mobile: Show page title + store brand */}
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary md:hidden">
							{headerLogoUrl ? (
								<img alt={`${storeName} logo`} className="h-6 w-6 object-contain" src={headerLogoUrl}/>
							) : (
								<img alt="Djiwa Tentram" className="h-full w-full object-contain" src="/logo-djiwa.png"/>
							)}
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
										className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs transition-all hover:scale-105 hover:bg-primary/20 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
										aria-label="Buka menu akun"
										type="button"
									>
										{authUser?.name?.charAt(0) || "U"}
									</button>
								)}
							/>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuLabel>{authUser?.name || "Akun Saya"}</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => navigate({ to: "/admin/settings" })}
								>
									<Settings className="mr-2 h-4 w-4" />
									<span>Pengaturan</span>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => {
									const profilePath = authUser?.slug 
										? `/karyawan/${authUser.slug}` 
										: (authUser as any)?.username 
											? `/karyawan/${(authUser as any).username}` 
											: "/attendance";
									navigate({ to: profilePath as any });
								}}>
									<User className="mr-2 h-4 w-4" />
									<span>Profil</span>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
								onClick={() => {
									logout();
									navigate({ to: "/" });
								}}
								>
									<LogOut className="mr-2 h-4 w-4" />
									<span>Keluar</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</header>

				{/* Page Content - AI Chat and Operational views use internal scroll, others use page scroll */}
				<div
					className={(isAIChat || isOperational) ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto min-h-0 p-3 pb-20 md:p-4 md:pb-4"}
				>
					{isAccessDenied ? (
						<PermissionDenied onBack={() => navigate({ to: "/admin" })} />
					) : (
						children ?? <Outlet />
					)}
				</div>

				{/* Footer - visible on both desktop and mobile */}
				{!isAIChat && (
					<Footer compact className="border-t bg-muted/20" />
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
									className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label="Tutup menu"
									onClick={() => setIsQuickMenuOpen(false)}
									type="button"
								>
									<X className="h-4 w-4" />
								</button>
							</div>

							{/* Grouped Quick Menu */}
							<div className="space-y-3">
								{QUICK_MENU_SECTIONS.map((section) => (
									<div key={section.label}>
										<p className="mb-1.5 px-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
											{section.label}
										</p>
										<div className="grid grid-cols-3 gap-2">
											{section.items.map((item) => {
												const hasPermission = !item.permission || isAdmin || role?.permissions?.includes(item.permission);
												if (!hasPermission) return null;

												return (
													<Link
														className="flex flex-col items-center gap-2 rounded-xl bg-muted/50 p-3 transition-colors active:bg-muted"
														key={item.to}
														onClick={() => setIsQuickMenuOpen(false)}
														to={item.to}
													>
														<div
															className={`flex h-9 w-9 items-center justify-center rounded-md ${location.pathname === item.to
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
												);
											})}
										</div>
									</div>
								))}

								{/* Logout button */}
								<div className="border-border border-t pt-3">
									<button
										className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 p-2.5 transition-colors active:bg-destructive/20"
								onClick={() => {
									setIsQuickMenuOpen(false);
									logout();
									navigate({ to: "/" });
								}}
										type="button"
									>
										<LogOut className="h-4 w-4 text-destructive" />
										<span className="font-medium text-destructive text-xs">
											Keluar
										</span>
									</button>
								</div>
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>

			{/* === MOBILE HOME ENTRY NAVIGATION === */}
			{isHomeEntryMode && (
				<nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-border border-t bg-background/95 backdrop-blur-md md:hidden">
					<div className="flex items-stretch px-2">
						<Link
							className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors active:scale-95"
							to="/admin"
						>
							<div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
								<ArrowLeft className="h-4 w-4" />
							</div>
							<span className="font-medium text-[11px] leading-tight text-primary">
								Kembali ke Home
							</span>
						</Link>
					</div>
				</nav>
			)}

			{/* === MOBILE BOTTOM NAVIGATION === */}
			{!isHomeEntryMode && !isOperational && (
				<nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-30 border-border border-t bg-background/95 backdrop-blur-md md:hidden">
					<div className="flex items-stretch px-2">
						{BOTTOM_NAV_ITEMS.map((item, index) => {
							const hasPermission = !item.permission || isAdmin || role?.permissions?.includes(item.permission);
							if (!hasPermission) return null;

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
												className={`absolute inset-0 rounded-full transition-all duration-300 ${isActive
														? "animate-pulse bg-primary/40 blur-md"
														: "bg-primary/20 blur-sm"
													}`}
												style={{ width: 56, height: 56 }}
											/>
											{/* Main FAB */}
											<div
												className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300 ${isActive
														? "scale-105 bg-gradient-to-br from-primary via-primary to-accent shadow-primary/50 shadow-xl"
														: "bg-primary shadow-lg shadow-primary/30"
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
												className={`absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-semibold text-[10px] ${isActive ? "text-primary" : "text-muted-foreground"
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
											className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${isActive || isQuickMenuOpen
													? "bg-primary text-primary-foreground shadow-sm"
													: "text-muted-foreground"
												}`}
										>
											<item.icon className="h-4 w-4" />
										</div>
										<span
											className={`font-medium text-[11px] leading-tight ${isActive || isQuickMenuOpen
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
										className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${isActive
												? "bg-primary text-primary-foreground shadow-sm"
												: "text-muted-foreground"
											}`}
									>
										<item.icon className="h-4 w-4" />
									</div>
									<span
										className={`font-medium text-[11px] leading-tight ${isActive ? "text-primary" : "text-muted-foreground"
											}`}
									>
										{item.label}
									</span>
								</Link>
							);
						})}
					</div>
				</nav>
			)}

			{/* === MOBILE OPERATIONAL BOTTOM NAVIGATION === */}
			{!isHomeEntryMode && isOperational && (
				<nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-40 border-border border-t bg-background/95 backdrop-blur-md md:hidden">
					<div className="flex items-stretch px-2">
						<Link
							className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors active:scale-95"
							to="/menu"
						>
							<div className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground">
								<ArrowLeft className="h-4 w-4" />
							</div>
							<span className="font-medium text-[11px] leading-tight text-muted-foreground">
								Kembali
							</span>
						</Link>

						<Link
							className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors active:scale-95"
							search={{ tab: "orders" } as any}
							to={location.pathname as any}
						>
							<div
								className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${search.tab !== "stock"
										? "bg-primary text-primary-foreground shadow-sm"
										: "text-muted-foreground"
									}`}
							>
								<ClipboardList className="h-4 w-4" />
							</div>
							<span
								className={`font-medium text-[11px] leading-tight ${search.tab !== "stock"
										? "text-primary"
										: "text-muted-foreground"
									}`}
							>
								Pesanan
							</span>
						</Link>

						<Link
							className="flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors active:scale-95"
							search={{ tab: "stock" } as any}
							to={location.pathname as any}
						>
							<div
								className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${search.tab === "stock"
										? "bg-primary text-primary-foreground shadow-sm"
										: "text-muted-foreground"
									}`}
							>
								<Package className="h-4 w-4" />
							</div>
							<span
								className={`font-medium text-[11px] leading-tight ${search.tab === "stock"
										? "text-primary"
										: "text-muted-foreground"
									}`}
							>
								Stok
							</span>
						</Link>
					</div>
				</nav>
			)}
		</div>
	);
}


function PermissionDenied({ onBack }: { onBack: () => void }) {
	return (
		<motion.div 
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			className="flex h-full w-full flex-col items-center justify-center p-8 text-center"
		>
			<div className="relative mb-8">
				<div className="absolute -inset-4 rounded-full bg-destructive/10 blur-2xl animate-pulse" />
				<div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-card border border-border shadow-2xl">
					<Sparkles className="absolute -top-2 -right-2 h-8 w-8 text-amber-500 animate-bounce" />
					<Users className="h-12 w-12 text-destructive" />
				</div>
			</div>

			<div className="max-w-md space-y-4">
				<h2 className="text-3xl font-black tracking-tight uppercase">Akses Terbatas</h2>
				<p className="text-muted-foreground font-medium leading-relaxed">
					Maaf, Anda tidak memiliki izin yang diperlukan untuk mengakses fitur ini. 
					Silakan hubungi administrator untuk memperbarui level akses role Anda.
				</p>
			</div>

			<div className="mt-12 flex flex-col items-center gap-4">
				<button
					onClick={onBack}
					className="group relative flex h-12 items-center gap-3 overflow-hidden rounded-2xl bg-primary px-8 font-bold text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-primary/25 active:scale-95"
				>
					<ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
					<span>Kembali ke Beranda</span>
				</button>
				
				<p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">
					Keamanan Sistem Djiwa Tentram
				</p>
			</div>
		</motion.div>
	);
}

/* Sidebar Section Header */
function SidebarSection({
	label,
	isCollapsed,
}: {
	label: string;
	isCollapsed: boolean;
}) {
	return (
		<div className="mt-4 mb-1 first:mt-0">
			{isCollapsed ? (
				<div className="mx-auto h-px w-6 rounded-full bg-border" />
			) : (
				<span className="px-3 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-widest">
					{label}
				</span>
			)}
		</div>
	);
}

/* Desktop Sidebar NavLink */
function DesktopNavLink({
	to,
	icon,
	label,
	activeOptions,
	isCollapsed,
	permission,
}: {
	to: string;
	icon: React.ReactNode;
	label: string;
	activeOptions?: { exact?: boolean };
	isCollapsed: boolean;
	permission?: string;
}) {
	const { isAdmin, role } = useYumiAuth();
	const hasPermission = !permission || isAdmin || role?.permissions?.includes(permission);

	if (!hasPermission) return null;

	return (
		<Link
			activeOptions={activeOptions}
			activeProps={{
				className: "bg-primary text-primary-foreground shadow-sm",
			}}
			className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-sm transition-all ${isCollapsed ? "justify-center px-0" : ""
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

/* Desktop Sidebar Sub-NavLink (for collapsible sections) */
function DesktopSubNavLink({
	to,
	icon,
	label,
	activeOptions,
	permission,
}: {
	to: string;
	icon: React.ReactNode;
	label: string;
	activeOptions?: { exact?: boolean };
	permission?: string;
}) {
	const { isAdmin, role } = useYumiAuth();
	const hasPermission = !permission || isAdmin || role?.permissions?.includes(permission);

	if (!hasPermission) return null;

	return (
		<Link
			activeOptions={activeOptions}
			activeProps={{
				className: "bg-primary/10 text-primary",
			}}
			className="flex items-center gap-2 rounded-md px-2 py-1.5 font-medium text-xs transition-all"
			inactiveProps={{
				className: "text-muted-foreground hover:bg-muted hover:text-foreground",
			}}
			to={to}
		>
			<span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
			<span className="truncate">{label}</span>
		</Link>
	);
}
