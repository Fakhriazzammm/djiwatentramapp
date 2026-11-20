// Pengumuman KOL: kirim informasi dari admin ke portal KOL (Notifikasi + banner Beranda).
import { useMemo } from "react";
import { useYumiAuth } from "@/hooks/useYumiAuth";
import { isAdminLevelRole } from "@/lib/admin-access";
import { KolAnnouncementComposer, type AnnouncementApi } from "../../../../../../packages/djiwaapps-web-shared/src/components/kol-announcement-composer";
import { NoAccess, Page, PageHeader } from "./kol-ui";

const API = String(import.meta.env.VITE_MANAGER_API_URL?.trim() || "https://api.djiwatentram.web.id").replace(/\/$/, "");
const BASE = `${API}/api/admin-manager/kol-announcements`;
const ERRORS: Record<string, string> = {
  INVALID_ANNOUNCEMENT: "Pengumuman belum valid. Isi judul (min. 3 huruf) dan isi (min. 5 huruf).", CAMPAIGN_REQUIRED: "Pilih kampanye tujuan.",
  RECIPIENTS_REQUIRED: "Pilih minimal satu KOL.", UNAUTHORIZED: "Sesi admin berakhir. Masuk ulang.", FORBIDDEN: "Akses ditolak.",
};

export function KolAnnouncementsPage() {
  const { token, isAdmin, role } = useYumiAuth();
  const canManage = Boolean(token && (isAdmin || isAdminLevelRole(role?.name)));
  const api = useMemo<AnnouncementApi>(() => {
    const call = async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
      if (!token) throw new Error("Sesi admin tidak tersedia atau telah berakhir. Masuk ulang.");
      const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(ERRORS[String(data.error)] || String(data.error || `Permintaan gagal (${res.status})`));
      return data.data as T;
    };
    return {
      load: () => call("") ,
      send: (input) => call("", "POST", input),
      archive: async (id) => { await call(`/${id}/archive`, "POST"); },
    };
  }, [token]);
  if (!canManage) return <NoAccess />;
  return (
    <Page>
      <PageHeader title="Pengumuman KOL" description="Kirim informasi ke portal KOL. Muncul di Notifikasi, dan di banner Beranda bila disematkan. Pantau siapa yang sudah membaca." />
      <KolAnnouncementComposer api={api} />
    </Page>
  );
}
