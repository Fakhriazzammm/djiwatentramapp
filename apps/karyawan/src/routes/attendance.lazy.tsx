import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, History, LogIn, LogOut, CalendarDays, ChevronLeft, ChevronRight, User } from "lucide-react";
import { useYumiAuth } from "@yumipos/web-shared";
import { toast } from "sonner";
import { PersonalSchedule } from "@yumipos/web-shared/components/attendance/PersonalSchedule";
import { useHybridAttendanceSchedules } from "@yumipos/web-shared";
import { Button } from "@yumipos/web-shared/components/ui/button";
import { cn } from "@yumipos/web-shared";

export const Route = createLazyFileRoute("/attendance")({
  component: KaryawanAttendancePage,
});

function KaryawanAttendancePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user } = useYumiAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { data: schedules, isLoading: schedulesLoading } = useHybridAttendanceSchedules(selectedDate);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: "/login" as any, replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Redirect to profile if not loading
  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4">
        <div className="animate-pulse text-sm text-muted-foreground">Memuat...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  const today = new Date();
  const isToday =
    selectedDate.toDateString() === today.toDateString();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Top Bar */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2.5">
          <button
            type="button"
            onClick={() => navigate({ to: `/${user.slug}` as any, replace: true })}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Kembali
          </button>
          <h1 className="text-sm font-black uppercase tracking-widest text-foreground">
            Absensi
          </h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 py-4 space-y-4">
        {/* Staff Info Bar */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-white px-4 py-3 shadow-sm"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">{user.name}</p>
            <p className="text-[11px] font-medium text-muted-foreground">
              Absensi & Jadwal Kerja
            </p>
          </div>
        </motion.div>

        {/* Date Navigation */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center justify-between rounded-2xl border border-border/60 bg-white px-4 py-3 shadow-sm"
        >
          <button
            type="button"
            onClick={handlePrevDay}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-black text-foreground">
              {selectedDate.toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            {isToday && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Hari Ini
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleNextDay}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </motion.div>

        {/* Schedule View */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
              Jadwal Shift
            </h2>
          </div>
          <div className="p-3">
            {schedulesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              <PersonalSchedule
                schedules={schedules ?? []}
                selectedDate={selectedDate}
                onPrevDay={handlePrevDay}
                onNextDay={handleNextDay}
              />
            )}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-border/60 bg-white shadow-sm"
        >
          <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-black uppercase tracking-wider text-foreground">
              Catatan Absensi
            </h2>
          </div>
          <div className="p-4 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Riwayat absensi tersedia di halaman profil
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: `/${user.slug}` as any, replace: true })}
              className="mt-3 rounded-xl text-xs font-bold"
            >
              Buka Profil
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
