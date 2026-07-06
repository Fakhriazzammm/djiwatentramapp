import { createLazyFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useHybridCurrentlyInStore, useHybridPublicUsers, useHybridSiteSettings } from "@yumipos/web-shared";
import { useYumiAuth } from "@yumipos/web-shared";
import { Coffee, ExternalLink, Send, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export const Route = createLazyFileRoute("/$username/absensi")({
  component: KaryawanAttendancePage,
});

function KaryawanAttendancePage() {
  const navigate = useNavigate();
  const { username } = useParams({ from: "/$username/absensi" as any }) as { username: string };
  const [refreshCount, setRefreshCount] = useState(0);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
    slug: string;
    isCurrentlyIn: boolean;
    roleName: string;
  } | null>(null);

  const siteSettings = useHybridSiteSettings();
  const allStaff = useHybridPublicUsers();
  const currentlyIn = useHybridCurrentlyInStore(refreshCount);
  const { user: authUser, isAuthenticated } = useYumiAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/login" as any, replace: true });
      return;
    }
    if (!authUser || !Array.isArray(allStaff) || allStaff.length === 0) return;
    const matched = allStaff.find((s: any) => {
      if (authUser._id && String(s._id) === String(authUser._id)) return true;
      if (authUser.slug && s.slug && String(s.slug) === String(authUser.slug)) return true;
      if (authUser.username && s.username && String(s.username) === String(authUser.username)) return true;
      return false;
    });
    if (matched) handleUserSelect(matched);
  }, [isAuthenticated, authUser, allStaff]);

  useEffect(() => {
    if (!selectedUser?.id || !currentlyIn) return;
    const isIn = currentlyIn.some((s: any) => s._id === selectedUser.id);
    setSelectedUser((prev) => (prev && prev.isCurrentlyIn !== isIn ? { ...prev, isCurrentlyIn: isIn } : prev));
  }, [selectedUser?.id, currentlyIn]);

  const handleUserSelect = (staff: any) => {
    const isCurrentlyIn = currentlyIn?.some((s: any) => s._id === staff._id);
    setSelectedUser({ id: staff._id, name: staff.name, slug: staff.slug, isCurrentlyIn: !!isCurrentlyIn, roleName: staff.roleName || "" });
  };

  const openBotTelegram = useCallback(() => {
    window.open("https://t.me/yumihrdbot", "_blank");
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-card text-primary shadow-sm">
            <Coffee className="h-4 w-4" />
          </div>
          <h1 className="text-sm font-bold tracking-tight">Absensi</h1>
        </div>
      </div>

      {selectedUser ? (
        <div className="mx-auto w-full max-w-sm space-y-4 pt-4">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold text-sm ${selectedUser?.isCurrentlyIn ? "bg-emerald-500 text-white" : "bg-primary text-white"}`}>
              {selectedUser?.name?.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{selectedUser?.name}</p>
              <p className="text-[10px] font-semibold text-muted-foreground">
                {selectedUser?.isCurrentlyIn ? "Sedang Bertugas" : "Sedang Off"}
              </p>
            </div>
            <div className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${selectedUser?.isCurrentlyIn ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
              {selectedUser?.isCurrentlyIn ? "KELUAR" : "MASUK"}
            </div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50 p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg shadow-sky-500/20">
                <Send className="h-8 w-8" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-sm text-sky-900">Absensi via Telegram Bot</p>
              <p className="text-[11px] text-sky-700">
                Absen masuk/keluar, cek status, dan lihat rekap bulanan langsung dari bot Telegram.
              </p>
            </div>
            <button
              onClick={openBotTelegram}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 font-bold text-sm text-white shadow-md transition-all hover:bg-sky-600 active:scale-[0.97]"
            >
              <ExternalLink className="h-4 w-4" />
              BUKA BOT TELEGRAM
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs font-bold text-muted-foreground">Memuat data...</p>
          </div>
        </div>
      )}
    </div>
  );
}
