import { useNavigate, useLocation } from "@tanstack/react-router";
import { Home, CalendarDays, Camera, Bell, User } from "lucide-react";

type NavItem = {
  label: string;
  icon: typeof Home;
  getRoute: (baseRoute: string) => string;
  isActive: (currentPath: string, baseRoute: string) => boolean;
  badgeKey?: string;
};

function makeItems(baseRoute: string): NavItem[] {
  return [
    {
      label: "Beranda",
      icon: Home,
      getRoute: () => "/beranda",
      isActive: (path, br) => path === `${br}/beranda`,
    },
    {
      label: "Jadwal",
      icon: CalendarDays,
      getRoute: () => "/jadwal",
      isActive: (path, br) => path === `${br}/jadwal`,
    },
    {
      label: "Absensi",
      icon: Camera,
      getRoute: () => "/absensi",
      isActive: (path, br) => path === `${br}/absensi`,
    },
    {
      label: "Notifikasi",
      icon: Bell,
      getRoute: () => "/notifikasi",
      isActive: (path, br) => path === `${br}/notifikasi`,
      badgeKey: "notifikasi",
    },
    {
      label: "Profil",
      icon: User,
      getRoute: () => "/profil",
      isActive: (path, br) => path === `${br}/profil`,
    },
  ];
}

export function BottomNavbar({
  baseRoute,
  unreadCounts,
}: {
  baseRoute: string;
  unreadCounts?: Record<string, number>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const items = makeItems(baseRoute);
  const username = baseRoute.replace("/", "");

  return (
    <nav className="z-20 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
      <div className="mx-auto flex max-w-2xl px-1 py-1">
        {items.map((item) => {
          const Icon = item.icon;
          const childRoute = item.getRoute(baseRoute);
          const active = item.isActive(location.pathname, baseRoute);
          const badgeCount = item.badgeKey ? (unreadCounts?.[item.badgeKey] ?? 0) : 0;
          return (
            <button
              key={item.label}
              onClick={() =>
                navigate({
                  to: `/$username${childRoute}` as any,
                  params: { username } as any,
                })
              }
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-all duration-200 active:scale-95 ${
                active
                  ? "text-blue-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-6 w-6 transition-all ${
                    active ? "drop-shadow-[0_0_5px_rgba(37,99,235,0.3)]" : ""
                  }`}
                />
                {badgeCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[11px] font-black leading-none text-white shadow-sm">
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider leading-none ${
                  active ? "opacity-100" : "opacity-60"
                }`}
              >
                {item.label}
              </span>
              {active && (
                <div className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-lg" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
