import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
import { useHybridActiveMiniGameByBrand } from "@/hooks/use-hybrid-minigames-data";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
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
  illustration?: Djiwa3DIconName;
}

interface CustomerMenuGridProps {
  baseRoute: string;
}

const menuItems: MenuItem[] = [
  { label: "Riwayat", icon: ClipboardList, menuId: "riwayat", route: "/$username/riwayat", illustration: "order-receipt" },
  { label: "Poin Saya", icon: Coins, menuId: "poin", route: "/$username/poin", illustration: "loyalty-points" },
  { label: "Minigames", icon: Gamepad2, menuId: "minigames", route: "/$username/minigames" },
  { label: "Promo", icon: Tags, menuId: "promo", route: "/$username/promo", illustration: "promo-voucher" },
  { label: "Favorit", icon: Star, menuId: "favorit", route: "/$username/favorit", illustration: "customer-food-ordering" },
  { label: "Profil", icon: UserRound, menuId: "profile", route: "/$username/profile", illustration: "employee-profile" },
  { label: "Notifikasi", icon: Bell, menuId: "notifikasi", route: "/$username/notifikasi", illustration: "notifications-alerts" },
];

export function CustomerMenuGrid({ baseRoute }: CustomerMenuGridProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const activeMiniGame = useHybridActiveMiniGameByBrand(import.meta.env.VITE_BRAND_SLUG || "djiwatentram");
  const visibleMenuItems = menuItems.filter((item) => item.menuId !== "minigames" || Boolean(activeMiniGame));

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      className="mt-3 grid grid-cols-3 gap-2.5"
    >
      {visibleMenuItems.map((item) => {
        const Icon = item.icon;

        return (
          <motion.button
          key={item.menuId}
          variants={{
            hidden: { opacity: 0, y: 12 },
            visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 } },
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          aria-label={item.label}
          type="button"
          onClick={() => navigate({ to: item.route as any, params: { username: baseRoute.replace("/", "") } } as any)}
          className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-[20px] border border-border bg-card p-2 shadow-sm transition-all duration-[180ms] hover:border-primary/20 hover:shadow-md"
        >
          {item.illustration ? (
            <Djiwa3DIcon name={item.illustration} size="sm" alt="" className="h-10 w-10" />
          ) : (
            <Icon aria-hidden="true" className="h-6 w-6 text-gray-700" strokeWidth={2} />
          )}
          <span className="text-center text-[11px] font-bold text-gray-700 leading-tight">
            {item.label}
          </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
