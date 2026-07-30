import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Bike,
  ClipboardList,
  Coins,
  Gamepad2,
  Star,
  Tags,
  UserRound,
  type LucideIcon,
} from "lucide-react";

interface MenuItem {
  label: string;
  icon: LucideIcon;
  menuId: string;
  route: string;
}

interface CustomerMenuGridProps {
  baseRoute: string;
}

const menuItems: MenuItem[] = [
  { label: "Pesan", icon: Bike, menuId: "order", route: "/$username/order" },
  { label: "Riwayat", icon: ClipboardList, menuId: "riwayat", route: "/$username/riwayat" },
  { label: "Poin Saya", icon: Coins, menuId: "poin", route: "/$username/poin" },
  { label: "Minigames", icon: Gamepad2, menuId: "minigames", route: "/$username/minigames" },
  { label: "Promo", icon: Tags, menuId: "promo", route: "/$username/promo" },
  { label: "Favorit", icon: Star, menuId: "favorit", route: "/$username/favorit" },
  { label: "Profil", icon: UserRound, menuId: "profile", route: "/$username/profile" },
  { label: "Notifikasi", icon: Bell, menuId: "notifikasi", route: "/$username/notifikasi" },
];

export function CustomerMenuGrid({ baseRoute }: CustomerMenuGridProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      className="grid grid-cols-4 gap-3"
    >
      {menuItems.map((item) => {
        const Icon = item.icon;

        return (
          <motion.button
          key={item.menuId}
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 } },
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate({ to: item.route as any, params: { username: baseRoute.replace("/", "") } })}
          className="flex h-20 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border border-gray-50 bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all hover:shadow-lg hover:border-gray-100"
        >
          <Icon aria-hidden="true" className="h-6 w-6 text-gray-700" strokeWidth={2} />
          <span className="text-center text-[11px] font-bold text-gray-700 leading-tight">
            {item.label}
          </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
