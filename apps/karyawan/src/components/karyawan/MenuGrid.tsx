import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarOff,
  CircleDollarSign,
  Clock3,
  FileText,
  NotebookText,
  Send,
  Trophy,
  type LucideIcon,
} from "lucide-react";

interface MenuItem {
  label: string;
  icon: LucideIcon;
  menuId: string;
  route?: string;
  action?: "navigate" | "tab" | "external";
}

interface MenuGridProps {
  baseRoute: string;
}

const menuItems: MenuItem[] = [
  // Row 1
  { label: "Absensi", icon: Clock3, menuId: "absensi", route: "/$username/absensi", action: "navigate" },
  { label: "Rekap Absensi", icon: NotebookText, menuId: "rekap", route: "/$username/rekap-absensi", action: "navigate" },
  { label: "Jadwal", icon: CalendarDays, menuId: "jadwal", route: "/$username/jadwal", action: "navigate" },
  { label: "Izin/Cuti/Sakit", icon: CalendarOff, menuId: "izin", route: "/$username/izin", action: "navigate" },
  // Row 2
  { label: "Slip Gaji", icon: CircleDollarSign, menuId: "slip-gaji", route: "/$username/slip-gaji", action: "navigate" },
  { label: "Kontrak", icon: FileText, menuId: "kontrak", route: "/$username/kontrak", action: "navigate" },
  { label: "Grup Telegram", icon: Send, menuId: "telegram", action: "external" },
  { label: "Leaderboard Bonus", icon: Trophy, menuId: "leaderboard", route: "/$username/leaderboard", action: "navigate" },
];

export function MenuGrid({ baseRoute }: MenuGridProps) {
  const navigate = useNavigate();

  const handleClick = (item: MenuItem) => {
    if (item.action === "navigate" && item.route) {
      navigate({ to: item.route as any, params: { username: baseRoute.replace("/", "") } });
    } else if (item.action === "external") {
      window.open("https://t.me/addlist/076D_FFRNFw5ZWI1", "_blank");
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-4 gap-3">
      {menuItems.map((item) => {
        const Icon = item.icon;

        return (
          <motion.button
          key={item.menuId}
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 } } }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
          onClick={() => handleClick(item)}
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
