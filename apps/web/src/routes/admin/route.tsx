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
	LayoutDashboard,
	LogOut,
	Package,
	Percent,
	Settings,
	Sparkles,
	User,
	Wallet,
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

export const Route = createFileRoute("/admin")({
	component: AdminLayout,
});

function AdminLayout() {
	const navigate = useNavigate();
	const [isCollapsed, setIsCollapsed] = useState(() => {
		if (typeof window !== "undefined") {
			return localStorage.getItem("admin-sidebar-collapsed") === "true";
		}
		return false;
	});

	const settings = useQuery(api.siteSettings.getSettings);
	const storeName = settings?.storeName || "TKM Admin";

	useEffect(() => {
		localStorage.setItem("admin-sidebar-collapsed", String(isCollapsed));
	}, [isCollapsed]);

	const location = useLocation();
	const isAIChat = location.pathname === "/admin/ai-chat";

	return (
		<div className="flex h-full w-full overflow-hidden bg-background">
			{/* Sidebar */}
			<aside
				className={`relative flex flex-col border-border border-r bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out ${
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
					<NavLink
						activeOptions={{ exact: true }}
						icon={<LayoutDashboard />}
						isCollapsed={isCollapsed}
						label="Dasbor"
						to="/admin"
					/>
					<NavLink
						icon={<Package />}
						isCollapsed={isCollapsed}
						label="Produk"
						to="/admin/products"
					/>
					<NavLink
						icon={<Archive />}
						isCollapsed={isCollapsed}
						label="Inventaris"
						to="/admin/inventory"
					/>
					<NavLink
						icon={<Wallet />}
						isCollapsed={isCollapsed}
						label="Keuangan"
						to="/admin/finance"
					/>
					<NavLink
						icon={<ClipboardList />}
						isCollapsed={isCollapsed}
						label="Pesanan"
						to="/admin/orders"
					/>
					<NavLink
						icon={<Percent />}
						isCollapsed={isCollapsed}
						label="Promosi"
						to="/admin/discounts"
					/>
					<NavLink
						icon={<Calculator />}
						isCollapsed={isCollapsed}
						label="HPP Kalkulator"
						to="/admin/hpp-calculator"
					/>
					<NavLink
						icon={<Sparkles />}
						isCollapsed={isCollapsed}
						label="AI Chat"
						to="/admin/ai-chat"
					/>
					<NavLink
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

			{/* Main Content */}
			<main className="flex flex-1 flex-col overflow-hidden bg-background">
				{!isAIChat && (
					<header className="flex h-14 shrink-0 items-center justify-between border-border border-b px-4">
						<h1 className="font-bold text-lg">Selamat Datang, Admin</h1>
						<div className="flex items-center gap-3">
							<DropdownMenu>
								<DropdownMenuTrigger
									render={(props) => (
										<button
											{...props}
											className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs transition-all hover:scale-105 hover:bg-primary/20 active:scale-95"
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
				)}

				<div className={`flex-1 overflow-y-auto ${isAIChat ? "p-0" : "p-4"}`}>
					<Outlet />
				</div>

				{!isAIChat && (
					<footer className="border-border border-t bg-muted/20 px-4 py-2 text-center text-muted-foreground text-xs">
						Versi 0.0.01 Murni POS | powered by Yumi POS | Develop by Zantara
						Technology
					</footer>
				)}
			</main>
		</div>
	);
}

function NavLink({
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
