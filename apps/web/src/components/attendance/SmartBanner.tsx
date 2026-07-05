import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Megaphone, Sparkles } from "lucide-react";

// ============================================================
// TYPES
// ============================================================

type Announcement = {
  id: string;
  title: string;
  subtitle: string | null;
  content: string | null;
  banner_image_url: string | null;
  priority: number;
};

type BannerState =
  | { status: "loading" }
  | { status: "announcement"; data: Announcement }
  | { status: "fallback"; greeting: string };

// ============================================================
// HELPER: Time-based greeting in Indonesian
// ============================================================

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
}

// ============================================================
// HELPER: Day name in Indonesian
// ============================================================

function getDayName(): string {
  const days = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  return days[new Date().getDay()];
}

function getDateFormatted(): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const d = new Date();
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ============================================================
// COMPONENT
// ============================================================

export function SmartBanner() {
  const [banner, setBanner] = useState<BannerState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function fetchAnnouncement() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("announcements")
          .select("id, title, subtitle, content, banner_image_url, priority")
          .eq("is_active", true)
          .order("priority", { ascending: false })
          .limit(1);

        if (cancelled) return;

        if (fetchError) {
          console.warn("[SmartBanner] Fetch error:", fetchError.message);
          setBanner({ status: "fallback", greeting: getGreeting() });
          return;
        }

        if (data && data.length > 0) {
          setBanner({ status: "announcement", data: data[0] as Announcement });
        } else {
          setBanner({ status: "fallback", greeting: getGreeting() });
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[SmartBanner] Unexpected error:", err);
        setBanner({ status: "fallback", greeting: getGreeting() });
      }
    }

    fetchAnnouncement();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={cn(
        "relative h-32 w-full overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-slate-800 to-slate-900",
        "shadow-lg"
      )}
    >
      <AnimatePresence mode="wait">
        {banner.status === "loading" && <LoadingBanner key="loading" />}
        {banner.status === "announcement" && (
          <AnnouncementBanner key="announcement" announcement={banner.data} />
        )}
        {banner.status === "fallback" && (
          <FallbackBanner key="fallback" greeting={banner.greeting} />
        )}
      </AnimatePresence>
    </div>
  );
}

SmartBanner.displayName = "SmartBanner";

// ============================================================
// LOADING STATE
// ============================================================

function LoadingBanner() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full items-center gap-3 px-6"
    >
      <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
      <div className="flex flex-col gap-2">
        <div className="h-4 w-44 animate-pulse rounded bg-white/10" />
        <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
      </div>
      {/* Decorative placeholder */}
      <div className="absolute right-4 top-1/2 h-16 w-16 -translate-y-1/2 animate-pulse rounded-xl bg-white/5" />
    </motion.div>
  );
}

// ============================================================
// ANNOUNCEMENT BANNER
// ============================================================

function AnnouncementBanner({
  announcement,
}: {
  announcement: Announcement;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative flex h-full items-center px-6"
    >
      {/* Icon */}
      <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Megaphone className="h-5 w-5 text-amber-300" />
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col justify-center">
        <h3 className="text-base font-bold leading-tight text-white line-clamp-1">
          {announcement.title}
        </h3>
        {announcement.subtitle && (
          <p className="mt-0.5 text-sm leading-snug text-white/70 line-clamp-2">
            {announcement.subtitle}
          </p>
        )}
      </div>

      {/* Decorative image on the right */}
      {announcement.banner_image_url ? (
        <div className="absolute right-4 top-1/2 h-20 w-20 -translate-y-1/2 overflow-hidden rounded-xl opacity-40">
          <img
            src={announcement.banner_image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="absolute right-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-xl bg-white/5" />
      )}

      {/* Subtle gradient overlay on the decorative side */}
      <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-white/5 to-transparent" />
    </motion.div>
  );
}

// ============================================================
// FALLBACK BANNER (greeting + date)
// ============================================================

function FallbackBanner({ greeting }: { greeting: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative flex h-full items-center px-6"
    >
      {/* Icon */}
      <div className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Sparkles className="h-5 w-5 text-sky-300" />
      </div>

      {/* Text content */}
      <div className="flex flex-1 flex-col justify-center">
        <h3 className="text-base font-bold leading-tight text-white">
          {greeting}!
        </h3>
        <p className="mt-0.5 text-sm leading-snug text-white/60">
          {getDayName()}, {getDateFormatted()}
        </p>
      </div>

      {/* Decorative placeholder */}
      <div className="absolute right-4 top-1/2 h-16 w-16 -translate-y-1/2 rounded-xl bg-white/5" />
    </motion.div>
  );
}
