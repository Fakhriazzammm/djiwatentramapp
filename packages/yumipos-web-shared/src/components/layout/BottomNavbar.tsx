import { useLocation } from "@tanstack/react-router";
import { Home, Camera, Calendar, User } from "lucide-react";

type NavItem = {
	label: string;
	icon: typeof Home;
	getRoute: (baseRoute: string) => string;
	isActive: (currentPath: string, baseRoute: string) => boolean;
};

function makeItems(baseRoute: string): NavItem[] {
	return [
		{
			label: "Beranda",
			icon: Home,
			getRoute: (br) => `${br}/beranda`,
			isActive: (path, br) => path === `${br}/beranda`,
		},
		{
			label: "Absensi",
			icon: Camera,
			getRoute: (br) => `${br}/absensi`,
			isActive: (path, br) => path === `${br}/absensi`,
		},
		{
			label: "Jadwal",
			icon: Calendar,
			getRoute: (br) => `${br}/jadwal`,
			isActive: (path, br) => path === `${br}/jadwal`,
		},
		{
			label: "Profil",
			icon: User,
			getRoute: (br) => `${br}/profil`,
			isActive: (path, br) => path === `${br}/profil`,
		},
	];
}

export function BottomNavbar({ baseRoute }: { baseRoute: string }) {
	const location = useLocation();
	const items = makeItems(baseRoute);

	const handleNav = (route: string) => {
		// Use window.location for reliable SPA navigation
		// TanStack Router navigate with dynamic params can be unreliable
		window.location.href = route;
	};

	return (
		<nav className="z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md">
			<div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-1">
				{items.map((item) => {
					const Icon = item.icon;
					const route = item.getRoute(baseRoute);
					const active = item.isActive(location.pathname, baseRoute);
					return (
						<button
							key={item.label}
							onClick={() => handleNav(route)}
							className={`relative flex flex-col items-center gap-0.5 px-4 py-1.5 transition-all active:scale-95 ${
								active
									? "text-primary"
									: "text-muted-foreground/50 hover:text-muted-foreground"
							}`}
						>
							<Icon
								className={`h-5 w-5 transition-all ${
									active ? "drop-shadow-[0_0_5px rgba(37,99,235,0.3)]" : ""
								}`}
							/>
							<span
								className={`text-[9px] font-bold uppercase tracking-wider ${
									active ? "opacity-100" : "opacity-60"
								}`}
							>
								{item.label}
							</span>
							{active && (
								<div className="absolute -bottom-[1px] h-0.5 w-10 rounded-full bg-primary" />
							)}
						</button>
					);
				})}
			</div>
		</nav>
	);
}
