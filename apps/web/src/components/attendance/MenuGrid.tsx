import { motion } from "framer-motion";
import type { FC } from "react";

// ─── TYPES ───

interface MenuItem {
	label: string;
	emoji: string;
	menuId: string;
}

interface MenuGridProps {
	onNavigate: (menuId: string) => void;
	isUnlocked?: boolean;
}

// ─── MENU ITEMS ───

const menuItems: MenuItem[] = [
	// Row 1
	{ label: "Absensi", emoji: "📋", menuId: "absensi" },
	{ label: "Rekap Absensi", emoji: "📊", menuId: "rekap-absensi" },
	{ label: "Jadwal", emoji: "📅", menuId: "jadwal" },
	{ label: "Izin/Cuti/Sakit", emoji: "🏥", menuId: "izin" },
	// Row 2
	{ label: "Slip Gaji", emoji: "💰", menuId: "slip-gaji" },
	{ label: "Kontrak", emoji: "📄", menuId: "kontrak" },
	{ label: "Grup Telegram", emoji: "💬", menuId: "telegram-grup" },
	{ label: "Pusat Bantuan", emoji: "🆘", menuId: "bantuan" },
];

// ─── COMPONENT ───

const MenuGrid: FC<MenuGridProps> = ({ onNavigate, isUnlocked = true }) => {
	if (!isUnlocked) return null;

	return (
		<div className="grid grid-cols-4 gap-3">
			{menuItems.map((item) => (
				<motion.button
					key={item.menuId}
					whileHover={{ scale: 1.02 }}
					whileTap={{ scale: 0.95 }}
					onClick={() => onNavigate(item.menuId)}
					className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
				>
					<span className="text-2xl">{item.emoji}</span>
					<span className="text-center text-[10px] font-bold text-gray-700">
						{item.label}
					</span>
				</motion.button>
			))}
		</div>
	);
};

export default MenuGrid;
