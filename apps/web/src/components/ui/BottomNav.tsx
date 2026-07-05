import { House, Calendar, ScanFace, Bell, User } from "lucide-react";
import type { FC } from "react";

export type BottomNavTab =
  | "beranda"
  | "jadwal"
  | "absensi"
  | "notifikasi"
  | "profile";

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
  isLocked?: boolean;
}

// ─── BOTTOM NAV ───
const tabs: { key: BottomNavTab; label: string; icon: FC<{ className?: string }> }[] = [
  { key: "beranda", label: "Beranda", icon: House },
  { key: "jadwal", label: "Jadwal", icon: Calendar },
  { key: "absensi", label: "Absensi", icon: ScanFace },
  { key: "notifikasi", label: "Notifikasi", icon: Bell },
  { key: "profile", label: "Profile", icon: User },
];

const BottomNav: FC<BottomNavProps> = ({ activeTab, onTabChange, isLocked }) => {
  if (isLocked) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[68px] bg-white border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-4">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-around">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={
                "flex flex-col items-center justify-center gap-1 transition-all duration-200 " +
                (isActive ? "text-blue-600 scale-105" : "text-gray-400 hover:text-gray-600")
              }
            >
              {isActive && (
                <div className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-lg" />
              )}
              <Icon className="h-6 w-6" />
              <span className="text-[9px] font-bold tracking-wider uppercase leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
