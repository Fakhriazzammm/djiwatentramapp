import { Djiwa3DIcon, type Djiwa3DIconName } from "@yumipos/web-shared";
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
  illustration?: Djiwa3DIconName;
}

interface MenuGridProps {
  baseRoute: string;
}

const menuItems: MenuItem[] = [
  // Row 1
  { label: "Absensi", icon: Clock3, menuId: "absensi", route: "/$username/absensi", action: "navigate", illustration: "employee-attendance-check-in" },
  { label: "Rekap Absensi", icon: NotebookText, menuId: "rekap", route: "/$username/rekap-absensi", action: "navigate", illustration: "sales-report" },
  { label: "Jadwal", icon: CalendarDays, menuId: "jadwal", route: "/$username/jadwal", action: "navigate", illustration: "work-schedule" },
  { label: "Izin/Cuti/Sakit", icon: CalendarOff, menuId: "izin", route: "/$username/izin", action: "navigate", illustration: "notifications-alerts" },
  // Row 2
  { label: "Slip Gaji", icon: CircleDollarSign, menuId: "slip-gaji", route: "/$username/slip-gaji", action: "navigate", illustration: "payroll-payslip" },
  { label: "Kontrak", icon: FileText, menuId: "kontrak", route: "/$username/kontrak", action: "navigate", illustration: "employee-profile" },
  { label: "Grup Telegram", icon: Send, menuId: "telegram", action: "external", illustration: "notifications-alerts" },
  { label: "Leaderboard Bonus", icon: Trophy, menuId: "leaderboard", route: "/$username/leaderboard", action: "navigate", illustration: "loyalty-points" },
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
    <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-4 gap-2 sm:gap-3">
      {menuItems.map((item) => {
        const Icon = item.icon;

        return (
          <motion.button
          key={item.menuId}
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 25, mass: 0.8 } } }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
          onClick={() => handleClick(item)}
          aria-label={item.action === "external" ? `${item.label}, buka tautan eksternal` : item.label}
          className="karyawan-card flex min-h-24 w-full min-w-0 flex-col items-center justify-center gap-1 border border-border/60 bg-card p-2 transition-all hover:border-primary/20 active:scale-[.97]"
        >
          {item.illustration ? (
            <Djiwa3DIcon alt="" className="h-10 w-10 shrink-0" name={item.illustration} size="sm" />
          ) : (
            <Icon aria-hidden="true" className="h-6 w-6 text-gray-700" strokeWidth={2} />
          )}
          <span className="text-center text-[11px] font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">
            {item.label}
          </span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
