import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";

interface MenuItem {
  label: string;
  emoji: string;
  menuId: string;
  route?: string;
  action?: "navigate" | "tab" | "external";
}

interface MenuGridProps {
  baseRoute: string;
}

const menuItems: MenuItem[] = [
  // Row 1
  { label: "Absensi", emoji: "📋", menuId: "absensi", route: "/$username/absensi", action: "navigate" },
  { label: "Rekap Absensi", emoji: "📊", menuId: "rekap", route: "/$username/profil", action: "navigate" },
  { label: "Jadwal", emoji: "📅", menuId: "jadwal", route: "/$username/jadwal", action: "navigate" },
  { label: "Izin/Cuti/Sakit", emoji: "🏥", menuId: "izin", route: "/$username/izin", action: "navigate" },
  // Row 2
  { label: "Slip Gaji", emoji: "💰", menuId: "slip-gaji", route: "/$username/profil", action: "navigate" },
  { label: "Kontrak", emoji: "📄", menuId: "kontrak", route: "/$username/profil", action: "navigate" },
  { label: "Grup Telegram", emoji: "💬", menuId: "telegram", action: "external" },
  { label: "Pusat Bantuan", emoji: "🆘", menuId: "bantuan", action: "external" },
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
    <div className="grid grid-cols-4 gap-3">
      {menuItems.map((item) => (
        <motion.button
          key={item.menuId}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleClick(item)}
          className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="text-2xl">{item.emoji}</span>
          <span className="text-center text-[10px] font-bold text-gray-700 leading-tight">
            {item.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}
