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
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-around px-2 py-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={
                "relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 transition-colors " +
                (isActive ? "text-blue-600" : "text-gray-400")
              }
            >
              {/* Active indicator line */}
              {isActive && (
                <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-b bg-blue-600" />
              )}
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-bold leading-none">
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
