import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { createClient } from "@yumipos/web-shared/lib/client";
import { Megaphone, Sparkles } from "lucide-react";

type Announcement = {
  id: string;
  title: string;
  subtitle: string | null;
  content: string | null;
  banner_image_url: string | null;
  priority: number;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

export function SmartBanner() {
  const [banner, setBanner] = useState<{
    status: "loading" | "announcement" | "fallback";
    title: string;
    subtitle: string;
  }>({ status: "loading", title: "", subtitle: "" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("announcements")
          .select("id, title, subtitle, content, banner_image_url, priority")
          .eq("is_active", true)
          .order("priority", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mounted) {
          if (data) {
            setBanner({
              status: "announcement",
              title: data.title,
              subtitle: data.subtitle || `Cek jadwal minggu ini di menu Jadwal!`,
            });
          } else {
            setBanner({
              status: "fallback",
              title: `${getGreeting()}, hari yang produktif!`,
              subtitle: `Jangan lupa absen masuk sebelum memulai shift.`,
            });
          }
        }
      } catch {
        if (mounted) {
          setBanner({
            status: "fallback",
            title: `${getGreeting()}!`,
            subtitle: "Semoga harimu menyenangkan.",
          });
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (banner.status === "loading") {
    return (
      <div className="h-24 rounded-2xl bg-gradient-to-r from-gray-800/80 to-gray-600/40 animate-pulse" />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 h-28"
    >
      {/* Decorative stones pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_80%_50%,rgba(255,255,255,0.1)_0%,transparent_60%)]" />
        <div className="absolute bottom-2 right-4 flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-6 w-5 rounded-full bg-gray-400/30"
              style={{ marginTop: `${i * 3}px` }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 flex h-full flex-col justify-center px-5">
        <h3 className="text-sm font-black text-white leading-tight">{banner.title}</h3>
        <p className="mt-0.5 text-[10px] font-medium text-gray-300">
          {banner.subtitle}
        </p>
      </div>
    </motion.div>
  );
}
