import { motion } from "framer-motion";
import { Clock, Camera, User, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { SmartBanner } from "@/components/attendance/SmartBanner";
import MenuGrid from "@/components/attendance/MenuGrid";

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat Pagi";
  if (h < 15) return "Selamat Siang";
  if (h < 18) return "Selamat Sore";
  return "Selamat Malam";
};

const getGreetingEmoji = () => {
  const h = new Date().getHours();
  if (h < 11) return "🌅";
  if (h < 15) return "☀️";
  if (h < 18) return "🌤️";
  return "🌙";
};

interface BerandaTabProps {
  staff: {
    _id: string;
    name: string;
    slug: string;
    roleName: string;
    photoUrl?: string | null;
  };
  isUnlocked: boolean;
  onNavigate: (menuId: string) => void;
}

export function BerandaTab({ staff, isUnlocked, onNavigate }: BerandaTabProps) {
  const navigate = useNavigate();
  const now = new Date();
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* ── Header: Logo + Greeting + Avatar ── */}
      <div className="flex items-start justify-between px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Logo Djiwa Tentram — stylized tree */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-lg">🌳</span>
          </div>
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.15em] text-muted-foreground/70">
              Djiwa Tentram Internal
            </p>
            <p className="text-xs font-medium text-muted-foreground truncate">
              {getGreetingEmoji()} {getGreeting()}, ({timeStr})
            </p>
            <h1 className="text-sm font-black tracking-tight truncate">
              {staff.name || "—"}
            </h1>
            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
              {staff.roleName || "Karyawan"}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          {staff.photoUrl ? (
            <img
              src={staff.photoUrl}
              alt={staff.name}
              className="h-10 w-10 rounded-xl object-cover shadow-sm border-2 border-border"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-base font-black text-primary border-2 border-border">
              {staff.name?.charAt(0) || "?"}
            </div>
          )}
          <span className="text-[8px] text-muted-foreground/60 font-medium">{dateStr}</span>
        </div>
      </div>

      {/* ── Smart Banner ── */}
      <SmartBanner />

      {/* ── Menu Grid ── */}
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider text-foreground mb-3 px-1">
          Menu
        </h2>
        <MenuGrid onNavigate={onNavigate} isUnlocked={isUnlocked} />
      </div>

      {/* ── Quick Action CTA ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Button
          className="h-12 w-full rounded-xl text-sm font-black shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          onClick={() => navigate({ to: "/attendance" as any })}
        >
          <Camera className="h-4 w-4" />
          ABSENSI SEKARANG
        </Button>
      </motion.div>
    </motion.div>
  );
}
